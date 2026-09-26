import User from '../models/User.js';
import { verifyToken } from '../utils/token.js';

/**
 * Authentication middleware.
 * Validates the JWT Bearer token and attaches the authenticated user to `req.user`.
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required. Format: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing',
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (_err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User associated with this token no longer exists',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account has been deactivated',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export default authMiddleware;
