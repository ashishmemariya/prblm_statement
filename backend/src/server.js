import app from './app.js';
import env from './config/env.js';
import connectDB from './config/db.js';
import mongoose from 'mongoose';

const startServer = async () => {
  // Connect to MongoDB
  try {
    await connectDB();
  } catch (_error) {
    console.warn(
      '⚠️  Continuing server startup. MongoDB will retry on subsequent operations or when service is available.',
    );
  }

  const server = app.listen(env.PORT, () => {
    console.log(
      `🚀 StockSense API running on port ${env.PORT} [${env.NODE_ENV}]`,
    );
  });

  // --------------- Graceful shutdown ---------------
  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    server.close(async () => {
      try {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.connection.close();
          console.log('🛑 MongoDB connection closed');
        }
      } catch (err) {
        console.error('Error closing MongoDB connection:', err.message);
      }
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful close hangs
    setTimeout(() => {
      console.error('⚠️  Forced exit after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer();
