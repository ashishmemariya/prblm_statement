import StockLedger from '../models/StockLedger.js';

/**
 * Record an immutable stock movement entry in StockLedger.
 */
export const createLedgerEntry = async ({
  product,
  warehouse,
  location,
  movementType,
  documentType,
  documentCode,
  documentId,
  quantityBefore,
  quantityChange,
  quantityAfter,
  referenceType,
  referenceId,
  performedBy,
  notes = '',
  session,
}) => {
  const options = session ? { session } : {};

  const ledgerDoc = new StockLedger({
    product,
    productId: product,
    warehouse,
    warehouseId: warehouse,
    location,
    movementType,
    documentType: documentType || referenceType || 'Movement',
    documentCode: documentCode || '',
    documentId: documentId || (referenceId ? referenceId.toString() : ''),
    quantityBefore: Number(quantityBefore) || 0,
    quantityChange: Number(quantityChange) || 0,
    qty: Number(quantityChange) || 0,
    quantityAfter: Number(quantityAfter) || 0,
    balanceAfter: Number(quantityAfter) || 0,
    referenceType,
    referenceId,
    performedBy: performedBy ? (typeof performedBy === 'object' ? performedBy.name || performedBy._id : performedBy) : 'System',
    notes,
    timestamp: new Date().toISOString(),
  });

  await ledgerDoc.save(options);
  return ledgerDoc;
};

/**
 * Query ledger history with filters, sorting, and pagination.
 */
export const getLedgerEntries = async ({
  productId,
  warehouseId,
  locationId,
  type,
  movementType,
  search,
  page = 1,
  limit = 20,
  dateFrom,
  dateTo,
}) => {
  const query = {};

  if (productId) {
    query.$or = [{ product: productId }, { productId: productId }];
  }

  if (warehouseId) {
    query.$or = query.$or
      ? [{ $and: [query.$or[0], { warehouse: warehouseId }] }]
      : [{ warehouse: warehouseId }, { warehouseId: warehouseId }];
  }

  if (locationId) {
    query.location = locationId;
  }

  const selectedType = type || movementType;
  if (selectedType && selectedType !== 'ALL') {
    query.$or = [
      { movementType: new RegExp(`^${selectedType}$`, 'i') },
      { documentType: new RegExp(`^${selectedType}$`, 'i') },
    ];
  }

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }

  if (search) {
    query.$or = [
      { documentCode: new RegExp(search, 'i') },
      { notes: new RegExp(search, 'i') },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [total, data] = await Promise.all([
    StockLedger.countDocuments(query),
    StockLedger.find(query)
      .populate('product', 'name sku uom costPrice sellingPrice')
      .populate('warehouse', 'name code')
      .populate('location', 'name code type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  const pages = Math.ceil(total / limitNum) || 1;

  return {
    data,
    total,
    page: pageNum,
    pages,
  };
};
