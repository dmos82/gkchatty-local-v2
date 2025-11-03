import request from 'supertest';
import * as jwt from 'jsonwebtoken';

import { protect, isAdmin } from '../authMiddleware';
import User from '../../models/UserModel';
import { setupTestApp } from '../../test-utils/testSetup';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'edge_secret_1234567890abcdefedge';

const buildApp = () => {
  const app = setupTestApp();
  // Protected admin route
  app.get('/admin/test', protect, isAdmin, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

describe('authMiddleware edge cases', () => {
  const app = buildApp();

  // Global hooks handle DB connection lifecycle.

  const signToken = (payload: object, opts?: jwt.SignOptions, secret?: string) =>
    jwt.sign(payload, secret || (process.env.JWT_SECRET as string), opts);

  it('rejects expired JWT token', async () => {
    const user = await User.create({ username: 'u1', password: 'x', role: 'admin' });
    const expired = Math.floor(Date.now() / 1000) - 60; // 1 min ago
    const token = signToken(
      { userId: user._id, role: 'admin', exp: expired },
      { algorithm: 'HS256', noTimestamp: true }
    );

    await request(app)
      .get('/admin/test')
      .set('Cookie', [`authToken=${token}`])
      .expect(401);
  });

  it('rejects malformed token', async () => {
    await request(app).get('/admin/test').set('Cookie', ['authToken=not-a-token']).expect(401);
  });

  it('rejects token signed with wrong secret', async () => {
    const user = await User.create({ username: 'u2', password: 'x', role: 'admin' });
    const token = signToken(
      { userId: user._id, role: 'admin' },
      { expiresIn: '1h' },
      'wrongsecret'
    );
    await request(app)
      .get('/admin/test')
      .set('Cookie', [`authToken=${token}`])
      .expect(401);
  });

  it('rejects when user not found in DB', async () => {
    const ghostUserId = '000000000000000000000000';
    const token = signToken({ userId: ghostUserId, role: 'admin' }, { expiresIn: '1h' });
    await request(app)
      .get('/admin/test')
      .set('Cookie', [`authToken=${token}`])
      .expect(401);
  });

  it('rejects non-admin user with 403', async () => {
    const user = await User.create({ username: 'u3', password: 'x', role: 'user' });
    const token = signToken({ userId: user._id, role: 'user' }, { expiresIn: '1h' });
    await request(app)
      .get('/admin/test')
      .set('Cookie', [`authToken=${token}`])
      .expect(403);
  });
});
