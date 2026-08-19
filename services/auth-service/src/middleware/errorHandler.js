class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || 500;
  console.error(JSON.stringify({
    level: 'error',
    correlationId: req.headers['x-correlation-id'],
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  }));
  res.status(status).json({ success: false, message: err.message || 'Internal Server Error' });
};

module.exports = { ApiError, asyncHandler, errorHandler };
