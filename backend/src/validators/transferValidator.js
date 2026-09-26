import { validate } from '../middleware/validationMiddleware.js';

export const validateTransfer = validate([
  (req) => (!req.body.fromWarehouseId && !req.body.sourceWarehouse ? 'Source warehouse is required' : null),
  (req) => (!req.body.toWarehouseId && !req.body.destinationWarehouse ? 'Destination warehouse is required' : null),
  (req) => {
    const lines = req.body.lines || req.body.items;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return 'Transfer must contain at least one line item';
    }
    return null;
  },
]);
