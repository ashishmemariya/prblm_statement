import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required for location'],
    },
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Location code is required'],
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ['Storage', 'Receiving', 'Dispatch', 'Shipping', 'Internal', 'warehouse', 'storage', 'receiving', 'shipping', 'internal'],
      default: 'Storage',
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

locationSchema.index({ warehouse: 1, code: 1 }, { unique: true });

const Location = mongoose.model('Location', locationSchema);
export default Location;
