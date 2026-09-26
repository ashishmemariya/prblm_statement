import mongoose from 'mongoose';

const reorderRuleSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required for reorder rule'],
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required for reorder rule'],
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    minimumQuantity: {
      type: Number,
      required: true,
      default: 10,
      min: [0, 'Minimum quantity cannot be negative'],
    },
    reorderQuantity: {
      type: Number,
      required: true,
      default: 50,
      min: [1, 'Reorder quantity must be at least 1'],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

reorderRuleSchema.index({ product: 1, warehouse: 1 }, { unique: true });

const ReorderRule = mongoose.model('ReorderRule', reorderRuleSchema);
export default ReorderRule;
