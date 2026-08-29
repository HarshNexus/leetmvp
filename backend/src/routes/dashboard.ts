import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { SolvedProblem } from '../models/SolvedProblem';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
const goalsInput = z.object({ daily: z.number().int().min(0).max(1000), weekly: z.number().int().min(0).max(5000), monthly: z.number().int().min(0).max(50000) });

function dateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}
function addDays(key: string, amount: number) { const date = new Date(`${key}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function rangeKeys(start: string, end: string) { const keys: string[] = []; for (let key = start; key <= end; key = addDays(key, 1)) keys.push(key); return keys; }
function validTimezone(value: unknown) { if (typeof value !== 'string') return 'UTC'; try { Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; } catch { return 'UTC'; } }
function monday(key: string) { const day = new Date(`${key}T00:00:00Z`).getUTCDay(); return addDays(key, day === 0 ? -6 : 1 - day); }
function countBy<T>(values: T[]) { return values.reduce<Record<string, number>>((counts, value) => { const key = String(value); counts[key] = (counts[key] || 0) + 1; return counts; }, {}); }

router.get('/analytics', async (req: AuthRequest, res, next) => {
  try {
    const timezone = validTimezone(req.query.timezone);
    const records = await SolvedProblem.find({ userId: req.userId }).populate('problemId').sort({ solvedAt: 1 }).lean();
    const now = new Date();
    const today = dateKey(now, timezone);
    const todayStart = addDays(today, -364);
    const keys = records.map(record => dateKey(new Date(record.solvedAt), timezone));
    const activityCounts = countBy(keys);
    const activeDays = Object.keys(activityCounts).sort();
    const todayCount = activityCounts[today] || 0;
    const weekStart = monday(today);
    const monthStart = `${today.slice(0, 7)}-01`;
    const thisWeek = keys.filter(key => key >= weekStart && key <= today).length;
    const thisMonth = keys.filter(key => key >= monthStart && key <= today).length;
    let currentStreak = 0;
    let cursor = todayCount ? today : addDays(today, -1);
    while (activityCounts[cursor]) { currentStreak += 1; cursor = addDays(cursor, -1); }
    let longestStreak = 0;
    for (const start of activeDays) { if (activityCounts[addDays(start, -1)]) continue; let length = 0; while (activityCounts[addDays(start, length)]) length += 1; longestStreak = Math.max(longestStreak, length); }
    const difficulties = countBy(records.map(record => String((record.problemId as { difficulty?: string })?.difficulty || 'Unknown')));
    const languages = countBy(records.map(record => String(record.language || 'Unknown')));
    const topics = countBy(records.flatMap(record => ((record.problemId as { topics?: string[] })?.topics || [])));
    const activity = rangeKeys(todayStart, today).map(date => ({ date, count: activityCounts[date] || 0 }));
    const trend = (days: number) => { const start = addDays(today, -(days - 1)); return rangeKeys(start, today).map(date => ({ date, count: activityCounts[date] || 0 })); };
    const allStart = activeDays[0] || today;
    const user = await User.findById(req.userId).select('goals').lean();
    const goals = user?.goals || { daily: 1, weekly: 5, monthly: 20 };
    const total = records.length;
    const hard = difficulties.Hard || 0;
    const achievements = [
      ['first-problem', 'First Problem', total >= 1], ['ten-problems', '10 Problems', total >= 10], ['fifty-problems', '50 Problems', total >= 50], ['hundred-problems', '100 Problems', total >= 100], ['two-fifty-problems', '250 Problems', total >= 250], ['five-hundred-problems', '500 Problems', total >= 500],
      ['seven-day-streak', '7 Day Streak', longestStreak >= 7], ['thirty-day-streak', '30 Day Streak', longestStreak >= 30], ['hundred-day-streak', '100 Day Streak', longestStreak >= 100],
      ['first-hard', 'First Hard', hard >= 1], ['ten-hard', '10 Hard Problems', hard >= 10], ['fifty-hard', '50 Hard Problems', hard >= 50],
    ].map(([id, name, unlocked]) => ({ id, name, unlocked }));
    res.json({ success: true, data: { timezone, summary: { total, today: todayCount, thisWeek, thisMonth }, streak: { current: currentStreak, longest: longestStreak }, activity, difficulty: Object.entries(difficulties).map(([name, count]) => ({ name, count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 })), languages: Object.entries(languages).map(([name, count]) => ({ name, count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 })), topics: Object.entries(topics).map(([name, count]) => ({ name, count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 })), trends: { '7d': trend(7), '30d': trend(30), '6m': trend(180), all: rangeKeys(allStart, today).map(date => ({ date, count: activityCounts[date] || 0 })) }, goals, achievements } });
  } catch (error) { next(error); }
});

router.patch('/goals', async (req: AuthRequest, res, next) => { try { const goals = goalsInput.parse(req.body); await User.findByIdAndUpdate(req.userId, { $set: { goals } }); res.json({ success: true, data: { goals } }); } catch (error) { next(error); } });
export default router;
