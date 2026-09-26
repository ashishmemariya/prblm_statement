import { validate } from '../middleware/validationMiddleware.js';

export const validateProduct = validate([
  (req) => (!req.body.name || !req.body.name.trim() ? 'Product name is required' : null),
  (req) => (!req.body.sku || !req.body.sku.trim() ? 'SKU is required' : null),
  (req) => (!req.body.categoryId && !req.body.category ? 'Category is required' : null),
]);
