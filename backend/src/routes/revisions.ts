import { Router } from 'express';
import { z } from 'zod';
import { Revision } from '../models/Revision';
import { SolvedProblem } from '../models/SolvedProblem';
import { User } from '../models/User';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { endOfTodayInAppTime, getRevisionStateFromDate, normalizeRevisionStages } from '../services/revisions';

const r = Router();
r.use(requireAuth);

const result = z.enum(['Solved', 'Needed Hint', 'Not Solved']);
const scheduleInput = z.object({ intervals: z.array(z.number().int().positive().max(3650)).min(1) });
const addInput=z.object({problemId:z.string(),stageDays:z.number().int().min(0).max(3650)});

const buildRows = (revisions: any[]) => {
  const solvedRecords = new Map<string, Date>();
  return revisions.map((item) => {
    const problemValue = item.problemId;
    const problemId = typeof problemValue === 'object' && problemValue !== null ? String((problemValue as { _id?: unknown })._id ?? '') : undefined;
    if (problemId) {
      const solvedAt = item.solvedAt ?? null;
      if (solvedAt) solvedRecords.set(problemId, new Date(solvedAt));
    }

    return {
      ...item,
      solvedAt: problemId ? solvedRecords.get(problemId)?.toISOString() ?? null : null,
      status: item.completedAt ? 'COMPLETED' : getRevisionStateFromDate(item.scheduledAt),
    };
  });
};

r.get('/settings', async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.userId).select('revisionStages').lean();
    const revisionStages = normalizeRevisionStages((user as { revisionStages?: unknown } | null)?.revisionStages ?? [1, 7, 21]);
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
    res.json({ success: true, data: { revisionStages } });
  } catch (error) {
    next(error);
  }
});

r.get('/today', async (req: AuthRequest, res, next) => {
  try {
    const todayCutoff = endOfTodayInAppTime();
    const revisions = await Revision.find({
      userId: req.userId,
      completedAt: { $exists: false },
      scheduledAt: { $lte: todayCutoff },
    }).populate('problemId').sort({ scheduledAt: 1 }).lean();

    const rows = revisions.map((item) => ({
      ...item,
      status: getRevisionStateFromDate(item.scheduledAt, new Date()),
    }));

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

r.get('/', async (req: AuthRequest, res, next) => {
  try {
    const revisions = await Revision.find({ userId: req.userId }).populate('problemId').sort({ scheduledAt: 1 }).lean();
    const solvedRecords = await SolvedProblem.find({ userId: req.userId }).select('problemId solvedAt').lean();
    const solvedMap = new Map<string, Date>();
    for (const record of solvedRecords) {
      solvedMap.set(String(record.problemId), new Date(record.solvedAt));
    }

    const rows = revisions.map((item) => {
      const problemValue = item.problemId;
      const problemId = typeof problemValue === 'object' && problemValue !== null ? String((problemValue as { _id?: unknown })._id ?? '') : undefined;
      return {
        ...item,
        solvedAt: problemId ? solvedMap.get(problemId)?.toISOString() ?? null : null,
        status: item.completedAt ? 'COMPLETED' : getRevisionStateFromDate(item.scheduledAt),
      };
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

r.post('/',async(req:AuthRequest,res,next)=>{try{const b=addInput.parse(req.body);const solved=await SolvedProblem.findOne({userId:req.userId,problemId:b.problemId}).sort({solvedAt:-1});if(!solved)return res.status(404).json({success:false,error:{code:'PROBLEM_NOT_FOUND',message:'The selected problem is not in your history.'}});const scheduledAt=new Date();if(b.stageDays>0)scheduledAt.setDate(scheduledAt.getDate()+b.stageDays);const stage=b.stageDays===0?'today':`${b.stageDays}-day`;const revision=await Revision.findOneAndUpdate({userId:req.userId,platform:solved.platform,problemId:b.problemId,stageDays:b.stageDays},{$setOnInsert:{userId:req.userId,platform:solved.platform,problemId:b.problemId,stageDays:b.stageDays,stage,scheduledAt,status:'active'}},{upsert:true,new:true}).populate('problemId');res.status(201).json({success:true,data:revision});}catch(e){next(e);}});

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
    const current = await Revision.findOne({
      _id: req.params.id,
      userId: req.userId,
      completedAt: { $exists: false },
      status: { $ne: 'completed' },
    });

    if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });

    const reviewedAt = new Date();
    const reviewEntry = { reviewedAt, result: resultValue };

    if (resultValue !== 'Solved') {
      // A hint or an unsuccessful attempt must remain reviewable in Overdue.
      // If the item was due today, move its scheduled date to yesterday so it
      // immediately appears in the Overdue subsection as well.
      const startOfToday = new Date(reviewedAt);
      startOfToday.setHours(0, 0, 0, 0);
      const overdueDate = new Date(current.scheduledAt);
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

    const completedRevision = await Revision.findOneAndUpdate(
      { _id: current._id, userId: req.userId, completedAt: { $exists: false } },
      {
        $set: {
          result: resultValue,
          completedAt: reviewedAt,
          lastReviewedAt: reviewedAt,
          nextReviewAt: new Date(reviewedAt.getTime() + 86400000),
          completionMethod: 'manual',
          status: 'completed',
        },
        $push: { reviewHistory: reviewEntry },
      },
      { new: true },
    ).populate('problemId');

    if (!completedRevision) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revision not found.' } });

    const finishedStageDays = completedRevision.stage === 'today'
      ? 0
      : Number.parseInt((completedRevision.stage || '').replace(/-day/i, ''), 10);
    const user = await User.findById(req.userId).select('revisionStages').lean();
    const stages = normalizeRevisionStages((user as { revisionStages?: unknown } | null)?.revisionStages ?? [1, 7, 21]);
    const nextIndex = finishedStageDays === 0 ? -1 : stages.indexOf(finishedStageDays);
    const nextDays = finishedStageDays === 0 ? stages[0] : stages[nextIndex + 1];
    if (Number.isFinite(finishedStageDays) && Number.isFinite(nextDays) && (finishedStageDays === 0 || (nextIndex >= 0 && nextIndex < stages.length - 1))) {
      const nextStage = `${nextDays}-day`;
      const nextScheduledAt = new Date(reviewedAt);
      nextScheduledAt.setDate(nextScheduledAt.getDate() + nextDays);
      await Revision.updateOne(
        { userId: req.userId, problemId: completedRevision.problemId, stage: nextStage },
        { $setOnInsert: { userId: req.userId, problemId: completedRevision.problemId, platform: completedRevision.platform, stage: nextStage, stageDays: nextDays, scheduledAt: nextScheduledAt, status: 'active' } },
        { upsert: true }
      );
      await Revision.deleteMany({
        userId: req.userId,
        problemId: completedRevision.problemId,
        completedAt: { $exists: false },
        _id: { $ne: completedRevision._id },
        stage: { $ne: nextStage },
      });
    }

    res.json({ success: true, data: completedRevision });
  } catch (error) {
    next(error);
  }
});

export default r;
