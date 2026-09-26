import Receipt from '../models/Receipt.js';
import stockService from '../services/stockService.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getReceipts = asyncHandler(async (req, res) => {
  const { search, status, warehouseId, warehouse } = req.query;

  const query = {};
  if (status && status !== 'ALL') {
    query.status = status;
  }
  const wh = warehouseId || warehouse;
  if (wh && wh !== 'ALL') {
    query.$or = [{ warehouseId: wh }, { warehouse: wh }];
  }
  if (search) {
    query.$or = [
      { code: new RegExp(search, 'i') },
      { receiptNumber: new RegExp(search, 'i') },
      { supplier: new RegExp(search, 'i') },
    ];
  }

  const receipts = await Receipt.find(query)
    .populate('warehouseId', 'name code')
    .populate('warehouse', 'name code')
    .populate('destinationLocation', 'name code type')
    .populate('lines.productId', 'name sku uom costPrice')
    .populate('items.productId', 'name sku uom costPrice')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: receipts });
});

export const getReceiptById = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('warehouseId', 'name code')
    .populate('warehouse', 'name code')
    .populate('destinationLocation', 'name code type')
    .populate('lines.productId', 'name sku uom costPrice')
    .populate('items.productId', 'name sku uom costPrice');

  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  res.status(200).json({ success: true, data: receipt });
});

export const createReceipt = asyncHandler(async (req, res) => {
  const { code, receiptNumber, supplier, warehouseId, warehouse, destinationLocation, lines, items, notes, scheduledDate } = req.body;

  const finalCode = (code || receiptNumber || `REC-${Date.now()}`).trim().toUpperCase();
  const targetWarehouse = warehouseId || warehouse;
  const targetLines = lines || items || [];

  if (!supplier || !targetWarehouse) {
    return res.status(400).json({ success: false, message: 'Supplier and warehouse are required' });
  }

  const existing = await Receipt.findOne({ $or: [{ code: finalCode }, { receiptNumber: finalCode }] });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Receipt code already exists' });
  }

  const receipt = await Receipt.create({
    code: finalCode,
    receiptNumber: finalCode,
    supplier: supplier.trim(),
    warehouseId: targetWarehouse,
    warehouse: targetWarehouse,
    destinationLocation,
    lines: targetLines,
    items: targetLines,
    status: 'Draft',
    notes: notes || '',
    scheduledDate: scheduledDate || new Date(),
    createdBy: req.user?._id,
  });

  const populated = await Receipt.findById(receipt._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(201).json({ success: true, message: 'Receipt created successfully', data: populated });
});

export const updateReceipt = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  if (receipt.status === 'Done' || receipt.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Validated receipts cannot be modified' });
  }

  const { supplier, warehouseId, warehouse, destinationLocation, lines, items, notes, scheduledDate } = req.body;
  if (supplier) receipt.supplier = supplier.trim();
  if (warehouseId || warehouse) {
    receipt.warehouseId = warehouseId || warehouse;
    receipt.warehouse = warehouseId || warehouse;
  }
  if (destinationLocation !== undefined) receipt.destinationLocation = destinationLocation;
  if (lines || items) {
    receipt.lines = lines || items;
    receipt.items = lines || items;
  }
  if (notes !== undefined) receipt.notes = notes;
  if (scheduledDate !== undefined) receipt.scheduledDate = scheduledDate;

  await receipt.save();
  const populated = await Receipt.findById(receipt._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({ success: true, message: 'Receipt updated successfully', data: populated });
});

export const updateReceiptStatus = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  if (receipt.status === 'Done' || receipt.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Cannot change status of a completed receipt' });
  }

  if (status === 'Done' || status === 'DONE') {
    return res.status(400).json({
      success: false,
      message: 'To complete a receipt, call the validate endpoint instead of direct status update',
    });
  }

  receipt.status = status;
  await receipt.save();

  const populated = await Receipt.findById(receipt._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({ success: true, message: 'Receipt status updated', data: populated });
});

/**
 * Validate Receipt (Atomic Stock Increase).
 * Ensures idempotency: will not double increase if already Done.
 */
export const validateReceipt = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  // Idempotency check: prevent duplicate validation
  if (receipt.status === 'Done' || receipt.status === 'DONE') {
    return res.status(400).json({
      success: false,
      message: 'Receipt has already been validated and marked Done.',
    });
  }

  if (receipt.status === 'Canceled' || receipt.status === 'CANCELED') {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a canceled receipt',
    });
  }

  const lines = receipt.lines && receipt.lines.length ? receipt.lines : receipt.items;
  if (!lines || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a receipt with no items',
    });
  }

  // Increase stock for each line using stockService
  for (const line of lines) {
    const pId = line.productId?._id || line.productId || line.product?._id || line.product;
    const qty = line.receivedQty > 0 ? line.receivedQty : (line.expectedQty || line.quantity || 0);

    if (qty > 0) {
      await stockService.increaseStock({
        productId: pId,
        warehouseId: receipt.warehouseId || receipt.warehouse,
        locationId: receipt.destinationLocation,
        quantity: qty,
        referenceType: 'Receipt',
        referenceId: receipt._id,
        documentCode: receipt.code || receipt.receiptNumber,
        performedBy: req.user,
        notes: `Inbound receipt from ${receipt.supplier}`,
      });
    }
  }

  receipt.status = 'Done';
  receipt.validatedBy = req.user?._id;
  receipt.validatedAt = new Date();
  await receipt.save();

  const populated = await Receipt.findById(receipt._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom costPrice');

  res.status(200).json({
    success: true,
    message: 'Receipt validated and stock updated successfully',
    data: populated,
  });
});

export const cancelReceipt = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  if (receipt.status === 'Done' || receipt.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed receipt' });
  }

  receipt.status = 'Canceled';
  await receipt.save();

  res.status(200).json({ success: true, message: 'Receipt canceled', data: receipt });
});

export default {
  getReceipts,
  getReceiptById,
  createReceipt,
  updateReceipt,
  updateReceiptStatus,
  validateReceipt,
  cancelReceipt,
};
