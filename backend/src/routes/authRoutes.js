import { Router } from 'express';
import {
  signup,
  login,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public authentication routes (rate limited)
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);

// Password recovery routes (strictly rate limited)
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/reset-password', otpLimiter, resetPassword);

// Protected routes
router.get('/me', authMiddleware, getMe);

export default router;
