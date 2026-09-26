import mongoose from 'mongoose';
import env from './env.js';

/**
 * Connect to MongoDB using Mongoose with timeout and event handlers.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    throw error;
  }
};

// Log runtime connection issues after initial connect
mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB runtime error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

export default connectDB;
