import { generateSecureOTP, hashOTP, verifyOTPHash } from '../utils/otp.js';

export const generateOTP = () => generateSecureOTP();

export const hashAndStoreOTP = async (otp) => {
  return hashOTP(otp);
};

export const verifyOTP = async (plainOtp, hashedOtp) => {
  return verifyOTPHash(plainOtp, hashedOtp);
};
