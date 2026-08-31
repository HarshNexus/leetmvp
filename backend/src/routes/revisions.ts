import { Router } from 'express';
import { z } from 'zod';
import { Revision } from '../models/Revision';
import { SolvedProblem } from '../models/SolvedProblem';
import { User } from '../models/User';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { backfillRevisionPlans, DEFAULT_REVISION_STAGES, endOfTodayInAppTime, getRevisionDueAt, getRevisionStateFromDate, isRevisionActive, normalizeActiveRevisions, normalizeRevisionStages } from '../services/revisions';

const r = Router();
r.use(requireAuth);

const result = z.enum(['Solved', 'Needed Hint', 'Not Solved']);
const scheduleInput = z.object({ intervals: z.array(z.number().int().positive().max(3650)).min(1) });
const addInput=z.object({problemId:z.string(),stageDays:z.number().int().min(0).max(3650)});

const buildRows = (revisions: any[], solvedMap = new Map<string, Date>()) => revisions.map((item) => {
  const problemValue = item.problemId;
  const problemId = typeof problemValue === 'object' && problemValue !== null ? String((problemValue as { _id?: unknown })._id ?? '') : String(problemValue ?? '');
  const dueAt = getRevisionDueAt(item);
  return {
    ...item,
    ...(dueAt ? { scheduledAt: dueAt.toISOString(), nextReviewAt: dueAt.toISOString() } : {}),
    solvedAt: solvedMap.get(problemId)?.toISOString() ?? null,
    status: isRevisionActive(item) ? (dueAt ? getRevisionStateFromDate(dueAt) : 'UPCOMING') : 'COMPLETED',
  };
});

r.get('/settings', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.userId).select('revisionStages').lean();
    const revisionStages = normalizeRevisionStages((user as { revisionStages?: unknown } | null)?.revisionStages ?? DEFAULT_REVISION_STAGES);
    res.json({ success: true, data: { revisionStages } });
  } catch (error) {
    next(error);
  }
});

r.patch('/settings', async (req: AuthRequest, res, next) => {
  try {
    const payload = scheduleInput.parse(req.body);
    const revisionStages = normalizeRevisionStages(payload.intervals);
    await User.findByIdAndUpdate(req.userId, { $set: { revisionStages } });
    await backfillRevisionPlans(req.userId, revisionStages);
    res.json({ success: true, data: { revisionStages } });
  } catch (error) {
    next(error);
  }
});

r.get('/today', async (req: AuthRequest, res, next) => {
  try {
    const todayCutoff = endOfTodayInAppTime();
    await normalizeActiveRevisions(req.userId);
    const revisions = await Revision.find({
      userId: req.userId,
      completedAt: { $exists: false },
      status: { $ne: 'completed' },
      nextReviewAt: { $lte: todayCutoff },
    }).populate('problemId').sort({ nextReviewAt: 1 }).lean();

    const rows = buildRows(revisions);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

r.get('/', async (req: AuthRequest, res, next) => {
  try {
    await normalizeActiveRevisions(req.userId);
    const revisions = await Revision.find({ userId: req.userId }).populate('problemId').sort({ nextReviewAt: 1, scheduledAt: 1 }).lean();
    const solvedRecords = await SolvedProblem.find({ userId: req.userId }).select('problemId solvedAt').sort({ solvedAt: 1 }).lean();
    const solvedMap = new Map<string, Date>();
    for (const record of solvedRecords) {
      solvedMap.set(String(record.problemId), new Date(record.solvedAt));
    }

    const rows = buildRows(revisions, solvedMap);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

r.post('/', async (req: AuthRequest, res, next) => {
  try {
    const b = addInput.parse(req.body);
    const solved = await SolvedProblem.findOne({ userId: req.userId, problemId: b.problemId }).sort({ solvedAt: -1 });
    if (!solved) return res.status(404).json({ success: false, error: { code: 'PROBLEM_NOT_FOUND', message: 'The selected problem is not in your history.' } });

    await normalizeActiveRevisions(req.userId, b.problemId, solved.platform);
    const nextReviewAt = new Date();
    if (b.stageDays > 0) nextReviewAt.setDate(nextReviewAt.getDate() + b.stageDays);
    const stage = b.stageDays === 0 ? 'today' : `${b.stageDays}-day`;
    const revision = await Revision.findOneAndUpdate(
      {
        userId: req.userId,
        platform: solved.platform,
        problemId: b.problemId,
        stageDays: b.stageDays,
        completedAt: { $exists: false },
        status: { $ne: 'completed' },
      },
      {
        $setOnInsert: { userId: req.userId, platform: solved.platform, problemId: b.problemId, stageDays: b.stageDays, stage },
        $set: { scheduledAt: nextReviewAt, nextReviewAt, status: 'active' },
      },
      { upsert: true, new: true },
    ).populate('problemId');

    res.status(201).json({ success: true, data: revision });
  } catch (e) {
    next(e);
  }
});

r.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const deleted = await Revision.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });
    res.json({ success: true, data: { deletedId: deleted._id } });
  } catch (error) {
    next(error);
  }
});

r.post('/:id/complete', async (req: AuthRequest, res, next) => {
  try {
    const resultValue = result.parse(req.body.result);
    await normalizeActiveRevisions(req.userId);
    const current = await Revision.findOne({
      _id: req.params.id,
      userId: req.userId,
      completedAt: { $exists: false },
      status: { $ne: 'completed' },
    });

    if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });

    const reviewedAt = new Date();
    const reviewEntry = { reviewedAt, result: resultValue };

    if (resultValue === 'Not Solved') {
      // An unsuccessful attempt must remain reviewable in Overdue. If the
      // item was due today, move its scheduled date to yesterday so it
      // immediately appears in the Overdue subsection as well.
      const startOfToday = new Date(reviewedAt);
      startOfToday.setHours(0, 0, 0, 0);
      const overdueDate = getRevisionDueAt(current) ?? new Date(reviewedAt);
      if (overdueDate >= startOfToday) {
        overdueDate.setDate(startOfToday.getDate() - 1);
        overdueDate.setHours(23, 59, 59, 999);
      }

      const overdueRevision = await Revision.findOneAndUpdate(
        { _id: current._id, userId: req.userId, completedAt: { $exists: false } },
        {
          $set: {
            result: resultValue,
            status: 'active',
            scheduledAt: overdueDate,
            nextReviewAt: overdueDate,
            lastReviewedAt: reviewedAt,
          },
          $push: { reviewHistory: reviewEntry },
        },
        { new: true },
      ).populate('problemId');

      if (!overdueRevision) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });
      return res.json({ success: true, data: overdueRevision, message: 'Question is now in Overdue.' });
    }

    if (resultValue === 'Needed Hint') {
      // A hint isn't a failure - leave the due date untouched so the item
      // simply stays where it already was (e.g. Today), not pushed to Overdue.
      const hintRevision = await Revision.findOneAndUpdate(
        { _id: current._id, userId: req.userId, completedAt: { $exists: false } },
        {
          $set: { result: resultValue, status: 'active', lastReviewedAt: reviewedAt },
          $push: { reviewHistory: reviewEntry },
        },
        { new: true },
      ).populate('problemId');

      if (!hintRevision) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });
      return res.json({ success: true, data: hintRevision, message: 'Hint noted. This stays on your list for today.' });
    }

    const completedRevision = await Revision.findOneAndUpdate(
      { _id: current._id, userId: req.userId, completedAt: { $exists: false } },
      {
        $set: {
          result: resultValue,
          completedAt: reviewedAt,
          lastReviewedAt: reviewedAt,
          completionMethod: 'manual',
          status: 'completed',
        },
        $unset: { nextReviewAt: 1 },
        $push: { reviewHistory: reviewEntry },
      },
      { new: true },
    ).populate('problemId');

    if (!completedRevision) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });

    res.json({ success: true, data: completedRevision });
  } catch (error) {
    next(error);
  }
});

export default r;
