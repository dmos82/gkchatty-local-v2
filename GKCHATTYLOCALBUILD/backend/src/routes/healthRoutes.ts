/**
 * Health Check Routes for GKChatty
 *
 * Provides /health endpoint for monitoring service health status
 * Part of BMAD v2.0 Enhancement - Bottleneck #2 Fix
 *
 * Date: October 24, 2025
 */

import * as expressModule from 'express';
const express = expressModule.default || expressModule;
const router = express.Router();
import mongoose from 'mongoose';
import { UserModel as User } from '../utils/modelFactory';
import { UserDocumentModel as UserDocument } from '../utils/modelFactory';

/**
 * Health Check Endpoint
 *
 * Checks:
 * 1. Database connectivity (MongoDB)
 * 2. Auth service (User model access)
 * 3. Document storage (Document model access)
 *
 * Returns:
 * - 200 OK: All systems healthy
 * - 503 Service Unavailable: One or more systems unhealthy
 */
router.get('/health', async (req, res) => {
  const checks: Record<string, 'ok' | 'failed'> = {
    database: 'failed',
    auth: 'failed',
    documentStorage: 'failed'
  };

  let allHealthy = true;

  try {
    // Check 1: Database connectivity
    if (mongoose.connection.readyState === 1) {
      // readyState 1 = connected
      checks.database = 'ok';
    } else {
      allHealthy = false;
    }

    // Check 2: Auth service (verify User model accessible)
    try {
      const adminUser = await User.findOne({ username: 'admin' }).lean();
      if (adminUser) {
        checks.auth = 'ok';
      } else {
        // Admin user should always exist
        allHealthy = false;
      }
    } catch (error) {
      console.error('[Health Check] Auth service check failed:', error);
      allHealthy = false;
    }

    // Check 3: Document storage (verify UserDocument model accessible)
    try {
      // Test if we can access the model (query should work even if no documents exist)
      const count = await UserDocument.countDocuments().limit(1);
      // If we get here without error, document storage is accessible
      checks.documentStorage = 'ok';
    } catch (error) {
      console.error('[Health Check] Document storage check failed:',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error.stack : error
      );
      allHealthy = false;
    }

    // Construct response
    const healthStatus = {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: checks,
      version: process.env.npm_package_version || 'unknown'
    };

    // Return appropriate HTTP status
    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    // Catch-all for unexpected errors
    console.error('[Health Check] Unexpected error:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      checks: checks
    });
  }
});

/**
 * Readiness Check Endpoint
 *
 * Similar to health, but indicates if the service is ready to receive traffic
 * Useful for Kubernetes/Docker orchestration
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState === 1) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Database not connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness Check Endpoint
 *
 * Simple check that the process is alive
 * Used by container orchestrators to know when to restart
 */
router.get('/alive', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
