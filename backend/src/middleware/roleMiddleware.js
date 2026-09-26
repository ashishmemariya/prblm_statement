/**
 * Role-based authorization middleware.
 * Restricts access to specified roles.
 *
 * @param  {...string} allowedRoles
 * @returns {Function} Express middleware
 */
export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking permissions',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires one of: [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
};

export default roleMiddleware;
