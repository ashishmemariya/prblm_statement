import Product from '../models/Product.js';
import StockLedger from '../models/StockLedger.js';
import stockService from '../services/stockService.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getProducts = asyncHandler(async (req, res) => {
  const { search, category, categoryId, warehouse, lowStock, outOfStock, active, page, limit, sort } = req.query;

  const query = {};

  if (active !== undefined) {
    query.active = active === 'true' || active === true;
  } else {
    query.active = true;
  }

  const selectedCat = category || categoryId;
  if (selectedCat && selectedCat !== 'ALL') {
    query.$or = [{ categoryId: selectedCat }, { category: selectedCat }];
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { name: searchRegex },
      { sku: searchRegex },
      { barcode: searchRegex },
      { description: searchRegex },
    ];
  }

  if (lowStock === 'true' || lowStock === true) {
    query.$expr = {
      $and: [
        { $gt: ['$totalStock', 0] },
        { $lte: ['$totalStock', '$minStock'] },
      ],
    };
  }

  if (outOfStock === 'true' || outOfStock === true) {
    query.totalStock = { $lte: 0 };
  }

  let sortOptions = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOptions = { [field]: order === 'desc' ? -1 : 1 };
  }

  let productsQuery = Product.find(query)
    .populate('categoryId', 'name description color')
    .populate('category', 'name description color')
    .sort(sortOptions);

  if (page && limit) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;
    const total = await Product.countDocuments(query);
    const products = await productsQuery.skip(skip).limit(limitNum);
    return res.status(200).json({
      success: true,
      data: products,
      pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
    });
  }

  const products = await productsQuery;
  res.status(200).json({ success: true, data: products });
});

export const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('categoryId', 'name description color')
    .populate('category', 'name description color');

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const stockInfo = await stockService.getProductStock(product._id);

  res.status(200).json({
    success: true,
    data: {
      ...product.toObject(),
      stockBreakdown: stockInfo.inventories,
    },
  });
});

export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    sku,
    categoryId,
    category,
    uom,
    unitOfMeasure,
    costPrice,
    sellingPrice,
    minStock,
    barcode,
    description,
    warehouseStock,
  } = req.body;

  if (!name || !sku) {
    return res.status(400).json({ success: false, message: 'Name and SKU are required' });
  }

  const targetCategoryId = categoryId || category;
  if (!targetCategoryId) {
    return res.status(400).json({ success: false, message: 'Category is required' });
  }

  const existing = await Product.findOne({ sku: sku.trim().toUpperCase() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'A product with this SKU already exists' });
  }

  const product = await Product.create({
    name: name.trim(),
    sku: sku.trim().toUpperCase(),
    categoryId: targetCategoryId,
    category: targetCategoryId,
    uom: uom || unitOfMeasure || 'pcs',
    unitOfMeasure: unitOfMeasure || uom || 'pcs',
    costPrice: Number(costPrice) || 0,
    sellingPrice: Number(sellingPrice) || 0,
    minStock: Number(minStock) || 0,
    barcode: barcode || '',
    description: description || '',
    warehouseStock: warehouseStock || {},
    createdBy: req.user?._id,
  });

  // If initial warehouse stock is provided in creation payload, initialize stock
  if (warehouseStock && typeof warehouseStock === 'object') {
    for (const [whId, qty] of Object.entries(warehouseStock)) {
      if (Number(qty) > 0) {
        await stockService.increaseStock({
          productId: product._id,
          warehouseId: whId,
          quantity: Number(qty),
          referenceType: 'Initial',
          documentCode: 'INITIAL-STOCK',
          performedBy: req.user,
          notes: 'Initial stock on product creation',
        });
      }
    }
  }

  const populated = await Product.findById(product._id)
    .populate('categoryId', 'name color')
    .populate('category', 'name color');

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: populated,
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const {
    name,
    sku,
    categoryId,
    category,
    uom,
    unitOfMeasure,
    costPrice,
    sellingPrice,
    minStock,
    barcode,
    description,
    active,
  } = req.body;

  if (sku && sku.trim().toUpperCase() !== product.sku) {
    const existing = await Product.findOne({ sku: sku.trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'SKU is already in use by another product' });
    }
    product.sku = sku.trim().toUpperCase();
  }

  if (name) product.name = name.trim();
  if (categoryId) {
    product.categoryId = categoryId;
    product.category = categoryId;
  } else if (category) {
    product.categoryId = category;
    product.category = category;
  }
  if (uom) {
    product.uom = uom;
    product.unitOfMeasure = uom;
  }
  if (unitOfMeasure) {
    product.unitOfMeasure = unitOfMeasure;
    product.uom = unitOfMeasure;
  }
  if (costPrice !== undefined) product.costPrice = Number(costPrice);
  if (sellingPrice !== undefined) product.sellingPrice = Number(sellingPrice);
  if (minStock !== undefined) product.minStock = Number(minStock);
  if (barcode !== undefined) product.barcode = barcode;
  if (description !== undefined) product.description = description;
  if (active !== undefined) product.active = active;

  await product.save();

  const populated = await Product.findById(product._id)
    .populate('categoryId', 'name color')
    .populate('category', 'name color');

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: populated,
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Check if product has historical stock transactions
  const hasHistory = await StockLedger.exists({ product: product._id });

  if (hasHistory) {
    // Soft deactivation to preserve ledger integrity
    product.active = false;
    await product.save();
    return res.status(200).json({
      success: true,
      message: 'Product has historical ledger records and was deactivated instead of permanently deleted.',
    });
  }

  await Product.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Product deleted successfully' });
});

export default {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
