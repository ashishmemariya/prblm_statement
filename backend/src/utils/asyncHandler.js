/**
 * Wrapper for async express route handlers to pass errors to next() middleware.
 *
 * @param {Function} fn
 * @returns {Function}
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
