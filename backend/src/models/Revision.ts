import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  platform: { type: String, enum: ['LeetCode', 'GeeksforGeeks'], required: true },
  stage: { type: String, required: true }, stageDays: { type: Number, required: true }, status: { type: String, enum: ['active','completed'], default: 'active' },
  scheduledAt: { type: Date, required: true },
  completedAt: Date, lastReviewedAt: Date, nextReviewAt: Date,
  reviewHistory: { type: [{ reviewedAt: { type: Date, required: true }, result: { type: String, enum: ['Solved', 'Needed Hint', 'Not Solved'], required: true } }], default: [] },
  result: { type: String, enum: ['Solved', 'Needed Hint', 'Not Solved'] },
  completionMethod: { type: String, enum: ['manual', 'successful_resolve'] },
}, { timestamps: true });

schema.index({ userId: 1, platform: 1, problemId: 1, stageDays: 1, scheduledAt: 1 }, { unique: true });
export const Revision = model('Revision', schema);
