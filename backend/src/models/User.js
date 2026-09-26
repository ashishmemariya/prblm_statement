import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = {
  INVENTORY_MANAGER: 'inventory_manager',
  WAREHOUSE_STAFF: 'warehouse_staff',
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: [USER_ROLES.INVENTORY_MANAGER, USER_ROLES.WAREHOUSE_STAFF],
        message: '{VALUE} is not a valid role',
      },
      default: USER_ROLES.WAREHOUSE_STAFF,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    resetPasswordOtpHash: {
      type: String,
      select: false,
    },
    resetPasswordOtpExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.resetPasswordOtpHash;
        delete ret.resetPasswordOtpExpires;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Pre-save hook: Hash password if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare candidate password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
