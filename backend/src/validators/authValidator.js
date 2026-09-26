import { validate } from '../middleware/validationMiddleware.js';

export const validateSignup = validate([
  (req) => (!req.body.name || !req.body.name.trim() ? 'Name is required' : null),
  (req) => (!req.body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email) ? 'Valid email is required' : null),
  (req) => (!req.body.password || req.body.password.length < 6 ? 'Password must be at least 6 characters' : null),
]);

export const validateLogin = validate([
  (req) => (!req.body.email ? 'Email is required' : null),
  (req) => (!req.body.password ? 'Password is required' : null),
]);
