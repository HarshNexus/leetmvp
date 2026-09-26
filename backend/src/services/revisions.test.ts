import { describe, expect, it } from 'vitest';
import { DEFAULT_REVISION_STAGES, getRevisionDueAt, isRevisionActive, normalizeRevisionStages } from './revisions';

describe('revision state helpers', () => {
  it('treats completed revisions as inactive even if scheduledAt is still due', () => {
    expect(isRevisionActive({ status: 'completed' })).toBe(false);
    expect(isRevisionActive({ completedAt: new Date('2026-08-30T12:00:00.000Z') })).toBe(false);
    expect(isRevisionActive({ status: 'active' })).toBe(true);
  });

  it('uses nextReviewAt as the canonical due date and falls back for legacy rows', () => {
    const next = getRevisionDueAt({ nextReviewAt: '2026-08-30T10:00:00.000Z', scheduledAt: '2026-08-29T10:00:00.000Z' });
    const legacy = getRevisionDueAt({ scheduledAt: '2026-08-29T10:00:00.000Z' });
    expect(next?.toISOString()).toBe('2026-08-30T10:00:00.000Z');
    expect(legacy?.toISOString()).toBe('2026-08-29T10:00:00.000Z');
  });

  it('always includes the mandatory 1-day baseline plus any custom intervals, deduped and sorted', () => {
    expect(normalizeRevisionStages([])).toEqual(DEFAULT_REVISION_STAGES);
    expect(normalizeRevisionStages(undefined)).toEqual([1]);
    expect(normalizeRevisionStages([21, 7, 7, 1])).toEqual([1, 7, 21]);
    expect(normalizeRevisionStages([3, 14])).toEqual([1, 3, 14]);
    expect(normalizeRevisionStages([11, 18])).toEqual([1, 11, 18]);
  });
});
