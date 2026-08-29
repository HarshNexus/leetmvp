import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

export interface AuthRequest extends Request { userId?: string }
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  try { const payload = jwt.verify(token, process.env.JWT_SECRET!); if (typeof payload === 'string' || !Types.ObjectId.isValid(payload.userId)) throw new Error(); req.userId = payload.userId; next(); }
  catch { return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }); }
}
