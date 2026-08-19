// ==========================================================================
// RATE LIMITING — Redis-backed, isliye multiple gateway instances (jab tum
// K8s me gateway ko 5-10 replicas tak scale karoge, HPA ke through) sab
// EK HI shared counter use karte hain. Agar ye in-memory hota (plain
// express-rate-limit), to har pod ka apna alag counter hota aur limit
// bypass ho jaati (attacker round-robin se different pods hit karke).
//
// 3 lakh users ke liye hum layered limits laga rahe hain:
//   1. Global limiter       -> saare routes, IP-based, DDoS se basic bachav
//   2. Auth limiter (strict)-> /auth/login, /auth/otp -> brute force/OTP spam roko
//   3. Standard API limiter -> baaki authenticated routes, user-id based
// ==========================================================================
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

function buildLimiter(redisClient, { windowMs, max, prefix, keyFn }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFn || ((req) => req.ip),
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: `rl:${prefix}:`,
    }),
    message: { success: false, message: 'Too many requests. Please slow down.' },
  });
}

function createLimiters(redisClient) {
  return {
    // 300 req / 15 min per IP — general DDoS-style abuse ke against
    global: buildLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 300,
      prefix: 'global',
    }),
    // 10 login/OTP attempts / 15 min per IP — credential stuffing / OTP bombing roko
    auth: buildLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 10,
      prefix: 'auth',
    }),
    // 120 req / min per authenticated user (id from verified JWT)
    api: buildLimiter(redisClient, {
      windowMs: 60 * 1000,
      max: 120,
      prefix: 'api',
      keyFn: (req) => req.userId || req.ip,
    }),
  };
}

module.exports = { createLimiters };
