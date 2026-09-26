import { validate } from '../middleware/validationMiddleware.js';

export const validateDelivery = validate([
  (req) => (!req.body.customer || !req.body.customer.trim() ? 'Customer is required' : null),
  (req) => (!req.body.warehouseId && !req.body.warehouse ? 'Warehouse is required' : null),
  (req) => {
    const lines = req.body.lines || req.body.items;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return 'Delivery must contain at least one line item';
    }
    return null;
  },
]);
