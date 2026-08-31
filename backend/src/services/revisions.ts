import { Revision } from '../models/Revision';
import { SolvedProblem } from '../models/SolvedProblem';

export const ENABLED_REVISION_DAYS = [7, 21, 30];
export const DEFAULT_REVISION_STAGES = [1, 7, 21];

type RevisionLike = {
  _id?: unknown;
  userId?: unknown;
  problemId?: unknown;
  platform?: string;
  stage?: string;
  stageDays?: number;
  scheduledAt?: Date | string | null;
  nextReviewAt?: Date | string | null;
  completedAt?: Date | string | null;
  status?: string | null;
  createdAt?: Date | string;
};

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function endOfTodayInAppTime() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getRevisionDueAt(value: RevisionLike | null | undefined) {
  if (!value) return null;
  const raw = value.nextReviewAt ?? value.scheduledAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRevisionStateFromDate(value: Date, now = new Date()) {
  const d = new Date(value);
  return d.toDateString() === now.toDateString() ? 'DUE' : d > now ? 'UPCOMING' : 'OVERDUE';
}

/**
 * 1/7/21-day revisions are always scheduled for every solved problem. Any
 * additional intervals a user configures are added on top of that baseline,
 * never in place of it.
 */
export function normalizeRevisionStages(value: unknown) {
  const custom = Array.isArray(value)
    ? value.filter((x): x is number => Number.isInteger(x) && x > 0 && x <= 3650)
    : [];
  return [...new Set([...DEFAULT_REVISION_STAGES, ...custom])].sort((a, b) => a - b);
}

export function isRevisionActive(value: { completedAt?: Date | string | null; status?: string | null } | null | undefined) {
  if (!value) return false;
  const finished = Boolean(value.completedAt) || String(value.status ?? '').toLowerCase() === 'completed';
  return !finished;
}

function activeRevisionQuery(userId: any, problemId?: any, platform?: string) {
  const query: Record<string, unknown> = {
    userId,
    completedAt: { $exists: false },
    status: { $ne: 'completed' },
  };
  if (problemId !== undefined) query.problemId = problemId;
  if (platform !== undefined) query.platform = platform;
  return query;
}

/**
 * A problem legitimately has multiple active revisions in parallel (1-day,
 * 7-day, 21-day, plus any custom stages). This only removes true duplicates —
 * more than one active revision sharing the same problem AND the same stage.
 */
export async function pruneDuplicateActiveRevisions(userId: any, problemId?: any, keepId?: unknown) {
  const baseQuery: Record<string, unknown> = {
    userId,
    completedAt: { $exists: false },
    status: { $ne: 'completed' },
  };
  if (problemId !== undefined) baseQuery.problemId = problemId;
  const rows = await Revision.find(baseQuery).sort({ nextReviewAt: 1, scheduledAt: 1, createdAt: 1 }).lean();
  const byStage = new Map<string, typeof rows[number][]>();
  for (const row of rows) {
    const key = `${String(row.problemId)}:${row.stageDays ?? row.stage ?? ''}`;
    const current = byStage.get(key) ?? [];
    current.push(row);
    byStage.set(key, current);
  }

  for (const stageRows of byStage.values()) {
    if (stageRows.length <= 1) continue;
    const keep = stageRows.find((row) => String(row._id) === String(keepId)) ?? stageRows[0];
    const staleRows = stageRows.filter((row) => String(row._id) !== String(keep._id));
    if (staleRows.length === 0) continue;
    await Revision.deleteMany({ _id: { $in: staleRows.map((row) => row._id) } });
  }
}

/**
 * Backfills the canonical due-date field on legacy rows. This deliberately does
 * not delete or overwrite future revision documents.
 */
export async function normalizeActiveRevisions(userId: any, problemId?: any, platform?: string) {
  const revisions = await Revision.find(activeRevisionQuery(userId, problemId, platform)).lean();
  for (const revision of revisions) {
    const dueAt = getRevisionDueAt(revision);
    const set: Record<string, unknown> = { status: 'active' };
    if (dueAt) {
      set.scheduledAt = dueAt;
      set.nextReviewAt = dueAt;
    }
    await Revision.updateOne({ _id: revision._id }, { $set: set });
  }

  if (problemId !== undefined) {
    await pruneDuplicateActiveRevisions(userId, problemId);
  }
}

export async function ensurePlan(
  userId: any,
  problemId: any,
  platform: string,
  solvedAt: Date,
  stages = DEFAULT_REVISION_STAGES,
) {
  await normalizeActiveRevisions(userId, problemId, platform);
  const normalizedStages = normalizeRevisionStages(stages);
  for (const stageDays of normalizedStages) {
    const nextReviewAt = addDays(solvedAt, stageDays);
    await Revision.updateOne(
      { userId, problemId, platform, stageDays },
      {
        $setOnInsert: {
          userId,
          problemId,
          platform,
          stage: `${stageDays}-day`,
          stageDays,
          scheduledAt: nextReviewAt,
          nextReviewAt,
          status: 'active',
        },
      },
      { upsert: true },
    );
  }
  return Revision.findOne({ userId, problemId, platform, stageDays: normalizedStages[0] })
    .sort({ nextReviewAt: 1, scheduledAt: 1, createdAt: 1 });
}

/**
 * When a user adds a new custom revision interval, every problem they've
 * already solved should get that stage too, not just future submissions.
 * ensurePlan's upsert is additive ($setOnInsert only), so re-running it per
 * already-solved problem safely fills in just the missing stage(s) without
 * touching any existing active or completed revision.
 */
export async function backfillRevisionPlans(userId: any, stages: number[]) {
  const solvedRecords = await SolvedProblem.find({ userId }).select('problemId platform solvedAt').sort({ solvedAt: 1 }).lean();
  const earliestByProblem = new Map<string, { problemId: any; platform: string; solvedAt: Date }>();
  for (const record of solvedRecords) {
    const key = String(record.problemId);
    if (!earliestByProblem.has(key)) {
      earliestByProblem.set(key, { problemId: record.problemId, platform: record.platform, solvedAt: record.solvedAt });
    }
  }
  for (const { problemId, platform, solvedAt } of earliestByProblem.values()) {
    await ensurePlan(userId, problemId, platform, solvedAt, stages);
  }
}

/**
 * A resolve on LeetCode/GfG satisfies whichever revision stage is currently
 * due for that problem. Each stage (1/7/21-day + custom) is an independent
 * revision created up front by ensurePlan, so completing one here does not
 * create or advance any other stage.
 */
export async function completeDue(userId: any, problemId: any, solvedAt: Date) {
  await normalizeActiveRevisions(userId, problemId);
  const completed = await Revision.findOneAndUpdate(
    {
      ...activeRevisionQuery(userId, problemId),
      $or: [
        { nextReviewAt: { $lte: solvedAt } },
        { nextReviewAt: { $exists: false }, scheduledAt: { $lte: solvedAt } },
      ],
    },
    {
      $set: {
        completedAt: solvedAt,
        completionMethod: 'successful_resolve',
        result: 'Solved',
        status: 'completed',
        lastReviewedAt: solvedAt,
      },
      $unset: { nextReviewAt: 1 },
    },
    { sort: { nextReviewAt: 1, scheduledAt: 1 }, new: true },
  );

  return completed;
}
