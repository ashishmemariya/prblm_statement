import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      default: '#6366f1',
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

const Category = mongoose.model('Category', categorySchema);
export default Category;
