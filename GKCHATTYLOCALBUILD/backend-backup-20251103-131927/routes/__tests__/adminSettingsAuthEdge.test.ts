import express from 'express';
import request from 'supertest';
import adminSettingsRoutes from '../../routes/adminSettingsRoutes';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/settings', adminSettingsRoutes);
  return app;
};

describe('Admin Settings Routes – Auth edge cases', () => {
  const app = buildTestApp();

  it('should reject request with 401 when no auth token provided', async () => {
    await request(app).get('/api/admin/settings/openai-config').expect(401);
  });
});
