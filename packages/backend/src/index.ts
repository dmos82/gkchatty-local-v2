import 'dotenv/config';
// import https from 'https'; // Remove unused import
// import fs from 'fs'; // Remove unused import if only used for certs
import * as cookieParserModule from 'cookie-parser';
const cookieParser = cookieParserModule.default || cookieParserModule;
import Setting from './models/SettingModel'; // Ensure uppercase 'M'
import User from './models/UserModel'; // Import User model for seeding
import bcrypt from 'bcryptjs'; // Import bcrypt for password hashing
import { v4 as uuidv4 } from 'uuid'; // For correlation IDs (HIGH-003)
import { patchConsoleWithLogger } from './utils/consolePatch';
import './utils/breakerFallbackSetup'; // Ensure circuit breaker fallback is attached

// Redirect all console.* calls to structured pino logger (includes correlationId)
patchConsoleWithLogger();

// --- START: Environment Configuration Check ---
console.log('--- Server Configuration Check ---');
console.log(`PINECONE_API_KEY: ${!!process.env.PINECONE_API_KEY ? 'PRESENT' : 'MISSING'}`);
console.log(`PINECONE_ENVIRONMENT: ${!!process.env.PINECONE_ENVIRONMENT ? 'PRESENT' : 'MISSING'}`);
console.log(`PINECONE_INDEX_NAME: ${!!process.env.PINECONE_INDEX_NAME ? 'PRESENT' : 'MISSING'}`);
console.log(`OPENAI_API_KEY: ${!!process.env.OPENAI_API_KEY ? 'PRESENT' : 'MISSING'}`);
console.log(
  `OPENAI_PRIMARY_CHAT_MODEL: ${process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini (default)'}`
);
console.log(
  `OPENAI_FALLBACK_CHAT_MODEL: ${process.env.OPENAI_FALLBACK_CHAT_MODEL || 'gpt-3.5-turbo (default)'}`
);
console.log(
  `OPENAI_EMBEDDING_MODEL: ${process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small (default)'}`
);
console.log(`MONGODB_URI: ${!!process.env.MONGODB_URI ? 'PRESENT' : 'MISSING'}`);
console.log(`MONGO_URI: ${!!process.env.MONGO_URI ? 'PRESENT' : 'MISSING'}`);
console.log(`JWT_SECRET: ${!!process.env.JWT_SECRET ? 'PRESENT' : 'MISSING'}`);

// Validate critical secrets
if (!process.env.JWT_SECRET) {
  console.error('[Config] CRITICAL ERROR: JWT_SECRET is missing!');
  process.exit(1);
}
console.log('-----------------------------------------------------');
// --- END: Environment Configuration Check ---

import * as expressModule from 'express';
const express = expressModule.default || expressModule;
import type { Application } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as corsModule from 'cors';
const cors = corsModule.default || corsModule;
import * as morganModule from 'morgan';
const morgan = morganModule.default || morganModule;
import { connectDB } from './utils/mongoHelper';
import mongoose from 'mongoose'; // Import mongoose for database connection info
import documentRoutes from './routes/documentRoutes'; // <-- Ensure this is uncommented
import chatRoutes from './routes/chatRoutes';
import authRoutes from './routes/authRoutes'; // <-- Import auth routes
import searchRoutes from './routes/searchRoutes'; // Import search routes
import systemKbRoutes from './routes/systemKbRoutes'; // Added: Import system KB routes

import userRoutes from './routes/userRoutes'; // <-- IMPORT userRoutes
import personaRoutes from './routes/personaRoutes'; // <-- Import persona routes
import settingsRoutes from './routes/settingsRoutes'; // <-- Import settings routes (Removed .js)
import feedbackRoutes from './routes/feedback.routes'; // <-- Import feedback routes
import localFileRoutes from './routes/localFileRoutes'; // <-- Import local file routes
import versionRoutes from './routes/versionRoutes'; // <-- Import version routes
import adminSettingsRoutes from './routes/adminSettingsRoutes'; // <-- Import admin settings routes
import folderRoutes from './routes/folderRoutes'; // <-- Import folder routes
import articleRoutes from './routes/articleRoutes'; // <-- Import article routes
import * as http from 'http'; // Import http
import { correlationIdMiddleware } from './middleware/correlationId';
import { pinoLogger } from './utils/logger'; // Import base pinoLogger
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { standardLimiter } from './middleware/rateLimiter'; // Import rate limiters
import { DEFAULT_API_PORT, DEFAULT_FRONTEND_PORT } from './config/constants';
import * as helmetModule from 'helmet'; // HIGH-005: Import helmet.js for security headers
const helmet = helmetModule.default || helmetModule;

// ← Added: Diagnostic log for import type
console.log('*** [Index Module] Imported systemKbRouter:', typeof systemKbRoutes);

// --- Main Application Setup ---
const app: Application = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_API_PORT;

// Export the configured Express app so that Jest/Supertest can import it for integration tests
export { app };

// Setup pino-http middleware for structured request logging
// This MUST be one of the first middleware to ensure all requests are logged
// and req.id is available for subsequent middleware and handlers.
app.use(
  pinoHttp({
    logger: pinoLogger,
    genReqId: function (req, res) {
      // req and res types are inferred by pino-http
      const existingId =
        (req as any).id || req.headers['x-request-id'] || req.headers['x-correlation-id'];
      if (existingId) return existingId;
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Optional: Define custom serializers if you need to modify how req, res, err are logged.
    // serializers: {
    //   req: pino.stdSerializers.req, // Default request serializer
    //   res: pino.stdSerializers.res, // Default response serializer
    //   err: pino.stdSerializers.err, // Default error serializer
    // },
    // Optional: Customize log level based on response status or errors.
    // customLogLevel: function (req, res, err) {
    //   if (res.statusCode >= 400 && res.statusCode < 500) {
    //     return 'warn';
    //   } else if (res.statusCode >= 500 || err) {
    //     return 'error';
    //   }
    //   return 'info';
    // },
  })
);

// HIGH-005: Apply helmet.js security headers middleware
// Must be applied early in middleware chain, before routes
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for development
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for CORS compatibility
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
  })
);

// MEDIUM-001: Secure cookie configuration middleware
// Must be applied after cookie-parser, before routes
app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Override res.cookie to automatically add security settings
  const originalCookie = res.cookie.bind(res);
  res.cookie = function(name: string, value: any, options: any = {}) {
    const secureOptions = {
      ...options,
      httpOnly: true, // Prevent JavaScript access (XSS protection)
      secure: isProduction, // HTTPS only in production (allows HTTP in dev)
      sameSite: 'strict' as const, // CSRF protection
      path: options.path || '/',
    };
    return originalCookie(name, value, secureOptions);
  } as typeof res.cookie;

  next();
});

// Function to log API configuration (can be called at startup)
function logApiConfiguration() {
  console.log('\n==== API Configuration ====');
  console.log(`Port: ${process.env.PORT || DEFAULT_API_PORT}`);
  console.log(`OpenAI API Key available: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`Primary Chat Model: ${process.env.OPENAI_PRIMARY_CHAT_MODEL || 'gpt-4o-mini'}`);
  console.log(`Fallback Chat Model: ${process.env.OPENAI_FALLBACK_CHAT_MODEL || 'gpt-3.5-turbo'}`);
  console.log(`Embedding Model: ${process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'}`);
  console.log(`Pinecone API Key available: ${!!process.env.PINECONE_API_KEY}`);
  console.log(`Pinecone Environment: ${process.env.PINECONE_ENVIRONMENT}`);
  console.log(`Pinecone Index Name: ${process.env.PINECONE_INDEX_NAME}`);
  console.log('==========================\n');
}

async function startServer() {
  try {
    console.log('Starting server initialization...');
    console.log('Attempting database connection...');
    await connectDB();
    console.log('Database connection successful, proceeding with app setup...');

    // --- BEGIN: Seed Default Settings ---
    try {
      const defaultSystemPromptKey = 'systemPrompt';
      // eslint-disable-next-line quotes
      // prettier-ignore
      const defaultSystemPromptValue = 'You are a helpful AI assistant for GOAT Insurance. Answer questions based on the provided context only. If the answer is not in the context, say you don\'t know.';
      const existingSetting = await Setting.findOne({ key: defaultSystemPromptKey });

      if (!existingSetting) {
        console.log(
          `[Settings Seeder] '${defaultSystemPromptKey}' setting not found. Creating default.`
        );
        await Setting.create({ key: defaultSystemPromptKey, value: defaultSystemPromptValue });
        console.log(`[Settings Seeder] Default '${defaultSystemPromptKey}' created.`);
      } else {
        // Optional: Log if it already exists
        // console.log(`[Settings Seeder] '${defaultSystemPromptKey}' setting already exists.`);
      }
    } catch (seedError) {
      console.error('[Settings Seeder] Error checking or seeding default settings:', seedError);
      // Decide if this should be a fatal error. For now, we log and continue.
    }
    // --- END: Seed Default Settings ---

    // --- BEGIN: Temporary Admin User Seeder ---
    // THIS IS TEMPORARY AND SHOULD BE REMOVED AFTER INITIAL SETUP
    try {
      console.log('[Admin Seeder] Checking if initial admin user seeding is required...');

      const TEMP_ADMIN_USERNAME = process.env.TEMP_ADMIN_USERNAME || 'initial_admin';
      const TEMP_ADMIN_PASSWORD = process.env.TEMP_ADMIN_PASSWORD || 'TempPassword123!';
      const TEMP_ADMIN_EMAIL = process.env.TEMP_ADMIN_EMAIL || 'admin@example.com';

      // Check if the specific admin user already exists
      const existingAdminUser = await User.findOne({ username: TEMP_ADMIN_USERNAME });
      console.log(
        `[Admin Seeder] Check for existing user '${TEMP_ADMIN_USERNAME}': ${existingAdminUser ? 'Found' : 'Not Found'}`
      );

      if (!existingAdminUser) {
        console.log(
          `[Admin Seeder] User '${TEMP_ADMIN_USERNAME}' not found. Seeding initial admin user...`
        );
        const hashedPassword = await bcrypt.hash(TEMP_ADMIN_PASSWORD, 12);
        const tempAdmin = new User({
          username: TEMP_ADMIN_USERNAME,
          password: hashedPassword,
          email: TEMP_ADMIN_EMAIL,
          role: 'admin',
          // Add any other mandatory fields for the User model if they exist
          isPersonaEnabled: false,
          canCustomizePersona: false,
        });
        await tempAdmin.save();
        console.log(
          `[Admin Seeder] Initial admin user '${TEMP_ADMIN_USERNAME}' created successfully.`
        );
        console.log(`[Admin Seeder] Database: ${mongoose.connection.db?.databaseName}`);
        console.log(`[Admin Seeder] Admin email: ${TEMP_ADMIN_EMAIL}`);
        console.log(`[Admin Seeder] Temporary password: ${TEMP_ADMIN_PASSWORD}`);
      } else {
        console.log(
          `[Admin Seeder] User '${TEMP_ADMIN_USERNAME}' already exists. Skipping initial admin user seeding.`
        );
      }
    } catch (error) {
      console.error('[Admin Seeder] Error during initial admin user seeding:', error);
      // Decide if this should be a fatal error. For now, we log and continue.
    }
    // --- END: Temporary Admin User Seeder ---

    // --- BEGIN: Default Persona Seeder ---
    try {
      console.log('[Persona Seeder] Checking if default persona seeding is required...');

      // Import Persona model
      const { default: Persona } = await import('./models/PersonaModel');

      // Check if a default persona already exists
      const existingDefaultPersona = await Persona.findOne({ isDefault: true });

      if (!existingDefaultPersona) {
        console.log('[Persona Seeder] No default persona found. Creating default persona...');

        // Create a dummy system user ID for the default persona
        const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

        const defaultPersona = new Persona({
          name: 'System Default Assistant',
          prompt:
            'You are a helpful AI assistant for GOAT Insurance. You provide accurate, professional, and friendly assistance with insurance-related questions and procedures.',
          systemPrompt:
            'You are a knowledgeable insurance assistant. Always be professional, accurate, and helpful. Focus on providing clear and concise answers based on the provided context.',
          userId: systemUserId,
          isActive: false,
          isDefault: true,
        });

        await defaultPersona.save();
        console.log('[Persona Seeder] Default persona created successfully.');
      } else {
        console.log('[Persona Seeder] Default persona already exists. Skipping persona seeding.');
      }
    } catch (error) {
      console.error('[Persona Seeder] Error during default persona seeding:', error);
      // Non-fatal error - continue with startup
    }
    // --- END: Default Persona Seeder ---

    // Core Middleware

    // ULTRA-EARLY global request logger - MUST BE FIRST to catch ALL requests
    app.use((req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString();
      console.log(
        `[ULTRA-EARLY LOGGER] ${timestamp} Method: ${req.method}, URL: ${req.originalUrl}, Origin: ${req.headers.origin || 'NO_ORIGIN'}`
      );

      // Special logging for document upload
      if (req.originalUrl === '/api/documents/upload' && req.method === 'POST') {
        console.error(`[ULTRA-EARLY LOGGER - UPLOAD DETECTED] ${timestamp}`);
        console.error(`[ULTRA-EARLY LOGGER - UPLOAD] Full URL: ${req.originalUrl}`);
        console.error(`[ULTRA-EARLY LOGGER - UPLOAD] Content-Type: ${req.headers['content-type']}`);
        console.error(
          `[ULTRA-EARLY LOGGER - UPLOAD] Content-Length: ${req.headers['content-length']}`
        );
        console.error(
          `[ULTRA-EARLY LOGGER - UPLOAD] Request reached Express app BEFORE any middleware`
        );
      }

      if (req.originalUrl.includes('/admin/settings/openai-config')) {
        console.log(
          `[ULTRA-EARLY LOGGER] Headers for openai-config:`,
          JSON.stringify(req.headers, null, 2)
        );
        console.log(`[ULTRA-EARLY LOGGER] Request caught BEFORE CORS middleware`);
      }
      next();
    });

    // Dynamic CORS Configuration based on FRONTEND_URL environment variable
    const frontendUrl = process.env.FRONTEND_URL; // Get from .env
    // Split by comma if multiple origins are provided, trim whitespace
    const allowedOrigins = frontendUrl ? frontendUrl.split(',').map(origin => origin.trim()) : [];

    // Add default development and production origins if none specified
    if (allowedOrigins.length === 0) {
      const defaultOrigins = [
        'https://apps.gkchatty.com',
        'https://gkchatty.netlify.app',
        `http://localhost:${DEFAULT_FRONTEND_PORT}`,
        'http://localhost:3003',
      ];
      allowedOrigins.push(...defaultOrigins);
      console.log(
        '[CORS] No FRONTEND_URL specified, using default origins for development and production'
      );
    }

    console.log(
      `[API] CORS Origins configured: [${allowedOrigins.map(origin => `'${origin}'`).join(', ')}]`
    );

    const corsOptions = {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void
      ) => {
        // Allow requests with no origin (e.g., curl, server-to-server, mobile apps)
        if (!origin) {
          console.log('[CORS] ✅ Allowing request with no origin (no Origin header)');
          return callback(null, true);
        }

        const allowedOriginsExplicit = [process.env.CORS_ORIGIN || '']; // Explicit whitelist (prod site)
        const netlifyPreviewRegex = /\.netlify\.app$/i; // Any subdomain ending with .netlify.app

        // Check against all allowed origins (including localhost for development)
        const isAllowed =
          allowedOrigins.includes(origin) ||
          allowedOriginsExplicit.includes(origin) ||
          netlifyPreviewRegex.test(origin);

        if (isAllowed) {
          console.log(`[CORS] ✅ Allowing origin: ${origin}`);
          return callback(null, true);
        }

        console.error(`[CORS] ❌ Blocking origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true, // Allow cookies/auth headers
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Added PATCH
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Cache-Control'], // Added Cache-Control
    };

    app.use(cors(corsOptions)); // Apply updated CORS options

    // Explicitly handle OPTIONS requests (preflight) for all routes
    // This should ideally be handled by the cors middleware, but adding explicitly
    // can sometimes resolve issues with specific hosting/proxy setups.
    app.options('*', cors(corsOptions)); // Enable preflight across-the-board

    // -------------------------------------------------
    // Health Check Endpoint (for Render and uptime checks)
    // -------------------------------------------------
    app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        deployment_version: 'v1.0.0-reindex-fix-final-verification',
      });
    });

    // Version Endpoint (for deployment verification)
    app.use('/api/version', versionRoutes);
    console.log('>>> [App Setup] /api/version route registered.');

    // Add request logging *after* CORS, *before* JSON parsing
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin || 'N/A';
      console.log(
        `[Request Logger] Incoming: ${req.method} ${req.originalUrl} from Origin: ${origin}`
      );
      next();
    });

    // MEDIUM-008: Configure request size limits to prevent DoS attacks
    // Limit JSON payloads to 10MB (configurable via env var)
    const maxJsonSize = process.env.MAX_JSON_SIZE || '10mb';

    // Conditional JSON parser - skip for multipart/form-data uploads
    app.use((req: Request, res: Response, next: NextFunction) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        console.log(`[JSON PARSER] Skipping JSON parser for multipart request: ${req.originalUrl}`);
        next();
      } else {
        express.json({ limit: maxJsonSize })(req, res, next);
      }
    });

    // MEDIUM-008: Limit URL-encoded payloads to 10MB (configurable via env var)
    const maxUrlencodedSize = process.env.MAX_URLENCODED_SIZE || '10mb';

    // Conditional URL-encoded parser - skip for multipart/form-data uploads
    app.use((req: Request, res: Response, next: NextFunction) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        console.log(
          `[URLENCODED PARSER] Skipping express.urlencoded for multipart request: ${req.originalUrl}`
        );
        next();
      } else {
        express.urlencoded({ extended: true, limit: maxUrlencodedSize })(req, res, next);
      }
    });

    app.use(morgan('dev')); // Logging HTTP requests

    app.use(cookieParser()); // Existing cookie parsing middleware

    // Correlation ID Middleware
    // Now that pino-http sets req.id, this middleware ensures that ID
    // is propagated into AsyncLocalStorage for getLogger.
    app.use(correlationIdMiddleware);

    // Apply standard rate limiter to all routes
    app.use(standardLimiter);

    // BEFORE mounting document routes
    console.log('>>> [App Setup] Registering primary API routes...');

    // Health check endpoint - must be before authentication
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: Date.now()
      });
    });

    // Document Routes
    try {
      console.log('>>> [App Setup] Mounting /api/documents routes...');
      app.use('/api/documents', documentRoutes);
      console.log('>>> [App Setup] /api/documents routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/documents routes:', err);
    }

    // Chat Routes
    try {
      console.log('>>> [App Setup] Mounting /api/chats routes...');
      app.use('/api/chats', chatRoutes);
      console.log('>>> [App Setup] /api/chats routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/chats routes:', err);
    }

    // Auth Routes
    try {
      console.log('>>> [App Setup] Mounting /api/auth routes...');
      app.use('/api/auth', authRoutes);
      console.log('>>> [App Setup] /api/auth routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/auth routes:', err);
    }

    // Search Routes
    try {
      console.log('>>> [App Setup] Mounting /api/search routes...');
      app.use('/api/search', searchRoutes);
      console.log('>>> [App Setup] /api/search routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/search routes:', err);
    }

    // System KB Routes
    try {
      console.log('>>> [App Setup] Mounting /api/system-kb routes...');
      app.use('/api/system-kb', systemKbRoutes);
      console.log('>>> [App Setup] /api/system-kb routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/system-kb routes:', err);
    }

    // Admin Routes (must be mounted before general protect middleware)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const adminRoutesDiag = require('./routes/adminRoutes').default;
      if (adminRoutesDiag) {
        console.log(
          '>>> [App Setup] Mounting /api/admin routes (early for adminAuthMiddleware)...'
        );
        app.use('/api/admin', adminRoutesDiag);
        console.log('>>> [App Setup] /api/admin routes registered.');
      } else {
        throw new Error('adminRoutes resolved to undefined or null');
      }
    } catch (err) {
      console.error(
        '>>> !!! [BOOT] CRITICAL: Failed to register /api/admin routes – all admin endpoints unavailable.',
        err
      );
    }

    // Admin Settings Routes
    try {
      console.log('>>> [App Setup] Mounting /api/admin/settings routes...');
      app.use('/api/admin/settings', adminSettingsRoutes);
      console.log('>>> [App Setup] /api/admin/settings routes registered.');
    } catch (err) {
      console.error('>>> [BOOT] ERROR: Failed to register /api/admin/settings routes.', err);
    }

    // User Routes (critical)
    try {
      console.log('>>> [App Setup] Attempting to mount /api/users routes...');
      console.log(
        `>>> [App Setup] userRoutes imported. Type: ${typeof userRoutes}, Is function: ${typeof userRoutes === 'function'}`
      );
      app.use('/api/users', userRoutes);
      app.use('/users', userRoutes); // legacy path
      console.log('>>> [App Setup] /api/users routes registered successfully.');
    } catch (err) {
      console.error('>>> !!! [App Setup] CRITICAL error registering /api/users routes:', err);
    }

    // Persona Routes
    try {
      console.log('>>> [App Setup] Mounting /api/personas routes...');
      app.use('/api/personas', personaRoutes);
      console.log('>>> [App Setup] /api/personas routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/personas routes:', err);
    }

    // Settings Routes
    try {
      console.log('>>> [App Setup] Mounting /api/settings routes...');
      app.use('/api/settings', settingsRoutes);
      console.log('>>> [App Setup] /api/settings routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/settings routes:', err);
    }

    // Feedback Routes
    try {
      console.log('>>> [App Setup] Mounting /api/feedback routes...');
      app.use('/api/feedback', feedbackRoutes);
      console.log('>>> [App Setup] /api/feedback routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/feedback routes:', err);
    }

    // Local File Routes
    try {
      console.log('>>> [App Setup] Mounting /api/files routes...');
      app.use('/api/files', localFileRoutes);
      console.log('>>> [App Setup] /api/files routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api/files routes:', err);
    }

    // --- Folder Routes ---
    try {
      console.log('>>> [App Setup] Registering folder routes...');
      app.use('/api/folders', folderRoutes);
      console.log('>>> [App Setup] Folder routes registered successfully.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering folder routes:', err);
    }

    // --- Article Routes ---
    try {
      console.log('>>> [App Setup] Registering article routes...');
      app.use('/api/articles', articleRoutes);
      console.log('>>> [App Setup] Article routes registered successfully.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering article routes:', err);
    }

    // Document routes (includes /chat endpoint)
    try {
      console.log('>>> [App Setup] Mounting /api document routes (includes /chat endpoint)...');
      app.use('/api', documentRoutes);
      console.log('>>> [App Setup] /api document routes registered.');
    } catch (err) {
      console.error('>>> !!! [App Setup] Error registering /api document routes:', err);
    }

    // --- Error Handling ---
    // Update global 404 handler to log details
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      console.warn(
        `>>> [App Setup] Global 404 Handler reached for: ${_req.method} ${_req.originalUrl}`
      );
      next();
    });

    // Simple 404 handler for routes not found
    app.use((_req, res) => {
      const logger = (_req as any).log || pinoLogger; // Use request-specific logger
      logger.warn({ url: _req.originalUrl, method: _req.method }, 'Route not found');
      res.status(404).json({ success: false, message: 'Not Found', code: 'ROUTE_NOT_FOUND' });
    });

    // Global error handler (must have 4 arguments) - HIGH-003 Security Fix
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const logger = (req as any).log || pinoLogger;
      const correlationId = uuidv4(); // Generate correlation ID for support tracking

      const statusCode = err.statusCode || err.status || 500;
      const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
      const isProduction = process.env.NODE_ENV === 'production';

      // Log detailed error server-side (with correlation ID)
      logger.error(
        {
          correlationId,
          err,
          stack: err.stack,
          reqSummary: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userId: (req as any).user?.id,
          },
          errorCode,
          statusCode,
        },
        err.message || 'Global error handler caught an error'
      );

      // Log suspicious errors as security events
      if ([401, 403, 429].includes(statusCode)) {
        const { logSecurityEvent } = require('./utils/securityLogger');
        logSecurityEvent({
          type: 'SUSPICIOUS_ACTIVITY',
          ip: req.ip,
          path: req.originalUrl,
          userId: (req as any).user?.id,
          details: { errorCode, statusCode, correlationId },
        });
      }

      // Return generic message in production, detailed in dev (NEVER expose stack traces in prod)
      const errorResponse = {
        success: false,
        message: isProduction
          ? 'An error occurred. Please contact support with the correlation ID.'
          : err.message || 'An unexpected error occurred.',
        correlationId, // Always include for support tracking
        code: errorCode,
        // NEVER include stack traces in production
        ...((!isProduction) && { details: err.message, stack: err.stack }),
      };
      res.status(statusCode).json(errorResponse);
    });

    // --- Start Server (HTTP Only) ---
    console.log('Starting HTTP server...');
    const server = http
      .createServer(app)
      .listen(port, '0.0.0.0', () => {
        console.log(`🚀 HTTP API Server listening on port ${port}`);
        console.log('GKCHATTY Backend: Application STARTED successfully!');
        logApiConfiguration();
      })
      .on('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Error: Port ${port} is already in use. Is another instance running?`);
        } else {
          console.error('Failed to start HTTP server:', err);
        }
        process.exit(1);
      });

    // --- Graceful Shutdown (applies to HTTP server) ---
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received. Starting graceful shutdown...');

      // Close rate limiter Redis connection
      const { closeRateLimiter } = await import('./middleware/rateLimiter');
      await closeRateLimiter();

      server.close(() => {
        console.log('Server closed. Exiting process.');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT signal received. Starting graceful shutdown...');

      // Close rate limiter Redis connection
      const { closeRateLimiter } = await import('./middleware/rateLimiter');
      await closeRateLimiter();

      server.close(() => {
        console.log('Server closed. Exiting process.');
        process.exit(0);
      });
    });
  } catch (error) {
    // Use pinoLogger for fatal startup errors
    pinoLogger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Prevent server from listening when running under Jest (NODE_ENV === 'test')
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
