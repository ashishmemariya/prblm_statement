import Warehouse from '../models/Warehouse.js';
import Location from '../models/Location.js';
import Inventory from '../models/Inventory.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getWarehouses = asyncHandler(async (_req, res) => {
  const warehouses = await Warehouse.find({ active: true }).sort({ name: 1 });
  res.status(200).json({ success: true, data: warehouses });
});

export const getWarehouseById = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }
  res.status(200).json({ success: true, data: warehouse });
});

export const createWarehouse = asyncHandler(async (req, res) => {
  const { name, code, address, locations } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Warehouse name and code are required' });
  }

  const existing = await Warehouse.findOne({ code: code.trim().toUpperCase() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Warehouse code already exists' });
  }

  const defaultLocations = locations && locations.length
    ? locations
    : [
        { name: 'Zone A - Storage Racks', code: `${code.toUpperCase()}-A`, type: 'Storage' },
        { name: 'Dock 1 Receiving', code: `${code.toUpperCase()}-IN`, type: 'Receiving' },
        { name: 'Dispatch Bay', code: `${code.toUpperCase()}-OUT`, type: 'Dispatch' },
      ];

  const warehouse = await Warehouse.create({
    name: name.trim(),
    code: code.trim().toUpperCase(),
    address: address || '',
    locations: defaultLocations,
  });

  // Also create standalone location documents for easy querying
  for (const loc of warehouse.locations) {
    await Location.create({
      warehouse: warehouse._id,
      name: loc.name,
      code: loc.code,
      type: loc.type,
    });
  }

  res.status(201).json({ success: true, message: 'Warehouse created successfully', data: warehouse });
});

export const updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  const { name, address, active, locations } = req.body;
  if (name) warehouse.name = name.trim();
  if (address !== undefined) warehouse.address = address;
  if (active !== undefined) warehouse.active = active;
  if (locations && Array.isArray(locations)) warehouse.locations = locations;

  await warehouse.save();
  res.status(200).json({ success: true, message: 'Warehouse updated successfully', data: warehouse });
});

export const deleteWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  // Check if inventory exists in this warehouse
  const inventoryCount = await Inventory.countDocuments({ warehouse: warehouse._id, quantity: { $gt: 0 } });
  if (inventoryCount > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete warehouse with existing non-zero stock. Transfer or adjust stock first.',
    });
  }

  await Warehouse.findByIdAndDelete(req.params.id);
  await Location.deleteMany({ warehouse: req.params.id });

  res.status(200).json({ success: true, message: 'Warehouse deleted successfully' });
});

export default {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
