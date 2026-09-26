import mongoose from 'mongoose';

const transferLineSchema = new mongoose.Schema(
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
    qty: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    quantity: {
      type: Number,
    },
    uom: {
      type: String,
      default: 'pcs',
    },
  },
  { _id: true },
);

transferLineSchema.pre('save', function (next) {
  if (this.productId && !this.product) this.product = this.productId;
  if (this.qty && !this.quantity) this.quantity = this.qty;
  next();
});

const transferSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Transfer code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    transferNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    fromWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Source warehouse is required'],
    },
    sourceWarehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    fromLocationId: {
      type: mongoose.Schema.Types.Mixed,
    },
    sourceLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    toWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Destination warehouse is required'],
    },
    destinationWarehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    toLocationId: {
      type: mongoose.Schema.Types.Mixed,
    },
    destinationLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    lines: [transferLineSchema],
    items: [transferLineSchema],
    status: {
      type: String,
      enum: ['Draft', 'Waiting', 'Ready', 'Done', 'Canceled', 'DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'],
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

transferSchema.index({ code: 1 });
transferSchema.index({ status: 1 });
transferSchema.index({ createdAt: -1 });

transferSchema.pre('save', function (next) {
  if (this.code && !this.transferNumber) this.transferNumber = this.code;
  if (this.transferNumber && !this.code) this.code = this.transferNumber;
  if (this.fromWarehouseId && !this.sourceWarehouse) this.sourceWarehouse = this.fromWarehouseId;
  if (this.toWarehouseId && !this.destinationWarehouse) this.destinationWarehouse = this.toWarehouseId;
  if (this.lines && this.lines.length && (!this.items || !this.items.length)) {
    this.items = this.lines;
  }
  next();
});

const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;
