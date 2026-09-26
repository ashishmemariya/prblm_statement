import User, { USER_ROLES } from '../models/User.js';
import { generateToken } from '../utils/token.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../utils/otp.js';
import env from '../config/env.js';

/**
 * Register a new user account.
 * POST /api/auth/signup
 */
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Check if role is valid if provided
    let assignedRole = role;
    if (assignedRole && !Object.values(USER_ROLES).includes(assignedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${Object.values(USER_ROLES).join(', ')}`,
      });
    }

    // If no role provided, default to inventory_manager if it's the first user, else warehouse_staff
    if (!assignedRole) {
      const userCount = await User.countDocuments();
      assignedRole =
        userCount === 0
          ? USER_ROLES.INVENTORY_MANAGER
          : USER_ROLES.WAREHOUSE_STAFF;
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: assignedRole,
    });

    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    // Handle MongoDB duplicate key error cleanly
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }
    next(error);
  }
};

/**
 * Log in with email and password.
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Find user with password field included
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    const token = generateToken(user._id.toString(), user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user profile.
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
};

/**
 * Request password reset OTP.
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    let devOtp = null;

    if (user) {
      const otp = generateSecureOTP();
      const otpHash = await hashOTP(otp);
      const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000);

      user.resetPasswordOtpHash = otpHash;
      user.resetPasswordOtpExpires = expiresAt;
      await user.save({ validateBeforeSave: false });

      if (env.NODE_ENV !== 'production') {
        console.log(`\n🔑 [DEV ONLY] Password reset OTP for ${user.email}: ${otp} (expires in ${env.OTP_EXPIRES_MINUTES}m)\n`);
        devOtp = otp;
      }
    }

    // Always return a generic success message to prevent user enumeration
    const responsePayload = {
      success: true,
      message: 'If the provided email is registered, a password reset code has been sent.',
    };

    if (env.NODE_ENV !== 'production' && devOtp) {
      responsePayload.devOtp = devOtp;
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * Verify password reset OTP.
 * POST /api/auth/verify-otp
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select('+resetPasswordOtpHash +resetPasswordOtpExpires');

    if (
      !user ||
      !user.resetPasswordOtpHash ||
      !user.resetPasswordOtpExpires ||
      user.resetPasswordOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    const isValid = await verifyOTPHash(otp.toString().trim(), user.resetPasswordOtpHash);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password with verified OTP.
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword, password } = req.body;
    const targetPassword = newPassword || password;

    if (!email || !otp || !targetPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required',
      });
    }

    if (targetPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select('+resetPasswordOtpHash +resetPasswordOtpExpires');

    if (
      !user ||
      !user.resetPasswordOtpHash ||
      !user.resetPasswordOtpExpires ||
      user.resetPasswordOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    const isValid = await verifyOTPHash(otp.toString().trim(), user.resetPasswordOtpHash);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    // Set new password and invalidate OTP
    user.password = targetPassword;
    user.resetPasswordOtpHash = undefined;
    user.resetPasswordOtpExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You may now log in.',
    });
  } catch (error) {
    next(error);
  }
};
