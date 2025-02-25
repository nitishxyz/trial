module.exports = {
  apps: [
    {
      name: "wallet-monitor",
      script: "src/services/wallet/monitor.ts",
      interpreter: "bun",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/wallet-monitor-error.log",
      out_file: "./logs/wallet-monitor-out.log",
      merge_logs: true,
      // Restart settings
      max_restarts: 10,
      min_uptime: "10s",
      // Graceful shutdown
      kill_timeout: 5000,
      // Other settings
      listen_timeout: 8000,
      shutdown_with_message: true,
    },
  ],
};
