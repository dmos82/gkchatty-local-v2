import express, { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid'; // Ensure this import is present
import { UserModel as User } from '../utils/modelFactory'; // Import the User model
import { protect, checkSession, RequestWithUser } from '../middleware/authMiddleware'; // Keep protect for logout
import { getUserProfile } from '../controllers/userController'; // Import the new controller
import { authLimiter } from '../middleware/rateLimiter'; // Import auth rate limiter
import { AUTH_COOKIE_TEST_MAX_AGE_MS } from '../config/constants';
import { getLogger } from '../utils/logger';
// HIGH-002: Import password validation middleware for when registration is re-enabled
// import { validatePasswordMiddleware } from '../middleware/passwordValidation';
// HIGH-004: Import centralized bcrypt work factor for when registration is re-enabled
// import { BCRYPT_ROUNDS as SALT_ROUNDS } from '../config/security';
const SALT_ROUNDS = 12; // Temporary constant for commented code

const router: Router = express.Router();
const logger = getLogger('authRoutes');

// GET /api/auth/ping (for debugging)
router.get('/ping', (req: Request, res: Response) => {
  logger.debug({ cookies: req.cookies, headers: req.headers }, 'Ping request received');

  // Set a test cookie to verify cookie functionality
  const testCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    maxAge: AUTH_COOKIE_TEST_MAX_AGE_MS, // 1 minute
    path: '/',
    // Remove domain attribute for localhost testing
  };

  res.cookie('testCookie', 'test-value', testCookieOptions);
  logger.debug(
    {
      cookieOptions: testCookieOptions,
      responseHeaders: res.getHeaders ? res.getHeaders() : 'Headers not available',
    },
    'Set test cookie'
  );

  res.status(200).json({
    message: 'Auth route ping successful!',
    cookiesReceived: !!req.cookies,
    testCookieSet: true,
  });
});

// POST /api/auth/register - DISABLED FOR PUBLIC USE
router.post(
  '/register',
  authLimiter,
  // HIGH-002: Password complexity validation ready for when registration is re-enabled
  // validatePasswordMiddleware, // Uncomment when registration is re-enabled
  async (req: Request, res: Response): Promise<Response | void> => {
    // Public registration has been disabled - only admins can create users
    logger.warn('Public registration attempt blocked - feature disabled');
    return res.status(403).json({
      error:
        'Public registration is disabled. Please contact an administrator to create an account.',
    });

    // Original registration logic commented out for potential future admin use
    /*
  // Remove email from destructuring
  const { username, password } = req.body;

  // 1. Input Validation
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  // Remove email validation checks
  /*
  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ error: 'Email is required' });
  }
  */
    /*
  if (!password || typeof password !== 'string' || password.trim() === '') {
    return res.status(400).json({ error: 'Password is required' });
  }
  */
    /*
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  */
    /*
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const trimmedUsername = username.trim();
  // const trimmedEmail = email.trim().toLowerCase(); // Remove email processing

  try {
    // 2. Check Existing User (by username only)
    // Remove email from query
    const existingUser = await User.findOne({ username: trimmedUsername });

    if (existingUser) {
      // Simplify check
      return res.status(409).json({ error: 'Username already taken' });
    }

    // 3. Hash Password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Create & Save User (without email)
    const userDataForSave = {
      username: trimmedUsername,
      // email: trimmedEmail, // Remove email
      password: hashedPassword,
    };
    console.log('[Register Debug] Prepared user data (excluding password & email): ', {
      username: userDataForSave.username,
    });
    console.log('[Register Debug] Attempting to save new user to MongoDB...');

    try {
      // Use create instead of new + save for atomicity if possible
      const user = await User.create(userDataForSave);
      console.log('[Register Debug] Successfully saved user to MongoDB. User ID:', user._id);

      // 5. Success Response (Do NOT send password hash or email)
      res.status(201).json({
        message: 'User registered successfully',
        userId: user._id,
        username: user.username,
        // email: user.email, // Remove email from response
      });
    } catch (dbError: any) {
      console.error('[Register Debug] !!! FAILED to save user to MongoDB !!! Error:', dbError);
      // Send a 400 or 500 error response, not 201
      // Update error message to reflect only username constraint
      const errorMessage =
        dbError.code === 11000
          ? 'Username already exists (database constraint).'
          : dbError.message || 'Database error during registration.';
      res.status(dbError.code === 11000 ? 409 : 500).json({ error: errorMessage });
    }
  } catch (error) {
    // This outer catch handles errors like hashing failure or findOne failure
    console.error('[Register] General Registration Error:', error); // Log the actual error server-side
    res.status(500).json({ error: 'Registration failed due to server error' });
  }
  */
  }
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  async (req: Request, res: Response): Promise<Response | void> => {
    const { username, password } = req.body;
    logger.info({ username }, 'Login attempt');

    if (!username || !password) {
      logger.warn('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
      logger.debug(
        {
          username,
          storageMode: process.env.USE_SQLITE === 'true' ? 'SQLite' : 'MongoDB',
          nodeEnv: process.env.NODE_ENV,
        },
        'Attempting to find user in database'
      );

      // Search by username (SQLite adapter doesn't support $or)
      logger.debug({ username }, 'About to call User.findOne with username');
      let user;
      try {
        user = await User.findOne({ username });
        logger.debug({ userFound: !!user, username }, 'User.findOne completed');
      } catch (findError: any) {
        logger.error({
          findError,
          errorMessage: findError?.message,
          errorCode: findError?.code,
          errorStack: findError?.stack
        }, 'Error in User.findOne');
        throw findError;
      }

      // If not found by username, try email (for backward compatibility)
      if (!user) {
        logger.debug({ username }, 'User not found by username, trying email');
        try {
          user = await User.findOne({ email: username });
          logger.debug({ userFound: !!user }, 'User.findOne by email completed');
        } catch (findError: any) {
          logger.error({
            findError,
            errorMessage: findError?.message,
            errorCode: findError?.code
          }, 'Error in User.findOne by email');
          throw findError;
        }
      }

      logger.debug(
        {
          userFound: !!user,
          userDetails: user
            ? {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                hasPassword: !!user.password,
                passwordHashLength: user.password ? user.password.length : 0,
                passwordHashPrefix: user.password ? user.password.substring(0, 10) + '...' : 'none',
                createdAt: user.createdAt,
                forcePasswordChange: user.forcePasswordChange,
              }
            : null,
        },
        'User query result'
      );

      if (!user) {
        // MEDIUM-006: Enhanced security logging for failed authentication
        logger.warn(
          {
            username,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            timestamp: new Date().toISOString(),
            event: 'FAILED_LOGIN_ATTEMPT',
            reason: 'USER_NOT_FOUND',
          },
          'Security Event: Failed login attempt - user not found'
        );
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (!user.password) {
        logger.error({ username }, 'User found but password hash is missing from DB query result');
        return res.status(500).json({ message: 'Internal server error: User data incomplete.' });
      }

      const passwordHash = user.password;

      logger.debug(
        {
          passwordLength: password.length,
          passwordHash,
          hashFormatCheck: {
            startsWithDollar: passwordHash.startsWith('$'),
            hashParts: passwordHash.split('$').length,
            algorithm: passwordHash.split('$')[1],
            saltRounds: passwordHash.split('$')[2],
          },
        },
        'About to perform bcrypt.compare'
      );

      const isMatch = await bcrypt.compare(password, passwordHash);

      logger.debug(
        {
          comparisonResult: isMatch,
          plaintextLength: password.length,
          hashLength: passwordHash.length,
        },
        'bcrypt.compare result'
      );

      if (!isMatch) {
        // MEDIUM-006: Enhanced security logging for failed authentication
        logger.warn(
          {
            username,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            timestamp: new Date().toISOString(),
            event: 'FAILED_LOGIN_ATTEMPT',
          },
          'Security Event: Failed login attempt - invalid password'
        );
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // --- Revised Logic Start: Support Multiple Concurrent Sessions ---
      const newSessionId = uuidv4();
      logger.info({ username: user.username, sessionId: newSessionId }, 'Adding new session');

      // Initialize activeSessionIds array if it doesn't exist
      if (!user.activeSessionIds) {
        user.activeSessionIds = [];
      }

      // Add new session to array (allowing concurrent logins)
      user.activeSessionIds.push(newSessionId);

      // Optional: Limit to last 10 sessions to prevent unbounded growth
      if (user.activeSessionIds.length > 10) {
        user.activeSessionIds = user.activeSessionIds.slice(-10);
        logger.debug({ username: user.username }, 'Trimmed activeSessionIds to last 10 sessions');
      }

      // Save the updated session array to the database
      await User.findByIdAndUpdate(user._id, { activeSessionIds: user.activeSessionIds });
      logger.info(
        { username: user.username, totalSessions: user.activeSessionIds.length },
        'Successfully added session to activeSessionIds'
      );
      // --- Revised Logic End ---

      // Prepare payload for JWT
      const payload = {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      };

      // Validate JWT_SECRET is configured
      const signingSecret = process.env.JWT_SECRET;
      if (!signingSecret) {
        logger.error('JWT_SECRET not configured');
        return res
          .status(500)
          .json({ message: 'Internal server error: Signing key not configured.' });
      }

      logger.info({ username, sessionId: newSessionId }, 'Generating JWT');

      // Generate JWT with the new session ID as jwtid, using the directly read secret
      // MEDIUM-002: Reduced token expiration from 1h to 30m for security
      const token = jwt.sign(
        payload,
        signingSecret, // Use the directly read variable
        {
          expiresIn: '30m', // Reduced session window to mitigate hijacking risk
          jwtid: newSessionId, // Use the new session ID as the JWT ID (jti)
        }
      );

      logger.debug({ username }, 'Setting HttpOnly cookie');

      // Set the token as an HttpOnly cookie
      // Fix: Both staging and production are served over HTTPS and need cross-origin cookies
      const isProductionLike =
        process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
      const cookieOptions: any = {
        // Use 'any' temporarily or define a specific type
        httpOnly: true,
        secure: isProductionLike, // Must be true for HTTPS environments (staging + production)
        // Use 'none' for cross-origin requests in HTTPS environments
        sameSite: (isProductionLike ? 'none' : 'lax') as 'none' | 'lax',
        maxAge: 1800000, // MEDIUM-002: 30 minutes in milliseconds (matches JWT expiration)
        path: '/',
        // Removed explicit domain to let the browser use the current domain
      };

      logger.debug(
        {
          cookieOptions,
          responseHeaders: res.getHeaders ? res.getHeaders() : 'Headers not available',
        },
        'Cookie set, response headers'
      );
      res.cookie('authToken', token, cookieOptions);

      // MEDIUM-006: Enhanced security logging for successful authentication
      logger.info(
        {
          username,
          userId: user._id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          timestamp: new Date().toISOString(),
          sessionId: newSessionId,
          event: 'SUCCESSFUL_LOGIN',
        },
        'Security Event: Successful user login'
      );
      res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          forcePasswordChange: user.forcePasswordChange || false,
        },
        token: token, // Include token in response for client-side storage
        message: 'Login successful',
      });
    } catch (error: any) {
      logger.error({
        error,
        errorMessage: error?.message,
        errorStack: error?.stack,
        errorCode: error?.code
      }, 'Server error during login');
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);

// @desc    Logout user (Server-side: clear HttpOnly cookie, remove specific session)
// @route   POST /api/auth/logout
// @access  Private (requires valid token to identify user)
router.post('/logout', protect, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    // Should not happen if 'protect' middleware is working
    return res.status(401).json({ message: 'Not authorized, no user found' });
  }

  try {
    // Refetch the full user document to ensure 'save' method is available
    const user = await User.findById(req.user._id);
    if (!user) {
      // Should not happen if user ID from token is valid
      return res.status(404).json({ message: 'User not found' });
    }

    // Extract the JWT to get the session ID (jti)
    let token: string | undefined;
    if (req.cookies?.authToken) {
      token = req.cookies.authToken;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (token) {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        try {
          const decoded = jwt.verify(token, jwtSecret) as any;
          const jti = decoded.jti;

          // Remove only this specific session from the array
          if (jti && user.activeSessionIds && user.activeSessionIds.length > 0) {
            const beforeCount = user.activeSessionIds.length;
            user.activeSessionIds = user.activeSessionIds.filter(id => id !== jti);
            const afterCount = user.activeSessionIds.length;
            logger.info(
              { username: user.username, jti, beforeCount, afterCount },
              'Removed session from activeSessionIds'
            );
          } else {
            logger.debug({ username: user.username }, 'No valid session ID to remove');
          }
        } catch (jwtError) {
          logger.warn({ error: jwtError }, 'Failed to decode JWT for session removal');
          // Continue with logout even if we can't remove the specific session
        }
      }
    }

    await user.save();

    // MEDIUM-006: Enhanced security logging for logout/session invalidation
    logger.info(
      {
        username: user.username,
        userId: user._id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
        event: 'SESSION_INVALIDATED',
        remainingSessions: user.activeSessionIds?.length || 0,
      },
      'Security Event: User session invalidated (logout)'
    );

    // Clear the HttpOnly cookie with matching secure attributes
    const isProductionLike =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const cookieOptions = {
      httpOnly: true,
      secure: isProductionLike, // Match the login cookie settings
      sameSite: (isProductionLike ? 'none' : 'lax') as 'none' | 'lax',
      expires: new Date(0),
      path: '/',
      // No domain specified, letting browser use current domain
    };

    logger.debug(
      {
        cookieOptions,
        responseHeaders: res.getHeaders ? res.getHeaders() : 'Headers not available',
      },
      'Cookie clear options and response headers'
    );
    res.cookie('authToken', '', cookieOptions);

    return res.status(200).json({ message: 'User logged out successfully' });
  } catch (error) {
    logger.error({ error }, 'Error logging out user');
    return res.status(500).json({ message: 'Server error during logout' });
  }
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
router.get('/profile', protect, getUserProfile); // Use the imported controller

// NEW ROUTE: Verify Token & Get User
// @desc    Verify the current user's token and return user data
// @route   GET /api/auth/verify
// @access  Private (requires valid token via protect middleware)
router.get('/verify', protect, checkSession, (req, res) => {
  // The 'protect' middleware verifies the token and attaches the user object (minus password) to req.user.
  // The 'checkSession' middleware ensures the session ID (jti) matches the user's activeSessionId.
  // If we reach here, the token is valid and the session is active.
  const user = req.user as any;
  logger.info({ username: user?.username, userId: user?._id }, 'Token verified');
  res.status(200).json({
    message: 'Token verified successfully.',
    user: {
      ...(user._doc || user), // Spread the mongoose document or plain SQLite object
      forcePasswordChange: user.forcePasswordChange || false, // Ensure this field is included
    },
  });
});

export default router;
