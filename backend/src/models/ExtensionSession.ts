import { Schema, model } from 'mongoose';

const extensionSessionSchema = new Schema({
  refreshTokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date },
}, { timestamps: true });

export const ExtensionSession = model('ExtensionSession', extensionSessionSchema);
