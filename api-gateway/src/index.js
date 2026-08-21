// // ==========================================================================
// // API GATEWAY — sabka single entry point.
// //
// // Zimmedariyan (responsibilities):
// //   1. TLS termination / single public port (baaki services internal rehte hain)
// //   2. Rate limiting (Redis-backed, layered)
// //   3. JWT verification (protected routes ke liye)
// //   4. Request routing/proxying to correct microservice
// //   5. Correlation ID injection for distributed tracing
// //   6. Central CORS + security headers (helmet)
// //
// // Isse ek client (mobile app / web app) ko sirf ek hi base URL pata hona
// // chahiye — gateway internally jaanta hai konsa service kahan chal raha hai.
// // ==========================================================================
// /* eslint-disable no-undef */

// require('dotenv').config();
// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const proxy = require('express-http-proxy');
// const { createClient } = require('redis');

// const correlationId = require('./utils/correlationId');
// const verifyAuth = require('./middleware/verifyAuth');
// const { createLimiters } = require('./middleware/rateLimiter');

// const app = express();
// const PORT = process.env.PORT || 4000;

// const SERVICES = {
//   auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:5001',
//   employee: process.env.EMPLOYEE_SERVICE_URL || 'http://employee-service:5002',
//   attendance: process.env.ATTENDANCE_SERVICE_URL || 'http://attendance-service:5003',
//   notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:5004',
// };

// async function start() {
//   const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
//   redisClient.on('error', (e) => console.error('[gateway redis]', e.message));
//   await redisClient.connect();

//   const limiters = createLimiters(redisClient);

//   app.use(helmet());
//   app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
//   app.use(correlationId);
//   app.use(limiters.global); // sabse pehle global rate limit

//   // Har proxied request pe correlation id + (agar available) user id ko
//   // header ke roop me downstream service tak forward karo.
//   const forwardHeaders = (req) => ({
//     'X-Correlation-Id': req.correlationId,
//     ...(req.userId ? { 'X-User-Id': req.userId } : {}),
//   });

//   app.get('/health', (req, res) => res.json({ success: true, gateway: 'up' }));

//   // ---- AUTH SERVICE (public routes, strict rate limit) ----
//   app.use(
//     '/api/auth',
//     // limiters.auth,
//     proxy(SERVICES.auth, {
//       proxyReqPathResolver: (req) => `/api/auth${req.url}`,
//       proxyReqOptDecorator: (opts, srcReq) => {
//         opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
//         return opts;
//       },
//     })
//   );

//   // ---- EMPLOYEE SERVICE (protected) ----
//   app.use(
//     '/api/employees',
//     verifyAuth,
//     limiters.api,
//     proxy(SERVICES.employee, {
//       proxyReqPathResolver: (req) => `/api/employees${req.url}`,
//       proxyReqOptDecorator: (opts, srcReq) => {
//         opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
//         return opts;
//       },
//     })
//   );

//   // ---- ATTENDANCE SERVICE (protected) ----
//   app.use(
//     '/api/attendance',
//     verifyAuth,
//     limiters.api,
//     proxy(SERVICES.attendance, {
//       proxyReqPathResolver: (req) => `/api/attendance${req.url}`,
//       proxyReqOptDecorator: (opts, srcReq) => {
//         opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
//         return opts;
//       },
//     })
//   );

//   // ---- NOTIFICATION SERVICE (protected, REST part; sockets connect directly) ----
//   app.use(
//     '/api/notifications',
//     verifyAuth,
//     limiters.api,
//     proxy(SERVICES.notification, {
//       proxyReqPathResolver: (req) => `/api/notifications${req.url}`,
//       proxyReqOptDecorator: (opts, srcReq) => {
//         opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
//         return opts;
//       },
//     })
//   );

//   app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

//   app.listen(PORT, () => console.log(`[api-gateway] listening on :${PORT}`));
// }

// start().catch((err) => {
//   console.error('[api-gateway] failed to start', err);
//   process.exit(1);
// });
















// ==========================================================================
// API GATEWAY — sabka single entry point.
//
// Zimmedariyan (responsibilities):
//   1. TLS termination / single public port (baaki services internal rehte hain)
//   2. Rate limiting (Redis-backed, layered)
//   3. JWT verification (protected routes ke liye)
//   4. Request routing/proxying to correct microservice
//   5. Correlation ID injection for distributed tracing
//   6. Central CORS + security headers (helmet)
//   7. Wake-all route — Render free-tier services ko sone se bachane ke liye
//
// Isse ek client (mobile app / web app) ko sirf ek hi base URL pata hona
// chahiye — gateway internally jaanta hai konsa service kahan chal raha hai.
// ==========================================================================
/* eslint-disable no-undef */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const proxy = require('express-http-proxy');
const axios = require('axios');
const { createClient } = require('redis');

const correlationId = require('./utils/correlationId');
const verifyAuth = require('./middleware/verifyAuth');
const { createLimiters } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 4000;

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:5001',
  employee: process.env.EMPLOYEE_SERVICE_URL || 'http://employee-service:5002',
  attendance: process.env.ATTENDANCE_SERVICE_URL || 'http://attendance-service:5003',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:5004',
};

// ---------------------------------------------------------------------------
// WAKE-ALL: Render free tier har service ko 15 min inactivity ke baad sula
// deta hai. Ye list un sabhi services ke public health-check URLs ki hai.
// Cron job (cron-job.org / UptimeRobot) sirf isi ek /wake-all route ko
// har 10-12 minute me hit karega, aur ye andar se sabko jaga dega.
//
// NOTE: Yahan PUBLIC Render URLs daalne hain (jo browser se accessible hain),
// na ki internal Docker URLs (jo SERVICES object me hain, wo sirf internal
// network ke liye hain aur cron job se reachable nahi honge).
// ---------------------------------------------------------------------------
const WAKE_URLS = [
  'https://auth-service-9lo4.onrender.com/health',
  'https://employee-service-gss4.onrender.com/health',
  'https://attendance-service-qnrp.onrender.com/health',
  'https://notification-service-68z2.onrender.com/health',
  // ... baaki services yahan add karo
];

async function start() {
  const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
  redisClient.on('error', (e) => console.error('[gateway redis]', e.message));
  await redisClient.connect();

  const limiters = createLimiters(redisClient);

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
  app.use(correlationId);
  app.use(limiters.global); // sabse pehle global rate limit

  // Har proxied request pe correlation id + (agar available) user id ko
  // header ke roop me downstream service tak forward karo.
  const forwardHeaders = (req) => ({
    'X-Correlation-Id': req.correlationId,
    ...(req.userId ? { 'X-User-Id': req.userId } : {}),
  });

  app.get('/health', (req, res) => res.json({ success: true, gateway: 'up' }));

  // ---- WAKE-ALL: cron job isi route ko hit karega ----
  app.get('/wake-all', async (req, res) => {
    const results = await Promise.allSettled(
      WAKE_URLS.map((url) => axios.get(url, { timeout: 30000 }))
    );

    const status = results.map((r, i) => ({
      service: WAKE_URLS[i],
      ok: r.status === 'fulfilled',
      ...(r.status === 'fulfilled'
        ? { httpStatus: r.value.status }
        : { error: r.reason?.message || 'failed' }),
    }));

    res.json({ success: true, message: 'Ping sent to all services', status });
  });

  // ---- AUTH SERVICE (public routes, strict rate limit) ----
  app.use(
    '/api/auth',
    // limiters.auth,
    proxy(SERVICES.auth, {
      timeout: 60000, // cold-start ke waqt zyada time dena taaki 502 na aaye
      proxyReqPathResolver: (req) => `/api/auth${req.url}`,
      proxyReqOptDecorator: (opts, srcReq) => {
        opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
        return opts;
      },
    })
  );

  // ---- EMPLOYEE SERVICE (protected) ----
  app.use(
    '/api/employees',
    verifyAuth,
    limiters.api,
    proxy(SERVICES.employee, {
      timeout: 60000,
      proxyReqPathResolver: (req) => `/api/employees${req.url}`,
      proxyReqOptDecorator: (opts, srcReq) => {
        opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
        return opts;
      },
    })
  );

  // ---- ATTENDANCE SERVICE (protected) ----
  app.use(
    '/api/attendance',
    verifyAuth,
    limiters.api,
    proxy(SERVICES.attendance, {
      timeout: 60000,
      proxyReqPathResolver: (req) => `/api/attendance${req.url}`,
      proxyReqOptDecorator: (opts, srcReq) => {
        opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
        return opts;
      },
    })
  );

  // ---- NOTIFICATION SERVICE (protected, REST part; sockets connect directly) ----
  app.use(
    '/api/notifications',
    verifyAuth,
    limiters.api,
    proxy(SERVICES.notification, {
      timeout: 60000,
      proxyReqPathResolver: (req) => `/api/notifications${req.url}`,
      proxyReqOptDecorator: (opts, srcReq) => {
        opts.headers = { ...opts.headers, ...forwardHeaders(srcReq) };
        return opts;
      },
    })
  );

  app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

  app.listen(PORT, () => console.log(`[api-gateway] listening on :${PORT}`));
}

start().catch((err) => {
  console.error('[api-gateway] failed to start', err);
  process.exit(1);
});