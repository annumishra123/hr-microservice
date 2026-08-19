// Shared Redis client factory. Redis yahan TEEN alag purposes ke liye use
// hota hai (alag-alag services me):
//   1. Rate limiting store (api-gateway)          -> rate-limit-redis
//   2. Caching (employee/attendance lookups)      -> GET/SET with TTL
//   3. Socket.IO adapter (notification-service)   -> multi-instance broadcast
const { createClient } = require('redis');

function makeRedisClient(label = 'default') {
  const client = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
  client.on('error', (err) => console.error(`[redis:${label}] error`, err.message));
  client.on('connect', () => console.log(`[redis:${label}] connected`));
  return client;
}

module.exports = { makeRedisClient };
