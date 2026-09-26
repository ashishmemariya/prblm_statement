import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const generateSecureOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

export const verifyOTPHash = async (plainOtp, hashedOtp) => {
  if (!plainOtp || !hashedOtp) return false;
  return bcrypt.compare(plainOtp, hashedOtp);
};

export default generateSecureOTP;
