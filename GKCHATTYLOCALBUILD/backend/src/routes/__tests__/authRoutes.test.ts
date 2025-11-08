import request from 'supertest';
import { Express } from 'express';
import * as bcrypt from 'bcryptjs';
import { setupTestApp } from '../../test-utils/testSetup';
import User from '../../models/UserModel';
import authRoutes from '../authRoutes';

describe('Auth Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = setupTestApp();
    app.use('/api/auth', authRoutes);
  });

  beforeEach(async () => {
    // Clear users collection before each test
    await User.deleteMany({});
  });

  describe('POST /api/auth/login', () => {
    const testUser = {
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'TestPassword123!',
    };

    beforeEach(async () => {
      // Create test user
      // HIGH-004: Use consistent bcrypt work factor (12) in tests
      const hashedPassword = await bcrypt.hash(testUser.password, 12);
      const createdUser = await User.create({
        username: testUser.username,
        email: testUser.email,
        password: hashedPassword,
        role: 'user',
      });

      // Spy on User.findOne to return a chainable object supporting .select().
      jest.spyOn(User, 'findOne').mockImplementation((query: any) => {
        // Determine if the query matches our created user
        const searchTerms = query?.$or ?? [];
        const match = searchTerms.some((cond: any) => {
          return (
            (cond.username && cond.username === createdUser.username) ||
            (cond.email && cond.email === createdUser.email)
          );
        });

        const resultUser = match ? createdUser : null;

        return {
          select: jest.fn().mockReturnValue(Promise.resolve(resultUser)),
        } as any;
      });

      // Stub save() on the created user to avoid potential concurrency errors
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      createdUser.save = jest.fn().mockResolvedValue(createdUser);
    });

    test('should login successfully with username', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: testUser.username,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.headers['set-cookie'][0]).toContain('authToken=');
    });

    test('should login successfully with email in username field', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: testUser.email, // Email in username field
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.headers['set-cookie'][0]).toContain('authToken=');
    });

    test('should fail with incorrect password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: testUser.username,
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should fail with non-existent username', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'nonexistentuser',
        password: testUser.password,
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should fail with non-existent email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'nonexistent@example.com',
        password: testUser.password,
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should fail when username field is missing', async () => {
      const response = await request(app).post('/api/auth/login').send({
        password: testUser.password,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Username and password are required');
    });

    test('should fail when password field is missing', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: testUser.username,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Username and password are required');
    });
  });

  describe('POST /api/auth/register', () => {
    test('should reject registration attempts with 403 (disabled)', async () => {
      const newUser = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'NewPassword123!',
      };

      const response = await request(app).post('/api/auth/register').send(newUser);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Public registration is disabled');
    });

    test('should consistently reject all registration attempts', async () => {
      const existingUser = {
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'Password123!',
      };

      const response = await request(app).post('/api/auth/register').send(existingUser);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Public registration is disabled');
    });
  });

  describe('GET /api/auth/ping', () => {
    test('should return pong response', async () => {
      const response = await request(app).get('/api/auth/ping');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Auth route ping successful');
    });
  });
});
