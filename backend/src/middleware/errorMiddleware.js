import env from '../config/env.js';

/**
 * Global error handler.
 * Returns consistent JSON and hides stack traces in production.
 */
// Express 5 supports async errors natively, but we still need
// the 4-argument signature so Express recognises this as an error handler.
// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, _req, res, _next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorMiddleware;
