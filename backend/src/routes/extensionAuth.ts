import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ExtensionAuthCode } from '../models/ExtensionAuthCode';
import { ExtensionSession } from '../models/ExtensionSession';
import { User } from '../models/User';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const clientInput = z.object({
  clientId: z.string().min(1).max(200),
  redirectUri: z.url(),
});
const tokenInput = clientInput.extend({ code: z.string().min(32) });
const refreshInput = z.object({ refreshToken: z.string().min(32), clientId: z.string().min(1).max(200) });
const accessExpiresIn = '15m';
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function accessToken(userId: string, sessionId: string) {
  return jwt.sign({ userId, sessionId, type: 'extension' }, process.env.JWT_SECRET!, { expiresIn: accessExpiresIn });
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function validRedirect(clientId: string, redirectUri: string) {
  return redirectUri === `https://${clientId}.chromiumapp.org/extension-auth`;
}

router.post('/authorize', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const input = clientInput.parse(req.body);
    if (!validRedirect(input.clientId, input.redirectUri)) return res.status(400).json({ success: false, error: { code: 'INVALID_REDIRECT_URI', message: 'Invalid extension callback' } });
    const code = randomToken();
    await ExtensionAuthCode.create({ codeHash: hash(code), userId: req.userId, clientId: input.clientId, redirectUri: input.redirectUri, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    res.json({ success: true, data: { code } });
  } catch (error) { next(error); }
});

router.post('/token', async (req, res, next) => {
  try {
    const input = tokenInput.parse(req.body);
    const authCode = await ExtensionAuthCode.findOneAndDelete({ codeHash: hash(input.code), clientId: input.clientId, redirectUri: input.redirectUri, expiresAt: { $gt: new Date() } });
    if (!authCode) return res.status(400).json({ success: false, error: { code: 'INVALID_AUTH_CODE', message: 'Authentication code is invalid or expired' } });
    const refreshToken = randomToken();
    const session = await ExtensionSession.create({ refreshTokenHash: hash(refreshToken), userId: authCode.userId, clientId: input.clientId, expiresAt: new Date(Date.now() + refreshLifetimeMs) });
    const user = await User.findById(authCode.userId).lean();
    if (!user) return res.status(401).json({ success: false, error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account is unavailable' } });
    res.json({ success: true, data: { accessToken: accessToken(String(user._id), String(session._id)), refreshToken, expiresIn: 900, user: { id: String(user._id), email: user.email } } });
  } catch (error) { next(error); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const input = refreshInput.parse(req.body);
    const session = await ExtensionSession.findOne({ refreshTokenHash: hash(input.refreshToken), clientId: input.clientId, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Extension session expired' } });
    const user = await User.findById(session.userId).lean();
    if (!user) return res.status(401).json({ success: false, error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account is unavailable' } });
    res.json({ success: true, data: { accessToken: accessToken(String(user._id), String(session._id)), expiresIn: 900, user: { id: String(user._id), email: user.email } } });
  } catch (error) { next(error); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const input = refreshInput.parse(req.body);
    await ExtensionSession.updateOne({ refreshTokenHash: hash(input.refreshToken), clientId: input.clientId }, { $set: { revokedAt: new Date() } });
    res.json({ success: true, data: {} });
  } catch (error) { next(error); }
});

export default router;
