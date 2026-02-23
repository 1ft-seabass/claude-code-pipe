module.exports = {
  apps: [
    {
      name: 'claude-code-pipe',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PM2_HOME: './.pm2'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // クラッシュ時の再起動設定
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
};
