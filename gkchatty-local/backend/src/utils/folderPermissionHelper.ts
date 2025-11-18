import { SystemFolder } from '../models/SystemFolderModel';
import { getLogger } from './logger';

const log = getLogger('folderPermissionHelper');

/**
 * Get all folder IDs that a user has access to based on permissions
 * @param userId - User's MongoDB ObjectId
 * @param isAdmin - Whether the user is an admin
 * @returns Array of folder IDs the user can access
 */
export async function getAccessibleFolderIds(
  userId: string,
  isAdmin: boolean
): Promise<string[]> {
  try {
    // Fetch all system folders
    const folders = await SystemFolder.find({}).select('_id permissions');

    // Filter folders based on permissions (same logic as systemFolderController)
    const accessibleFolders = folders.filter(folder => {
      const permissions = folder.permissions || { type: 'admin' }; // Default to 'admin' for system folders

      // Admins can see all non-specific-user folders
      if (isAdmin && permissions.type !== 'specific-users') {
        return true;
      }

      // Everyone can see 'all' permission folders
      if (permissions.type === 'all') {
        return true;
      }

      // Only admins can see 'admin' permission folders
      if (permissions.type === 'admin') {
        return isAdmin;
      }

      // Check if user is in allowed list for 'specific-users'
      if (permissions.type === 'specific-users') {
        const allowedUsers = permissions.allowedUsers || [];
        return allowedUsers.some(allowedUserId =>
          allowedUserId.toString() === userId.toString()
        );
      }

      // Default to deny access
      return false;
    });

    const folderIds = accessibleFolders.map(f => f._id.toString());

    log.debug(
      {
        userId,
        isAdmin,
        totalFolders: folders.length,
        accessibleFolders: folderIds.length,
      },
      '[Folder Permissions] Calculated accessible folders for user'
    );

    return folderIds;
  } catch (error: unknown) {
    log.error({ error, userId, isAdmin }, '[Folder Permissions] Error getting accessible folders');
    // Fail secure - return empty array if error occurs
    return [];
  }
}

/**
 * Check if a user has access to a specific folder
 * @param userId - User's MongoDB ObjectId
 * @param isAdmin - Whether the user is an admin
 * @param folderId - Folder ID to check
 * @returns true if user has access, false otherwise
 */
export async function hasAccessToFolder(
  userId: string,
  isAdmin: boolean,
  folderId: string
): Promise<boolean> {
  try {
    const folder = await SystemFolder.findById(folderId).select('permissions');

    if (!folder) {
      log.warn({ folderId }, '[Folder Permissions] Folder not found');
      return false;
    }

    const permissions = folder.permissions || { type: 'admin' };

    // Admins can see all non-specific-user folders
    if (isAdmin && permissions.type !== 'specific-users') {
      return true;
    }

    // Everyone can see 'all' permission folders
    if (permissions.type === 'all') {
      return true;
    }

    // Only admins can see 'admin' permission folders
    if (permissions.type === 'admin') {
      return isAdmin;
    }

    // Check if user is in allowed list for 'specific-users'
    if (permissions.type === 'specific-users') {
      const allowedUsers = permissions.allowedUsers || [];
      return allowedUsers.some(allowedUserId =>
        allowedUserId.toString() === userId.toString()
      );
    }

    // Default to deny access
    return false;
  } catch (error: unknown) {
    log.error({ error, userId, folderId }, '[Folder Permissions] Error checking folder access');
    // Fail secure - deny access if error occurs
    return false;
  }
}
