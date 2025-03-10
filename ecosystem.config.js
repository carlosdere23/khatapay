module.exports = {
  apps: [{
    name: "khatapay",
    script: "server.js",
    autorestart: true,
    watch: ["server.js", "public"],
    ignore_watch: ["node_modules", "db.json"],
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production"
    }
  }]
};
