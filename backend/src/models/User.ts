import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  goals: {
    daily: { type: Number, default: 1, min: 0, max: 1000 },
    weekly: { type: Number, default: 5, min: 0, max: 5000 },
    monthly: { type: Number, default: 20, min: 0, max: 50000 },
  },
  revisionStages: { type: [Number], default: [1, 7, 21], validate: {
    validator(value: number[]) { return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isFinite(item) && item > 0 && item < 10000); },
    message: 'Revision stage intervals must be positive numbers.',
  } },
}, { timestamps: true });
export const User = model('User', userSchema);
