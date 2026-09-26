import Transfer from '../models/Transfer.js';
import stockService from '../services/stockService.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getTransfers = asyncHandler(async (req, res) => {
  const { search, status } = req.query;

  const query = {};
  if (status && status !== 'ALL') {
    query.status = status;
  }
  if (search) {
    query.$or = [
      { code: new RegExp(search, 'i') },
      { transferNumber: new RegExp(search, 'i') },
      { notes: new RegExp(search, 'i') },
    ];
  }

  const transfers = await Transfer.find(query)
    .populate('fromWarehouseId', 'name code')
    .populate('sourceWarehouse', 'name code')
    .populate('fromLocationId', 'name code type')
    .populate('toWarehouseId', 'name code')
    .populate('destinationWarehouse', 'name code')
    .populate('toLocationId', 'name code type')
    .populate('lines.productId', 'name sku uom')
    .populate('items.productId', 'name sku uom')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: transfers });
});

export const getTransferById = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id)
    .populate('fromWarehouseId', 'name code')
    .populate('sourceWarehouse', 'name code')
    .populate('toWarehouseId', 'name code')
    .populate('destinationWarehouse', 'name code')
    .populate('lines.productId', 'name sku uom')
    .populate('items.productId', 'name sku uom');

  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  res.status(200).json({ success: true, data: transfer });
});

export const createTransfer = asyncHandler(async (req, res) => {
  const {
    code,
    transferNumber,
    fromWarehouseId,
    sourceWarehouse,
    fromLocationId,
    sourceLocation,
    toWarehouseId,
    destinationWarehouse,
    toLocationId,
    destinationLocation,
    lines,
    items,
    notes,
  } = req.body;

  const finalCode = (code || transferNumber || `TRF-${Date.now()}`).trim().toUpperCase();
  const srcWh = fromWarehouseId || sourceWarehouse;
  const destWh = toWarehouseId || destinationWarehouse;
  const targetLines = lines || items || [];

  if (!srcWh || !destWh) {
    return res.status(400).json({ success: false, message: 'Source and destination warehouses are required' });
  }

  const existing = await Transfer.findOne({ $or: [{ code: finalCode }, { transferNumber: finalCode }] });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Transfer code already exists' });
  }

  const transfer = await Transfer.create({
    code: finalCode,
    transferNumber: finalCode,
    fromWarehouseId: srcWh,
    sourceWarehouse: srcWh,
    fromLocationId: fromLocationId || sourceLocation,
    toWarehouseId: destWh,
    destinationWarehouse: destWh,
    toLocationId: toLocationId || destinationLocation,
    lines: targetLines,
    items: targetLines,
    status: 'Draft',
    notes: notes || '',
    createdBy: req.user?._id,
  });

  const populated = await Transfer.findById(transfer._id)
    .populate('fromWarehouseId', 'name code')
    .populate('toWarehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(201).json({ success: true, message: 'Transfer order created successfully', data: populated });
});

export const updateTransfer = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  if (transfer.status === 'Done' || transfer.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Completed transfers cannot be modified' });
  }

  const {
    fromWarehouseId,
    sourceWarehouse,
    fromLocationId,
    toWarehouseId,
    destinationWarehouse,
    toLocationId,
    lines,
    items,
    notes,
  } = req.body;

  if (fromWarehouseId || sourceWarehouse) {
    transfer.fromWarehouseId = fromWarehouseId || sourceWarehouse;
    transfer.sourceWarehouse = fromWarehouseId || sourceWarehouse;
  }
  if (toWarehouseId || destinationWarehouse) {
    transfer.toWarehouseId = toWarehouseId || destinationWarehouse;
    transfer.destinationWarehouse = toWarehouseId || destinationWarehouse;
  }
  if (fromLocationId !== undefined) transfer.fromLocationId = fromLocationId;
  if (toLocationId !== undefined) transfer.toLocationId = toLocationId;
  if (lines || items) {
    transfer.lines = lines || items;
    transfer.items = lines || items;
  }
  if (notes !== undefined) transfer.notes = notes;

  await transfer.save();
  const populated = await Transfer.findById(transfer._id)
    .populate('fromWarehouseId', 'name code')
    .populate('toWarehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({ success: true, message: 'Transfer updated successfully', data: populated });
});

/**
 * Validate Transfer (Atomic Inter-Warehouse Stock Movement).
 * Decreases source, increases destination, and creates two linked Ledger entries.
 */
export const validateTransfer = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  if (transfer.status === 'Done' || transfer.status === 'DONE') {
    return res.status(400).json({
      success: false,
      message: 'Transfer has already been validated and completed.',
    });
  }

  if (transfer.status === 'Canceled' || transfer.status === 'CANCELED') {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a canceled transfer',
    });
  }

  const lines = transfer.lines && transfer.lines.length ? transfer.lines : transfer.items;
  if (!lines || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a transfer with no items',
    });
  }

  const fromWh = (transfer.fromWarehouseId?._id || transfer.fromWarehouseId || transfer.sourceWarehouse).toString();
  const toWh = (transfer.toWarehouseId?._id || transfer.toWarehouseId || transfer.destinationWarehouse).toString();

  for (const line of lines) {
    const pId = line.productId?._id || line.productId || line.product?._id || line.product;
    const qty = Number(line.qty || line.quantity || 0);

    if (qty > 0) {
      await stockService.transferStock({
        productId: pId,
        fromWarehouseId: fromWh,
        fromLocationId: transfer.fromLocationId || transfer.sourceLocation,
        toWarehouseId: toWh,
        toLocationId: transfer.toLocationId || transfer.destinationLocation,
        quantity: qty,
        referenceType: 'Transfer',
        referenceId: transfer._id,
        documentCode: transfer.code || transfer.transferNumber,
        performedBy: req.user,
        notes: transfer.notes || 'Inter-warehouse stock transfer',
      });
    }
  }

  transfer.status = 'Done';
  transfer.validatedBy = req.user?._id;
  transfer.validatedAt = new Date();
  await transfer.save();

  const populated = await Transfer.findById(transfer._id)
    .populate('fromWarehouseId', 'name code')
    .populate('toWarehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({
    success: true,
    message: 'Transfer completed and inventory updated across warehouses',
    data: populated,
  });
});

export const cancelTransfer = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  if (transfer.status === 'Done' || transfer.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed transfer' });
  }

  transfer.status = 'Canceled';
  await transfer.save();

  res.status(200).json({ success: true, message: 'Transfer canceled', data: transfer });
});

export default {
  getTransfers,
  getTransferById,
  createTransfer,
  updateTransfer,
  validateTransfer,
  cancelTransfer,
};
