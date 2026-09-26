import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * Simple health check endpoint.
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'StockSense API is running',
  });
});

export default router;
