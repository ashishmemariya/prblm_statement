import Delivery from '../models/Delivery.js';
import stockService from '../services/stockService.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getDeliveries = asyncHandler(async (req, res) => {
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
      { deliveryNumber: new RegExp(search, 'i') },
      { customer: new RegExp(search, 'i') },
    ];
  }

  const deliveries = await Delivery.find(query)
    .populate('warehouseId', 'name code')
    .populate('warehouse', 'name code')
    .populate('sourceLocation', 'name code type')
    .populate('lines.productId', 'name sku uom sellingPrice totalStock')
    .populate('items.productId', 'name sku uom sellingPrice totalStock')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: deliveries });
});

export const getDeliveryById = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id)
    .populate('warehouseId', 'name code')
    .populate('warehouse', 'name code')
    .populate('sourceLocation', 'name code type')
    .populate('lines.productId', 'name sku uom sellingPrice totalStock')
    .populate('items.productId', 'name sku uom sellingPrice totalStock');

  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }

  res.status(200).json({ success: true, data: delivery });
});

export const createDelivery = asyncHandler(async (req, res) => {
  const { code, deliveryNumber, customer, warehouseId, warehouse, sourceLocation, lines, items, notes, scheduledDate } = req.body;

  const finalCode = (code || deliveryNumber || `DEL-${Date.now()}`).trim().toUpperCase();
  const targetWarehouse = warehouseId || warehouse;
  const targetLines = lines || items || [];

  if (!customer || !targetWarehouse) {
    return res.status(400).json({ success: false, message: 'Customer and warehouse are required' });
  }

  const existing = await Delivery.findOne({ $or: [{ code: finalCode }, { deliveryNumber: finalCode }] });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Delivery code already exists' });
  }

  const delivery = await Delivery.create({
    code: finalCode,
    deliveryNumber: finalCode,
    customer: customer.trim(),
    warehouseId: targetWarehouse,
    warehouse: targetWarehouse,
    sourceLocation,
    lines: targetLines,
    items: targetLines,
    status: 'Draft',
    notes: notes || '',
    scheduledDate: scheduledDate || new Date(),
    createdBy: req.user?._id,
  });

  const populated = await Delivery.findById(delivery._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(201).json({ success: true, message: 'Delivery order created successfully', data: populated });
});

export const updateDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }

  if (delivery.status === 'Done' || delivery.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Completed deliveries cannot be modified' });
  }

  const { customer, warehouseId, warehouse, sourceLocation, lines, items, notes, scheduledDate } = req.body;
  if (customer) delivery.customer = customer.trim();
  if (warehouseId || warehouse) {
    delivery.warehouseId = warehouseId || warehouse;
    delivery.warehouse = warehouseId || warehouse;
  }
  if (sourceLocation !== undefined) delivery.sourceLocation = sourceLocation;
  if (lines || items) {
    delivery.lines = lines || items;
    delivery.items = lines || items;
  }
  if (notes !== undefined) delivery.notes = notes;
  if (scheduledDate !== undefined) delivery.scheduledDate = scheduledDate;

  await delivery.save();
  const populated = await Delivery.findById(delivery._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({ success: true, message: 'Delivery updated successfully', data: populated });
});

export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }

  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  if (delivery.status === 'Done' || delivery.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Cannot change status of a completed delivery' });
  }

  if (status === 'Done' || status === 'DONE') {
    return res.status(400).json({
      success: false,
      message: 'To complete a delivery, call the validate endpoint',
    });
  }

  delivery.status = status;
  await delivery.save();

  const populated = await Delivery.findById(delivery._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom');

  res.status(200).json({ success: true, message: 'Delivery status updated', data: populated });
});

export const confirmDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
  if (delivery.status !== 'Draft') return res.status(400).json({ success: false, message: 'Only Draft deliveries can be confirmed' });

  delivery.status = 'Waiting';
  await delivery.save();
  res.status(200).json({ success: true, message: 'Delivery confirmed to Waiting', data: delivery });
});

export const pickDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

  delivery.status = 'Ready';
  await delivery.save();
  res.status(200).json({ success: true, message: 'Items picked and ready for packaging', data: delivery });
});

export const packDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

  delivery.status = 'Ready';
  await delivery.save();
  res.status(200).json({ success: true, message: 'Delivery packaged and ready for dispatch', data: delivery });
});

/**
 * Validate Delivery Order (Stock Decrease).
 * Decreases stock, verifies sufficient inventory, prevents negative quantities, and creates ledger entry.
 */
export const validateDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }

  // Idempotency check: prevent duplicate validation
  if (delivery.status === 'Done' || delivery.status === 'DONE') {
    return res.status(400).json({
      success: false,
      message: 'Delivery order has already been validated and completed.',
    });
  }

  if (delivery.status === 'Canceled' || delivery.status === 'CANCELED') {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a canceled delivery',
    });
  }

  const lines = delivery.lines && delivery.lines.length ? delivery.lines : delivery.items;
  if (!lines || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot validate a delivery with no items',
    });
  }

  // Deduct stock for each line using stockService
  for (const line of lines) {
    const pId = line.productId?._id || line.productId || line.product?._id || line.product;
    const qty = Number(line.qty || line.quantity || 0);

    if (qty > 0) {
      await stockService.decreaseStock({
        productId: pId,
        warehouseId: delivery.warehouseId || delivery.warehouse,
        locationId: delivery.sourceLocation,
        quantity: qty,
        referenceType: 'Delivery',
        referenceId: delivery._id,
        documentCode: delivery.code || delivery.deliveryNumber,
        performedBy: req.user,
        notes: `Outbound delivery to ${delivery.customer}`,
      });
    }
  }

  delivery.status = 'Done';
  delivery.validatedBy = req.user?._id;
  delivery.validatedAt = new Date();
  await delivery.save();

  const populated = await Delivery.findById(delivery._id)
    .populate('warehouseId', 'name code')
    .populate('lines.productId', 'name sku uom sellingPrice');

  res.status(200).json({
    success: true,
    message: 'Delivery validated and dispatched successfully',
    data: populated,
  });
});

export const cancelDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }

  if (delivery.status === 'Done' || delivery.status === 'DONE') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed delivery' });
  }

  delivery.status = 'Canceled';
  await delivery.save();

  res.status(200).json({ success: true, message: 'Delivery canceled', data: delivery });
});

export default {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  updateDelivery,
  updateDeliveryStatus,
  confirmDelivery,
  pickDelivery,
  packDelivery,
  validateDelivery,
  cancelDelivery,
};
