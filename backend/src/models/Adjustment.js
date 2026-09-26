import mongoose from 'mongoose';

const adjustmentLineSchema = new mongoose.Schema(
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
    systemQty: {
      type: Number,
      required: true,
      default: 0,
    },
    recordedQuantity: {
      type: Number,
    },
    countedQty: {
      type: Number,
      required: true,
    },
    physicalQuantity: {
      type: Number,
    },
    difference: {
      type: Number,
      required: true,
    },
  },
  { _id: true },
);

adjustmentLineSchema.pre('save', function (next) {
  if (this.productId && !this.product) this.product = this.productId;
  if (this.systemQty !== undefined && this.recordedQuantity === undefined) this.recordedQuantity = this.systemQty;
  if (this.countedQty !== undefined && this.physicalQuantity === undefined) this.physicalQuantity = this.countedQty;
  this.difference = Number(this.countedQty) - Number(this.systemQty);
  next();
});

const adjustmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Adjustment code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    adjustmentNumber: {
      type: String,
      trim: true,
      uppercase: true,
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
    locationId: {
      type: mongoose.Schema.Types.Mixed,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
    },
    lines: [adjustmentLineSchema],
    items: [adjustmentLineSchema],
    status: {
      type: String,
      enum: ['Draft', 'Done', 'Canceled', 'DRAFT', 'DONE', 'CANCELED'],
      default: 'Draft',
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

adjustmentSchema.index({ code: 1 });
adjustmentSchema.index({ status: 1 });
adjustmentSchema.index({ createdAt: -1 });

adjustmentSchema.pre('save', function (next) {
  if (this.code && !this.adjustmentNumber) this.adjustmentNumber = this.code;
  if (this.adjustmentNumber && !this.code) this.code = this.adjustmentNumber;
  if (this.warehouseId && !this.warehouse) this.warehouse = this.warehouseId;
  if (this.warehouse && !this.warehouseId) this.warehouseId = this.warehouse;
  if (this.lines && this.lines.length && (!this.items || !this.items.length)) {
    this.items = this.lines;
  }
  next();
});

const Adjustment = mongoose.model('Adjustment', adjustmentSchema);
export default Adjustment;
