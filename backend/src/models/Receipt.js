import mongoose from 'mongoose';

const receiptLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    expectedQty: {
      type: Number,
      required: true,
      min: [1, 'Expected quantity must be at least 1'],
    },
    quantity: {
      type: Number,
    },
    receivedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    uom: {
      type: String,
      default: 'pcs',
    },
  },
  { _id: true },
);

receiptLineSchema.pre('save', function (next) {
  if (this.productId && !this.product) this.product = this.productId;
  if (this.expectedQty && !this.quantity) this.quantity = this.expectedQty;
  next();
});

const receiptSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Receipt code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    receiptNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    supplier: {
      type: String,
      required: [true, 'Supplier is required'],
      trim: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required'],
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    destinationLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    lines: [receiptLineSchema],
    items: [receiptLineSchema],
    status: {
      type: String,
      enum: ['Draft', 'Waiting', 'Ready', 'Done', 'Canceled', 'DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'],
      default: 'Draft',
    },
    scheduledDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    validatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

receiptSchema.index({ code: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ warehouseId: 1 });
receiptSchema.index({ createdAt: -1 });

receiptSchema.pre('save', function (next) {
  if (this.code && !this.receiptNumber) this.receiptNumber = this.code;
  if (this.receiptNumber && !this.code) this.code = this.receiptNumber;
  if (this.warehouseId && !this.warehouse) this.warehouse = this.warehouseId;
  if (this.warehouse && !this.warehouseId) this.warehouseId = this.warehouse;
  if (this.lines && this.lines.length && (!this.items || !this.items.length)) {
    this.items = this.lines;
  }
  next();
});

const Receipt = mongoose.model('Receipt', receiptSchema);
export default Receipt;
