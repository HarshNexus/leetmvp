import { Schema, model } from 'mongoose';
const solvedSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  platform: { type: String, enum: ['LeetCode', 'GeeksforGeeks'], default: 'LeetCode', required: true },
  solvedAt: { type: Date, required: true, default: Date.now }, language: { type: String, default: 'Unknown' },
  solvedDay: { type: String, required: true },
  submissionId: { type: String },
}, { timestamps: true });
solvedSchema.index({ userId: 1, platform: 1, problemId: 1, solvedDay: 1 }, { unique: true });
solvedSchema.index({ userId: 1, solvedAt: -1 });
export const SolvedProblem = model('SolvedProblem', solvedSchema);
