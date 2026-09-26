import Category from '../models/Category.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ active: true }).sort({ name: 1 });
  res.status(200).json({ success: true, data: categories });
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  res.status(200).json({ success: true, data: category });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Category name is required' });
  }

  const existing = await Category.findOne({ name: name.trim() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Category with this name already exists' });
  }

  const category = await Category.create({
    name: name.trim(),
    description: description || '',
    color: color || '#6366f1',
  });

  res.status(201).json({ success: true, message: 'Category created successfully', data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  const { name, description, color, active } = req.body;
  if (name) category.name = name.trim();
  if (description !== undefined) category.description = description;
  if (color !== undefined) category.color = color;
  if (active !== undefined) category.active = active;

  await category.save();
  res.status(200).json({ success: true, message: 'Category updated successfully', data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  // Check if active products depend on this category
  const productCount = await Product.countDocuments({
    $or: [{ categoryId: category._id }, { category: category._id }],
    active: true,
  });

  if (productCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete category: ${productCount} active products are currently assigned to it. Deactivate them first.`,
    });
  }

  await Category.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Category deleted successfully' });
});

export default {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
