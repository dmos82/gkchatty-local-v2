import { Router, Request, Response } from 'express';
import { getLogger } from '../utils/logger';

const router: Router = Router();
const logger = getLogger('versionRoutes');

/**
 * @route   GET /api/version
 * @desc    Get the current deployed version information
 * @access  Public (no authentication required for diagnostics)
 */
router.get('/', (req: Request, res: Response) => {
  // Render automatically provides this environment variable
  const commitHash = process.env.RENDER_GIT_COMMIT || 'unknown';

  // Build timestamp - we'll inject this at build time via environment variable
  // For now, we can use the server start time as a proxy
  const buildTimestamp = process.env.BUILD_TIMESTAMP || new Date().toISOString();

  // Additional diagnostic information
  const nodeVersion = process.version;
  const renderServiceId = process.env.RENDER_SERVICE_ID || 'unknown';
  const renderServiceName = process.env.RENDER_SERVICE_NAME || 'unknown';
  const renderInstanceId = process.env.RENDER_INSTANCE_ID || 'unknown';

  logger.info({ commitHash }, 'Version endpoint request received');

  res.json({
    commit_hash: commitHash,
    build_timestamp: buildTimestamp,
    node_version: nodeVersion,
    render: {
      service_id: renderServiceId,
      service_name: renderServiceName,
      instance_id: renderInstanceId,
    },
    // Add a human-readable message for quick verification
    message: `GKChatty API running commit ${commitHash.substring(0, 7)}`,
  });
});

export default router;
