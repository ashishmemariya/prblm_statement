import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Generate a JWT token containing user ID and role.
 *
 * @param {string} userId
 * @param {string} role
 * @returns {string} Signed JWT token
 */
export const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token
 * @returns {object} Decoded token payload
 */
export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};
