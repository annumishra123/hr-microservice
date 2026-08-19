// Common structured logger — har service isko copy/use karta hai.
// Production me isko Winston + ELK/Loki se replace karo, abhi console-based
// JSON logging hai taaki Docker/K8s logs aggregate karna easy ho.
function log(level, service, msg, meta = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service,
    msg,
    ...meta,
  }));
}

module.exports = (serviceName) => ({
  info: (msg, meta) => log('info', serviceName, msg, meta),
  warn: (msg, meta) => log('warn', serviceName, msg, meta),
  error: (msg, meta) => log('error', serviceName, msg, meta),
});
