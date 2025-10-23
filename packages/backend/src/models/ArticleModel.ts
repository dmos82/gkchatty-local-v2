import mongoose, { Schema, Document } from 'mongoose';

// Define the interface for the Article document
export interface IArticle extends Document {
  title: string;
  content: string;
  author: mongoose.Types.ObjectId;
  tags: string[];
  published: boolean;
  slug: string;
  excerpt?: string;
  featuredImage?: string;
  viewCount: number;
  likes: number;
  createdAt: Date;
  updatedAt: Date;
}

// Define the Mongoose schema
const ArticleSchema = new Schema<IArticle>(
  {
    title: {
      type: String,
      required: [true, 'Article title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      index: true, // Enable text search on title
    },
    content: {
      type: String,
      required: [true, 'Article content is required'],
      trim: true,
      maxlength: [50000, 'Content cannot exceed 50,000 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Article must have an author'],
      index: true, // Enable efficient author queries
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function(tags: string[]) {
          return tags.length <= 10;
        },
        message: 'Cannot have more than 10 tags',
      },
      index: true, // Enable tag-based queries
    },
    published: {
      type: Boolean,
      default: false,
      index: true, // Enable filtering by published status
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // Enable efficient slug lookups
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: [500, 'Excerpt cannot exceed 500 characters'],
    },
    featuredImage: {
      type: String,
      trim: true,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Compound index for efficient queries (author + published + createdAt)
ArticleSchema.index({ author: 1, published: 1, createdAt: -1 });

// Text index for full-text search on title and content
ArticleSchema.index({ title: 'text', content: 'text', tags: 'text' });

// Pre-save hook to generate slug from title if not provided
ArticleSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/--+/g, '-') // Replace multiple hyphens with single
      .trim();
  }
  next();
});

// Create and export the Article model
const Article = mongoose.model<IArticle>('Article', ArticleSchema);

export default Article;
