module.exports = {
  apps: [
    {
      // Backend API Server
      name: 'gkchatty-backend',
      script: './backend/dist/index.js',
      cwd: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local',
      instances: 4, // Use 4 CPU cores (adjust based on your server)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 4001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4001
      },
      error_file: './logs/pm2-backend-error.log',
      out_file: './logs/pm2-backend-out.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '1G',
      // Auto-restart if memory exceeds 1GB
      autorestart: true,
      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
      // Load balancing method
      instance_var: 'INSTANCE_ID',
      // Graceful shutdown
      kill_timeout: 5000,
      // Health check
      min_uptime: '10s',
      max_restarts: 10,
      // Watch for file changes in development
      watch: false, // Enable in dev if needed
      ignore_watch: ['node_modules', 'logs', '.git', 'dist'],
      // Environment-specific configurations
      wait_ready: true,
      listen_timeout: 3000,
    },
    {
      // Frontend Next.js Server (if you want PM2 to manage it)
      name: 'gkchatty-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/gkchatty-local/frontend',
      instances: 2, // Next.js handles its own optimizations
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 4003
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4003
      },
      error_file: '../logs/pm2-frontend-error.log',
      out_file: '../logs/pm2-frontend-out.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '1G',
      autorestart: true,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      min_uptime: '10s',
      max_restarts: 10,
    }
  ],

  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-production-server',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/gkchatty.git',
      path: '/var/www/gkchatty',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to production"'
    },
    staging: {
      user: 'deploy',
      host: 'your-staging-server',
      ref: 'origin/staging',
      repo: 'git@github.com:yourusername/gkchatty.git',
      path: '/var/www/gkchatty-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to staging"'
    }
  }
};