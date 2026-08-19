// Redis caching layer — employee lookups baar-baar Mongo hit na karein.
// 3 lakh users scale pe, employee-profile GET sabse zyada hit hone wala
// endpoint hota hai (dashboard load pe), isliye short-TTL cache lagate hain.
const { makeRedisClient } = require('../../shared/redisClient');

const client = makeRedisClient('employee-cache');
const TTL_SECONDS = 60; // 1 min — balance between freshness & DB load

async function connect() {
  await client.connect();
}

async function getCached(key) {
  const val = await client.get(key);
  return val ? JSON.parse(val) : null;
}

async function setCached(key, value) {
  await client.set(key, JSON.stringify(value), { EX: TTL_SECONDS });
}

async function invalidate(key) {
  await client.del(key);
}

module.exports = { connect, getCached, setCached, invalidate };
