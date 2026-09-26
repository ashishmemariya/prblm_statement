import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Generate a cryptographically secure 6-digit numeric OTP.
 *
 * @returns {string} 6-digit string
 */
export const generateSecureOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hash an OTP using bcrypt before storing in database.
 *
 * @param {string} otp
 * @returns {Promise<string>}
 */
export const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

/**
 * Verify a plain OTP against its stored hash.
 *
 * @param {string} plainOtp
 * @param {string} hashedOtp
 * @returns {Promise<boolean>}
 */
export const verifyOTPHash = async (plainOtp, hashedOtp) => {
  if (!plainOtp || !hashedOtp) return false;
  return bcrypt.compare(plainOtp, hashedOtp);
};
