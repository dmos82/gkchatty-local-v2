import express, { Request, Response, Router } from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import Article, { IArticle } from '../models/ArticleModel';
import { getLogger } from '../utils/logger';
import mongoose from 'mongoose';

const router: Router = express.Router();
const log = getLogger('articleRoutes');

// GET /api/articles - Get all published articles (with pagination, search, filters)
router.get('/', async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      tag = '',
      author = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = { published: true };

    // Add text search if provided
    if (search) {
      query.$text = { $search: search as string };
    }

    // Add tag filter if provided
    if (tag) {
      query.tags = tag;
    }

    // Add author filter if provided
    if (author) {
      query.author = author;
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const articles = await Article.find(query)
      .populate('author', 'username email')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Article.countDocuments(query);

    log.info({ page: pageNum, limit: limitNum, total }, 'Articles retrieved successfully');

    res.status(200).json({
      success: true,
      data: articles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    log.error({ error }, 'Error fetching articles');
    res.status(500).json({
      success: false,
      message: 'Error fetching articles',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/articles/:id - Get single article by ID or slug
router.get('/:idOrSlug', async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const { idOrSlug } = req.params;

    // Try to find by ID first, then by slug
    let article: (IArticle & mongoose.Document) | null = null;

    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      article = await Article.findById(idOrSlug).populate('author', 'username email');
    }

    if (!article) {
      article = await Article.findOne({ slug: idOrSlug }).populate('author', 'username email');
    }

    if (!article) {
      log.warn({ idOrSlug }, 'Article not found');
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Increment view count (fire and forget)
    Article.findByIdAndUpdate(article._id, { $inc: { viewCount: 1 } }).exec();

    log.info({ articleId: article._id }, 'Article retrieved successfully');

    res.status(200).json({
      success: true,
      data: article,
    });
  } catch (error) {
    log.error({ error }, 'Error fetching article');
    res.status(500).json({
      success: false,
      message: 'Error fetching article',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/articles - Create new article (protected)
router.post('/', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = (req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId) as any;

    if (!userId) {
      log.warn('Unauthorized article creation attempt');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - user not authenticated',
      });
    }

    const { title, content, tags, published, excerpt, featuredImage, slug } = req.body;

    // Validate required fields
    if (!title || !content) {
      log.warn({ title, content }, 'Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Title and content are required',
      });
    }

    // Generate slug if not provided
    let articleSlug = slug;
    if (!articleSlug) {
      articleSlug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-')
        .trim();

      // Add timestamp to ensure uniqueness
      articleSlug += `-${Date.now()}`;
    }

    // Check if slug already exists
    const existingArticle = await Article.findOne({ slug: articleSlug });
    if (existingArticle) {
      log.warn({ slug: articleSlug }, 'Article with this slug already exists');
      return res.status(400).json({
        success: false,
        message: 'Article with this slug already exists',
      });
    }

    // Create new article
    const article = new Article({
      title,
      content,
      author: userId,
      tags: tags || [],
      published: published || false,
      slug: articleSlug,
      excerpt,
      featuredImage,
    });

    await article.save();

    // Populate author before returning
    await article.populate('author', 'username email');

    log.info({ articleId: article._id, userId }, 'Article created successfully');

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: article,
    });
  } catch (error) {
    log.error({ error }, 'Error creating article');
    res.status(500).json({
      success: false,
      message: 'Error creating article',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PUT /api/articles/:id - Update article (protected, author only)
router.put('/:id', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = (req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId) as any;
    const { id } = req.params;

    if (!userId) {
      log.warn('Unauthorized article update attempt');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - user not authenticated',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
    }

    // Find article
    const article = await Article.findById(id);

    if (!article) {
      log.warn({ articleId: id }, 'Article not found');
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Check if user is the author
    if (article.author.toString() !== userId.toString()) {
      log.warn({ articleId: id, userId, authorId: article.author }, 'Unauthorized update attempt');
      return res.status(403).json({
        success: false,
        message: 'Forbidden - you can only update your own articles',
      });
    }

    // Update article fields
    const { title, content, tags, published, excerpt, featuredImage, slug } = req.body;

    if (title !== undefined) article.title = title;
    if (content !== undefined) article.content = content;
    if (tags !== undefined) article.tags = tags;
    if (published !== undefined) article.published = published;
    if (excerpt !== undefined) article.excerpt = excerpt;
    if (featuredImage !== undefined) article.featuredImage = featuredImage;
    if (slug !== undefined) {
      // Check if new slug already exists
      const existingArticle = await Article.findOne({ slug, _id: { $ne: id } });
      if (existingArticle) {
        return res.status(400).json({
          success: false,
          message: 'Article with this slug already exists',
        });
      }
      article.slug = slug;
    }

    await article.save();
    await article.populate('author', 'username email');

    log.info({ articleId: id, userId }, 'Article updated successfully');

    res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: article,
    });
  } catch (error) {
    log.error({ error }, 'Error updating article');
    res.status(500).json({
      success: false,
      message: 'Error updating article',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/articles/:id - Delete article (protected, author only)
router.delete('/:id', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = (req.user && '_id' in req.user ? req.user._id : (req.user as any)?.userId) as any;
    const { id } = req.params;

    if (!userId) {
      log.warn('Unauthorized article deletion attempt');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - user not authenticated',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
    }

    // Find article
    const article = await Article.findById(id);

    if (!article) {
      log.warn({ articleId: id }, 'Article not found');
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Check if user is the author
    if (article.author.toString() !== userId.toString()) {
      log.warn({ articleId: id, userId, authorId: article.author }, 'Unauthorized deletion attempt');
      return res.status(403).json({
        success: false,
        message: 'Forbidden - you can only delete your own articles',
      });
    }

    await Article.findByIdAndDelete(id);

    log.info({ articleId: id, userId }, 'Article deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error) {
    log.error({ error }, 'Error deleting article');
    res.status(500).json({
      success: false,
      message: 'Error deleting article',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/articles/:id/like - Like/unlike article (protected)
router.post('/:id/like', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'like' or 'unlike'

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
    }

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    if (action === 'like') {
      article.likes += 1;
    } else if (action === 'unlike' && article.likes > 0) {
      article.likes -= 1;
    }

    await article.save();

    log.info({ articleId: id, action, likes: article.likes }, 'Article like updated');

    res.status(200).json({
      success: true,
      data: { likes: article.likes },
    });
  } catch (error) {
    log.error({ error }, 'Error updating article likes');
    res.status(500).json({
      success: false,
      message: 'Error updating article likes',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
