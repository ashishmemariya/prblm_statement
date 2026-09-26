import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required'],
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Location is required'],
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Physical inventory quantity cannot be negative'],
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Reserved quantity cannot be negative'],
    },
    availableQuantity: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index: A product can only have one inventory record per location
inventorySchema.index({ product: 1, location: 1 }, { unique: true });
inventorySchema.index({ product: 1, warehouse: 1 });
inventorySchema.index({ warehouse: 1 });

// Ensure availableQuantity is always quantity - reservedQuantity
inventorySchema.pre('save', function (next) {
  this.availableQuantity = (this.quantity || 0) - (this.reservedQuantity || 0);
  next();
});

const Inventory = mongoose.model('Inventory', inventorySchema);
export default Inventory;
