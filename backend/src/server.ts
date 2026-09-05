import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { connectDatabase, databaseStatus } from './config/database';
import { cleanupOrphanedRecords } from './services/cleanup';
import authRoutes from './routes/auth';
import problemRoutes from './routes/problems';
import extensionAuthRoutes from './routes/extensionAuth';
import dashboardRoutes from './routes/dashboard';
import revisionRoutes from './routes/revisions';

const app = express();
app.use(cors({ origin: (origin, callback) => {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  if (!origin || origin === frontend || origin.startsWith('chrome-extension://')) return callback(null, true);
  return callback(new Error('CORS origin denied'));
} }));
app.use(express.json());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), authRoutes);
app.use('/api/auth/extension', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), extensionAuthRoutes);
const dataLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 });
app.use('/api/problems', dataLimiter, problemRoutes);
app.use('/api/dashboard', dataLimiter, dashboardRoutes);
app.use('/api/revisions', dataLimiter, revisionRoutes);
app.get('/api/health', (_req, res) => { const database = databaseStatus(); res.status(database === 'connected' ? 200 : 503).json({ success: database === 'connected', database }); });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.name === 'ZodError') return res.status(400).json({ success:false,error:{code:'VALIDATION_ERROR',message:'Invalid request'} });
  if (typeof error === 'object' && error !== null && 'code' in error && (error as {code?:number}).code === 11000) return res.status(409).json({ success:false,error:{code:'DUPLICATE_RESOURCE',message:'Resource already exists'} });
  console.error(error); res.status(500).json({ success:false,error:{code:'INTERNAL_ERROR',message:'Internal server error'} });
});

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));
const port = Number(process.env.PORT ?? 5000);
connectDatabase().then(async () => {
  await cleanupOrphanedRecords().catch(error => console.error('Orphan cleanup failed:', error));
  setInterval(() => { cleanupOrphanedRecords().catch(error => console.error('Orphan cleanup failed:', error)); }, 6 * 60 * 60 * 1000);
  app.listen(port, () => console.log(`DSA Tracker API listening on ${port}`));
}).catch((error: Error) => { console.error(`Unable to start: MongoDB connection failed. ${error.message}`); process.exit(1); });
