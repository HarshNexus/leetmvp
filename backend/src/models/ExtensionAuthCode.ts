import { Schema, model } from 'mongoose';

const extensionAuthCodeSchema = new Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true },
  redirectUri: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export const ExtensionAuthCode = model('ExtensionAuthCode', extensionAuthCodeSchema);
