import mongoose from 'mongoose';

const deliveryLineSchema = new mongoose.Schema(
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
    unitPrice: {
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

deliveryLineSchema.pre('save', function (next) {
  if (this.productId && !this.product) this.product = this.productId;
  if (this.qty && !this.quantity) this.quantity = this.qty;
  next();
});

const deliverySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Delivery code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    deliveryNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    customer: {
      type: String,
      required: [true, 'Customer is required'],
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
    sourceLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    lines: [deliveryLineSchema],
    items: [deliveryLineSchema],
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

deliverySchema.index({ code: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ warehouseId: 1 });
deliverySchema.index({ createdAt: -1 });

deliverySchema.pre('save', function (next) {
  if (this.code && !this.deliveryNumber) this.deliveryNumber = this.code;
  if (this.deliveryNumber && !this.code) this.code = this.deliveryNumber;
  if (this.warehouseId && !this.warehouse) this.warehouse = this.warehouseId;
  if (this.warehouse && !this.warehouseId) this.warehouseId = this.warehouse;
  if (this.lines && this.lines.length && (!this.items || !this.items.length)) {
    this.items = this.lines;
  }
  next();
});

const Delivery = mongoose.model('Delivery', deliverySchema);
export default Delivery;
