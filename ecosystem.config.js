/**
 * PM2 Ecosystem Configuration - GKChatty
 *
 * Process management for GKChatty backend and frontend services
 *
 * Usage:
 *   pm2 start ecosystem.config.js        # Start all services
 *   pm2 stop all                         # Stop all GKChatty services (MCPs remain running)
 *   pm2 restart gkchatty-backend         # Restart only backend
 *   pm2 logs                             # View logs
 *   pm2 monit                            # Monitor resources
 *   pm2 list                             # List processes
 *
 * Part of: Startup Infrastructure Improvements (Oct 25, 2025)
 */

module.exports = {
  apps: [
    {
      // GKChatty Backend API
      name: 'gkchatty-backend',
      cwd: './packages/backend',
      script: 'pnpm',
      args: 'run dev',
      env: {
        PORT: 4001,
        NODE_ENV: 'development'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/pm2-backend-error.log',
      out_file: './logs/pm2-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000
    },
    {
      // GKChatty Web Frontend
      name: 'gkchatty-frontend',
      cwd: './packages/web',
      script: 'pnpm',
      args: 'run dev',
      env: {
        PORT: 4003,
        NODE_ENV: 'development'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/pm2-frontend-error.log',
      out_file: './logs/pm2-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000
    }
  ],

  /**
   * Production deployment configuration (not used in development)
   *
   * To use in production:
   *   1. Build the apps: pnpm build
   *   2. Set NODE_ENV=production
   *   3. Start with: pm2 start ecosystem.config.js --env production
   */
  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/gkchatty-ecosystem.git',
      path: '/var/www/gkchatty',
      'pre-deploy-local': '',
      'post-deploy': 'pnpm install && pnpm build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
