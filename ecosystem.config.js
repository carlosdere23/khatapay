// ecosystem.config.js
export default {
  apps: [
    {
      name: "khatapay",
      script: "./server.js",
      cwd: "/root/khatapay",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
