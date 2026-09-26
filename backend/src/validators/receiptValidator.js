import { validate } from '../middleware/validationMiddleware.js';

export const validateReceipt = validate([
  (req) => (!req.body.supplier || !req.body.supplier.trim() ? 'Supplier is required' : null),
  (req) => (!req.body.warehouseId && !req.body.warehouse ? 'Warehouse is required' : null),
  (req) => {
    const lines = req.body.lines || req.body.items;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return 'Receipt must contain at least one line item';
    }
    return null;
  },
]);
