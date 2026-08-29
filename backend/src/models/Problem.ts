import { Schema, model } from 'mongoose';
const problemSchema = new Schema({
  platform: { type: String, enum: ['LeetCode', 'GeeksforGeeks'], default: 'LeetCode', required: true },
  externalId: { type: String, required: true }, leetcodeId: { type: Number }, title: { type: String, required: true },
  slug: { type: String, required: true }, url: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  topics: { type: [String], default: undefined },
}, { timestamps: true });
problemSchema.index({ platform: 1, externalId: 1 }, { unique: true });
export const Problem = model('Problem', problemSchema);
