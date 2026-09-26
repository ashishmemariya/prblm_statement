import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import env from './config/env.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import notFoundMiddleware from './middleware/notFoundMiddleware.js';
import errorMiddleware from './middleware/errorMiddleware.js';

const app = express();

// --------------- Security ---------------
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// Global API Rate Limiting — 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});
app.use('/api', limiter);

// --------------- Body parsing ---------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------- Routes ---------------
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);

// --------------- Error handling ---------------
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
