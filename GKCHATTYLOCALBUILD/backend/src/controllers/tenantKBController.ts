import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { TenantKnowledgeBaseModel as TenantKnowledgeBase } from '../utils/modelFactory';
import { UserKBAccess } from '../models/UserKBAccess';
import logger from '../utils/logger';
import * as s3Helper from '../utils/s3Helper';
import { isS3Storage } from '../utils/storageModeHelper';

const log = logger.child({ module: 'tenantKBController' });

/**
 * Create a new tenant knowledge base
 * @route   POST /api/admin/tenant-kb
 * @access  Private (Admin only)
 */
export const createTenantKB = async (req: Request, res: Response) => {
  try {
    const { name, description, accessType, allowedRoles, allowedUsers, color, icon, shortName } =
      req.body;
    const adminId = req.user?._id;

    log.info({ adminId, name, body: req.body }, '[CreateTenantKB] Creating new tenant KB');

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Knowledge base name is required',
      });
    }

    // Validate admin ID
    if (!adminId) {
      log.error('[CreateTenantKB] No admin ID found in request');
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required',
      });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Generate s3Prefix from slug
    const s3Prefix = `tenant_kb/${slug}/`;

    // Generate shortName if not provided
    const generatedShortName = shortName || name.split(' ')[0].substring(0, 10);

    log.info(
      { slug, s3Prefix, shortName: generatedShortName },
      '[CreateTenantKB] Generated fields'
    );

    // Create the KB
    const newKB = new TenantKnowledgeBase({
      name,
      slug,
      s3Prefix,
      shortName: generatedShortName,
      description,
      accessType: accessType || 'restricted',
      allowedRoles: allowedRoles || [],
      allowedUsers: allowedUsers || [],
      color,
      icon,
      createdBy: adminId,
      lastModifiedBy: adminId,
    });

    log.info({ kbData: newKB.toObject() }, '[CreateTenantKB] About to save KB');

    await newKB.save();

    log.info(
      { kbId: newKB._id, slug: newKB.slug, s3Prefix: newKB.s3Prefix },
      '[CreateTenantKB] KB saved successfully'
    );

    // If S3 storage is enabled, ensure the prefix exists
    if (isS3Storage()) {
      try {
        // Create a marker file to establish the prefix
        const markerKey = `${newKB.s3Prefix}.kb_initialized`;
        await s3Helper.saveFile(markerKey, Buffer.from('initialized'), 'text/plain');
        log.info(
          { kbId: newKB._id, s3Prefix: newKB.s3Prefix },
          '[CreateTenantKB] S3 prefix initialized'
        );
      } catch (s3Error) {
        log.error(
          { error: s3Error, kbId: newKB._id },
          '[CreateTenantKB] Failed to initialize S3 prefix'
        );
        // Continue anyway - prefix will be created on first upload
      }
    }

    log.info(
      { kbId: newKB._id, name: newKB.name },
      '[CreateTenantKB] Tenant KB created successfully'
    );

    return res.status(201).json({
      success: true,
      message: 'Knowledge base created successfully',
      knowledgeBase: newKB,
    });
  } catch (error) {
    log.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined,
        body: req.body,
      },
      '[CreateTenantKB] Error creating tenant KB'
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to create knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all tenant knowledge bases
 * @route   GET /api/admin/tenant-kb
 * @access  Private (Admin only)
 */
export const getAllTenantKBs = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?._id;
    log.info({ adminId }, '[GetAllTenantKBs] Fetching all tenant KBs');

    const knowledgeBases = await TenantKnowledgeBase.find()
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .populate('allowedUsers', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      knowledgeBases,
      count: knowledgeBases.length,
    });
  } catch (error) {
    log.error({ error }, '[GetAllTenantKBs] Error fetching tenant KBs');
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch knowledge bases',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a specific tenant knowledge base
 * @route   GET /api/admin/tenant-kb/:id
 * @access  Private (Admin only)
 */
export const getTenantKBById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;

    log.info({ adminId, kbId: id }, '[GetTenantKBById] Fetching tenant KB');

    const knowledgeBase = await TenantKnowledgeBase.findById(id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .populate('allowedUsers', 'name email');

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    return res.status(200).json({
      success: true,
      knowledgeBase,
    });
  } catch (error) {
    log.error({ error }, '[GetTenantKBById] Error fetching tenant KB');
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update a tenant knowledge base
 * @route   PUT /api/admin/tenant-kb/:id
 * @access  Private (Admin only)
 */
export const updateTenantKB = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;
    const updates = req.body;

    log.info({ adminId, kbId: id }, '[UpdateTenantKB] Updating tenant KB');

    // Don't allow updating certain fields
    delete updates.slug;
    delete updates.s3Prefix;
    delete updates.createdBy;
    delete updates.documentCount;

    updates.lastModifiedBy = adminId;

    const knowledgeBase = await TenantKnowledgeBase.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .populate('allowedUsers', 'name email');

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    log.info({ kbId: id }, '[UpdateTenantKB] Tenant KB updated successfully');

    return res.status(200).json({
      success: true,
      message: 'Knowledge base updated successfully',
      knowledgeBase,
    });
  } catch (error) {
    log.error({ error }, '[UpdateTenantKB] Error updating tenant KB');
    return res.status(500).json({
      success: false,
      message: 'Failed to update knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete a tenant knowledge base
 * @route   DELETE /api/admin/tenant-kb/:id
 * @access  Private (Admin only)
 */
export const deleteTenantKB = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;

    log.info({ adminId, kbId: id }, '[DeleteTenantKB] Deleting tenant KB');

    const knowledgeBase = await TenantKnowledgeBase.findById(id);

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Check if KB has documents
    if (knowledgeBase.documentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete knowledge base with ${knowledgeBase.documentCount} documents. Please delete all documents first.`,
      });
    }

    // Remove KB from all user access lists
    await UserKBAccess.updateMany(
      {},
      {
        $pull: {
          enabledKnowledgeBases: id,
          pinnedKBs: id,
          hiddenKBs: id,
          recentlyUsedKBs: id,
        },
        $unset: {
          defaultKnowledgeBase: id,
        },
      }
    );

    // Delete the KB
    await knowledgeBase.deleteOne();

    log.info({ kbId: id }, '[DeleteTenantKB] Tenant KB deleted successfully');

    return res.status(200).json({
      success: true,
      message: 'Knowledge base deleted successfully',
    });
  } catch (error) {
    log.error({ error }, '[DeleteTenantKB] Error deleting tenant KB');
    return res.status(500).json({
      success: false,
      message: 'Failed to delete knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Add users to a tenant knowledge base
 * @route   POST /api/admin/tenant-kb/:id/users
 * @access  Private (Admin only)
 */
export const addUsersToKB = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;
    const adminId = req.user?._id;

    log.info(
      { adminId, kbId: id, userCount: userIds?.length },
      '[AddUsersToKB] Adding users to KB'
    );

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required',
      });
    }

    const knowledgeBase = await TenantKnowledgeBase.findById(id);

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Add users to KB
    const newUsers = userIds.filter(
      userId => !knowledgeBase.allowedUsers?.some(u => u.toString() === userId)
    );

    if (newUsers.length > 0) {
      knowledgeBase.allowedUsers = [
        ...(knowledgeBase.allowedUsers || []),
        ...newUsers.map(id => new mongoose.Types.ObjectId(id)),
      ];
      knowledgeBase.lastModifiedBy = adminId;
      await knowledgeBase.save();

      // Also add KB to users' enabled list
      await UserKBAccess.updateMany(
        { userId: { $in: newUsers } },
        {
          $addToSet: { enabledKnowledgeBases: knowledgeBase._id },
          $set: { lastUpdated: new Date() },
        },
        { upsert: true }
      );
    }

    log.info({ kbId: id, addedCount: newUsers.length }, '[AddUsersToKB] Users added successfully');

    return res.status(200).json({
      success: true,
      message: `${newUsers.length} users added to knowledge base`,
      addedCount: newUsers.length,
    });
  } catch (error) {
    log.error({ error }, '[AddUsersToKB] Error adding users to KB');
    return res.status(500).json({
      success: false,
      message: 'Failed to add users to knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Remove users from a tenant knowledge base
 * @route   DELETE /api/admin/tenant-kb/:id/users
 * @access  Private (Admin only)
 */
export const removeUsersFromKB = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;
    const adminId = req.user?._id;

    log.info(
      { adminId, kbId: id, userCount: userIds?.length },
      '[RemoveUsersFromKB] Removing users from KB'
    );

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required',
      });
    }

    const knowledgeBase = await TenantKnowledgeBase.findById(id);

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Remove users from KB
    knowledgeBase.allowedUsers = knowledgeBase.allowedUsers?.filter(
      userId => !userIds.includes(userId.toString())
    );
    knowledgeBase.lastModifiedBy = adminId;
    await knowledgeBase.save();

    // Also remove KB from users' access lists
    await UserKBAccess.updateMany(
      { userId: { $in: userIds } },
      {
        $pull: {
          enabledKnowledgeBases: id,
          pinnedKBs: id,
          recentlyUsedKBs: id,
        },
        $set: { lastUpdated: new Date() },
      }
    );

    log.info(
      { kbId: id, removedCount: userIds.length },
      '[RemoveUsersFromKB] Users removed successfully'
    );

    return res.status(200).json({
      success: true,
      message: `${userIds.length} users removed from knowledge base`,
      removedCount: userIds.length,
    });
  } catch (error) {
    log.error({ error }, '[RemoveUsersFromKB] Error removing users from KB');
    return res.status(500).json({
      success: false,
      message: 'Failed to remove users from knowledge base',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get documents for a specific tenant knowledge base
 * @route   GET /api/admin/tenant-kb/:id/documents
 * @access  Private (Admin only)
 */
export const getTenantKBDocuments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;

    log.info({ adminId, kbId: id }, '[GetTenantKBDocuments] Fetching documents for tenant KB');

    // Verify KB exists
    const knowledgeBase = await TenantKnowledgeBase.findById(id);
    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Import UserDocument model
    const { UserDocument } = await import('../models/UserDocument');

    // Fetch documents for this tenant KB
    const documents = await UserDocument.find({
      tenantKbId: id,
      sourceType: 'tenant',
    })
      .select('_id originalFileName uploadTimestamp fileSize mimeType status userId')
      .populate('userId', 'name email')
      .sort({ uploadTimestamp: -1 })
      .lean();

    log.info(
      { kbId: id, documentCount: documents.length },
      '[GetTenantKBDocuments] Documents fetched'
    );

    return res.status(200).json({
      success: true,
      knowledgeBase: {
        _id: knowledgeBase._id,
        name: knowledgeBase.name,
        slug: knowledgeBase.slug,
        color: knowledgeBase.color,
        shortName: knowledgeBase.shortName,
      },
      documents,
      count: documents.length,
    });
  } catch (error) {
    log.error({ error }, '[GetTenantKBDocuments] Error fetching tenant KB documents');
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch knowledge base documents',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
