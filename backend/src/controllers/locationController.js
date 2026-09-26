import Location from '../models/Location.js';
import Inventory from '../models/Inventory.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getLocations = asyncHandler(async (req, res) => {
  const query = { active: true };
  if (req.query.warehouse) {
    query.warehouse = req.query.warehouse;
  }
  const locations = await Location.find(query).populate('warehouse', 'name code').sort({ name: 1 });
  res.status(200).json({ success: true, data: locations });
});

export const getLocationById = asyncHandler(async (req, res) => {
  const location = await Location.findById(req.params.id).populate('warehouse', 'name code');
  if (!location) {
    return res.status(404).json({ success: false, message: 'Location not found' });
  }
  res.status(200).json({ success: true, data: location });
});

export const createLocation = asyncHandler(async (req, res) => {
  const { warehouse, name, code, type } = req.body;
  if (!warehouse || !name || !code) {
    return res.status(400).json({ success: false, message: 'Warehouse, name, and code are required' });
  }

  const existing = await Location.findOne({ warehouse, code: code.trim().toUpperCase() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Location code already exists in this warehouse' });
  }

  const location = await Location.create({
    warehouse,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    type: type || 'Storage',
  });

  res.status(201).json({ success: true, message: 'Location created successfully', data: location });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const location = await Location.findById(req.params.id);
  if (!location) {
    return res.status(404).json({ success: false, message: 'Location not found' });
  }

  const { name, type, active } = req.body;
  if (name) location.name = name.trim();
  if (type) location.type = type;
  if (active !== undefined) location.active = active;

  await location.save();
  res.status(200).json({ success: true, message: 'Location updated successfully', data: location });
});

export const deleteLocation = asyncHandler(async (req, res) => {
  const location = await Location.findById(req.params.id);
  if (!location) {
    return res.status(404).json({ success: false, message: 'Location not found' });
  }

  const inventoryCount = await Inventory.countDocuments({ location: location._id, quantity: { $gt: 0 } });
  if (inventoryCount > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete location with non-zero inventory.',
    });
  }

  await Location.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Location deleted successfully' });
});

export default {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
};
