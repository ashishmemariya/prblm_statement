import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authentication endpoints (login, signup)
 * 30 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

/**
 * Strict rate limiter for OTP requests (forgot-password, verify-otp, reset-password)
 * 10 requests per 15 minutes per IP
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests, please try again after 15 minutes.',
  },
});
