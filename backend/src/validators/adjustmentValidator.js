import { validate } from '../middleware/validationMiddleware.js';

export const validateAdjustment = validate([
  (req) => (!req.body.warehouseId && !req.body.warehouse ? 'Warehouse is required' : null),
  (req) => (!req.body.reason || !req.body.reason.trim() ? 'Reason is required' : null),
  (req) => {
    const lines = req.body.lines || req.body.items;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return 'Adjustment must contain at least one line item';
    }
    return null;
  },
]);
