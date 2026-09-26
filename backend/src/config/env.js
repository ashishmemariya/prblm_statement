import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env from backend root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/stocksense',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'stocksense_dev_jwt_secret_key_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  OTP_EXPIRES_MINUTES: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10,
};

export default env;
