/**
 * 404 handler — catches requests that don't match any route.
 */
const notFoundMiddleware = (req, res, _next) => {
  res.status(404).json({
    success: false,
    message: `Not found: ${req.method} ${req.originalUrl}`,
  });
};

export default notFoundMiddleware;
