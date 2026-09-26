import mongoose from 'mongoose';

const locationSubSchema = new mongoose.Schema(
  {
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
  { timestamps: true },
);

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Warehouse name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Warehouse code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    locations: [locationSubSchema],
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
export default Warehouse;
