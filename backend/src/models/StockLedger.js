import mongoose from 'mongoose';

export const MOVEMENT_TYPES = {
  RECEIPT: 'RECEIPT',
  DELIVERY: 'DELIVERY',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  ADJUSTMENT: 'ADJUSTMENT',
};

const stockLedgerSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required'],
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    movementType: {
      type: String,
      enum: ['RECEIPT', 'DELIVERY', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'Receipt', 'Delivery', 'Transfer', 'Adjustment'],
      required: [true, 'Movement type is required'],
    },
    documentType: {
      type: String,
      default: 'Adjustment',
    },
    documentCode: {
      type: String,
      default: '',
    },
    documentId: {
      type: String,
      default: '',
    },
    quantityBefore: {
      type: Number,
      required: true,
      default: 0,
    },
    quantityChange: {
      type: Number,
      required: true,
    },
    qty: {
      type: Number,
    },
    quantityAfter: {
      type: Number,
      required: true,
      default: 0,
    },
    balanceAfter: {
      type: Number,
    },
    referenceType: {
      type: String,
      enum: ['Receipt', 'Delivery', 'Transfer', 'Adjustment', 'Initial', 'RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'],
    },
    referenceId: {
      type: mongoose.Schema.Types.Mixed,
    },
    performedBy: {
      type: mongoose.Schema.Types.Mixed,
    },
    timestamp: {
      type: String,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

stockLedgerSchema.index({ product: 1, createdAt: -1 });
stockLedgerSchema.index({ warehouse: 1, createdAt: -1 });
stockLedgerSchema.index({ location: 1, createdAt: -1 });
stockLedgerSchema.index({ movementType: 1 });
stockLedgerSchema.index({ createdAt: -1 });

// Ensure fields sync for frontend compatibility
stockLedgerSchema.pre('save', function (next) {
  if (this.product && !this.productId) this.productId = this.product;
  if (this.productId && !this.product) this.product = this.productId;
  if (this.warehouse && !this.warehouseId) this.warehouseId = this.warehouse;
  if (this.warehouseId && !this.warehouse) this.warehouse = this.warehouseId;
  if (this.quantityChange !== undefined && this.qty === undefined) this.qty = this.quantityChange;
  if (this.quantityAfter !== undefined && this.balanceAfter === undefined) this.balanceAfter = this.quantityAfter;
  if (!this.timestamp) this.timestamp = new Date().toISOString();
  next();
});

const StockLedger = mongoose.model('StockLedger', stockLedgerSchema);
export default StockLedger;
