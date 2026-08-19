// Har incoming request ko ek unique ID deta hai (X-Correlation-Id header).
// Ye ID gateway se lekar auth/employee/attendance service tak, aur unke
// logs tak, saath jaata hai. Isse distributed tracing possible hoti hai —
// agar ek request fail ho, to sab services ke logs me same ID search karke
// poora request-flow trace kar sakte ho (mini "Jaeger/Zipkin" jaisa concept).
const { v4: uuidv4 } = require('uuid');

module.exports = function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
};
