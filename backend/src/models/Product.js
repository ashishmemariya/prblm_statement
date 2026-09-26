import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    },
    uom: {
      type: String,
      trim: true,
      default: 'pcs',
    },
    unitOfMeasure: {
      type: String,
      trim: true,
      default: 'pcs',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, 'Cost price cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      default: 0,
      min: [0, 'Selling price cannot be negative'],
    },
    minStock: {
      type: Number,
      default: 0,
      min: [0, 'Minimum stock cannot be negative'],
    },
    totalStock: {
      type: Number,
      default: 0,
      min: [0, 'Total stock cannot be negative'],
    },
    warehouseStock: {
      type: Map,
      of: Number,
      default: {},
    },
    barcode: {
      type: String,
      trim: true,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

productSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ sku: 1 });
productSchema.index({ categoryId: 1 });
productSchema.index({ active: 1 });

// Ensure categoryId and category are kept in sync
productSchema.pre('save', function (next) {
  if (this.categoryId && !this.category) {
    this.category = this.categoryId;
  } else if (this.category && !this.categoryId) {
    this.categoryId = this.category;
  }
  if (this.uom && !this.unitOfMeasure) {
    this.unitOfMeasure = this.uom;
  } else if (this.unitOfMeasure && !this.uom) {
    this.uom = this.unitOfMeasure;
  }
  next();
});

const Product = mongoose.model('Product', productSchema);
export default Product;
