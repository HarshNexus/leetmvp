import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Revision } from '../types';

type ReviewFilter = 'all' | 'overdue' | 'today' | 'this-week';
type ReviewChoice = 'Solved' | 'Needed Hint' | 'Not Solved';

type DateGroup = {
  key: string;
  label: string;
  date: Date;
  items: Revision[];
};

const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'this-week', label: 'This Week' },
  { key: 'all', label: 'All' },
];

const asRevisionList = (value: unknown): Revision[] => {
  if (Array.isArray(value)) return value as Revision[];
  const candidate = value as { revisions?: Revision[]; data?: Revision[] } | undefined;
  if (Array.isArray(candidate?.revisions)) return candidate.revisions;
  if (Array.isArray(candidate?.data)) return candidate.data;
  return [];
};

const toDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (value: Date, amount: number) => {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
};

const dateKey = (value: Date) => {
  const date = startOfDay(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const dueDateFor = (revision: Revision) => revision.nextReviewAt || revision.scheduledAt;

const isOverdue = (revision: Revision) => {
  const dueAt = toDate(dueDateFor(revision));
  if (!dueAt) return false;
  return startOfDay(dueAt) < startOfDay(new Date());
};

const isToday = (revision: Revision) => {
  const dueAt = toDate(dueDateFor(revision));
  if (!dueAt) return false;
  return dateKey(dueAt) === dateKey(new Date());
};

const startOfWeek = (value: Date) => {
  const date = startOfDay(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
};

const isThisWeek = (revision: Revision) => {
  const dueAt = toDate(dueDateFor(revision));
  if (!dueAt) return false;
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const dueDay = startOfDay(dueAt);
  return dueDay >= today && dueDay <= weekEnd;
};

const filterRows = (rows: Revision[], filter: ReviewFilter) => {
  switch (filter) {
    case 'overdue':
      return rows.filter((row) => isOverdue(row));
    case 'today':
      return rows.filter((row) => isToday(row));
    case 'this-week':
      return rows.filter((row) => isThisWeek(row));
    case 'all':
    default:
      return rows;
  }
};

const sortByNextReview = (a: Revision, b: Revision) => {
  const left = toDate(dueDateFor(a))?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const right = toDate(dueDateFor(b))?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return left - right;
};

const stageDisplay = (stage?: string) => {
  const value = (stage || '').toLowerCase();
  if (!value) return '1 Day';
  if (value === 'today') return 'Today';
  if (value === '1-day') return '1 Day';
  if (value === '7-day') return '7 Days';
  if (value === '21-day') return '21 Days';
  if (/^\d+-day$/i.test(value)) return `${Number.parseInt(value, 10)} Days`;
  return value.replace(/-/g, ' ');
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type TrackerRow = {
  problemId: string;
  title: string;
  platform: string;
  difficulty?: string;
  url?: string;
  solvedAt: string | null;
  done: [boolean, boolean, boolean]; // 1-day, 7-day, 21-day
};

// Every solved problem gets exactly 3 mandatory revisions (1/7/21-day).
// This groups the raw revision list (which includes completed rows) by
// problem and marks which of those 3 stages are already done, so the
// checkmarks are always derived from real data - never manually toggled.
const buildTrackerRows = (allRows: Revision[]): TrackerRow[] => {
  const map = new Map<string, TrackerRow>();
  for (const row of allRows) {
    const problem = row.problemId;
    const key = problem?._id;
    if (!key) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        problemId: key,
        title: problem.title || 'Problem',
        platform: row.platform || 'LeetCode',
        difficulty: problem.difficulty,
        url: problem.url,
        solvedAt: row.solvedAt ?? null,
        done: [false, false, false],
      };
      map.set(key, entry);
    }
    if (!entry.solvedAt && row.solvedAt) entry.solvedAt = row.solvedAt;
    const isDone = Boolean(row.completedAt) || row.status?.toLowerCase() === 'completed';
    if (!isDone) continue;
    if (row.stageDays === 1) entry.done[0] = true;
    else if (row.stageDays === 7) entry.done[1] = true;
    else if (row.stageDays === 21) entry.done[2] = true;
  }
  return [...map.values()].sort((a, b) => (toDate(b.solvedAt)?.getTime() ?? 0) - (toDate(a.solvedAt)?.getTime() ?? 0));
};

const formatGroupLabel = (date: Date) => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const dueDay = startOfDay(date);
  if (dateKey(dueDay) === dateKey(today)) return 'Today';
  if (dateKey(dueDay) === dateKey(tomorrow)) return 'Tomorrow';
  if (dueDay >= weekStart && dueDay <= weekEnd) return 'This Week';
  return dueDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Revisions() {
  const [rows, setRows] = useState<Revision[]>([]);
  const [rawRows, setRawRows] = useState<Revision[]>([]);
  const [showTracker, setShowTracker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<ReviewFilter>('all');
  const [reviewTarget, setReviewTarget] = useState<Revision | null>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [problemOptions, setProblemOptions] = useState<any[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(new Set());
  const [addBusy, setAddBusy] = useState(false);
  const [, refreshClock] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.revisions();
      const allRows = asRevisionList(response);
      setRawRows(allRows);
      const nextRows = allRows.filter((row) => {
        if (row.completedAt || row.status?.toLowerCase() === 'completed') return false;
        return true;
      });
      setRows(nextRows);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to load revisions.';
      setError(message);
      console.error('[Revision UI] Fetch failed:', requestError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => refreshClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeRows = useMemo(() => [...rows].sort(sortByNextReview), [rows]);
  const trackerRows = useMemo(() => buildTrackerRows(rawRows), [rawRows]);

  const counts = useMemo(() => {
    const overdue = activeRows.filter((row) => isOverdue(row)).length;
    const today = activeRows.filter((row) => isToday(row)).length;
    const thisWeek = activeRows.filter((row) => isThisWeek(row)).length;
    const all = activeRows.length;
    return { all, overdue, today, thisWeek };
  }, [activeRows]);

  const filteredRows = useMemo(() => filterRows(activeRows, selectedFilter), [activeRows, selectedFilter]);

  const groupedRows = useMemo<DateGroup[]>(() => {
    const groups = new Map<string, DateGroup>();
    for (const row of filteredRows) {
      const dueAt = toDate(dueDateFor(row));
      if (!dueAt) continue;
      const date = startOfDay(dueAt);
      const today = startOfDay(new Date());
      const tomorrow = addDays(today, 1);
      const weekStart = startOfWeek(today);
      const weekEnd = addDays(weekStart, 6);
      const inCurrentWeek = date >= weekStart && date <= weekEnd;
      const key = dateKey(date);
      // Today and Tomorrow each get their own heading; the rest of the
      // current week folds into a single "This Week" heading below them.
      const bucketKey = key === dateKey(today)
        ? key
        : key === dateKey(tomorrow)
          ? key
          : inCurrentWeek
            ? 'this-week'
            : key;
      const existing = groups.get(bucketKey);
      if (existing) {
        existing.items.push(row);
      } else {
        groups.set(bucketKey, {
          key: bucketKey,
          label: formatGroupLabel(date),
          date,
          items: [row],
        });
      }
    }
    return [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredRows]);

  const solutionsUrlFor = (revision: Revision) => {
    const problemUrl = revision.problemId?.url;
    if (!problemUrl) return null;
    const platform = revision.platform || 'LeetCode';
    try {
      if (platform === 'LeetCode') {
        const parsed = new URL(problemUrl);
        const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
        parsed.pathname = `${path}solutions/`;
        return parsed.toString();
      }
      // GeeksforGeeks practice pages are client-rendered and don't expose a
      // fixed "/solutions/" URL - the editorial/discussion is a tab on the
      // problem's own page, so just open that page.
      if (platform === 'GeeksforGeeks') return problemUrl;
      return null;
    } catch {
      return null;
    }
  };

  const submitReview = async (result: ReviewChoice) => {
    if (!reviewTarget) return;
    try {
      if (result === 'Needed Hint') {
        const solutionsUrl = solutionsUrlFor(reviewTarget);
        if (solutionsUrl) window.open(solutionsUrl, '_blank', 'noopener,noreferrer');
      }
      await api.completeRevision(reviewTarget._id, result);
      setReviewNotice(
        result === 'Solved'
          ? 'Question review completed.'
          : result === 'Not Solved'
            ? 'Question is now in Overdue.'
            : 'Hint noted. This stays on your list for today.',
      );
      setReviewTarget(null);
      await load();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to complete review.';
      setError(message);
      console.error('[Revision UI] Complete failed:', requestError);
    }
  };

  const deleteRevision = async (id: string) => {
    try {
      await api.deleteRevision(id);
      await load();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to remove revision.';
      setError(message);
      console.error('[Revision UI] Delete failed:', requestError);
    }
  };

  const addQuestion = async () => {
    if (!problemOptions.length) {
      const response = await api.problems();
      setProblemOptions(response.items);
    }
    setSelectedProblems(new Set());
    setPickerSearch('');
    setPickerOpen(true);
  };

  const addSelected = async () => {
    if (selectedProblems.size === 0) return;
    // Land the new revision inside whichever section is currently open,
    // instead of always scheduling it 7 days out.
    const today = startOfDay(new Date());
    const days = selectedFilter === 'today' || selectedFilter === 'overdue'
      ? 0
      : selectedFilter === 'this-week'
        ? Math.max(0, Math.round((addDays(startOfWeek(today), 6).getTime() - today.getTime()) / 86400000))
        : 7;
    setAddBusy(true);
    try {
      for (const id of selectedProblems) {
        await api.addRevision(id, days);
      }
      setPickerOpen(false);
      await load();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to add revisions.';
      setError(message);
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <main className="shell page-shell revision-page">
      <div className="page-intro">
        <span className="eyebrow">RETENTION</span>
        <h1>Revision</h1>
        <p className="muted">Review your solved problems at the right time.</p>
      </div>

      <section className="revision-summary">
        <div className="revision-metric"><span>Overdue</span><strong>{counts.overdue}</strong></div>
        <div className="revision-metric"><span>Today</span><strong>{counts.today}</strong></div>
        <div className="revision-metric"><span>This Week</span><strong>{counts.thisWeek}</strong></div>
        <div className="revision-metric"><span>All</span><strong>{counts.all}</strong></div>
      </section>

      <section className="panel revision-panel">
        {reviewNotice && <p className="state">{reviewNotice}</p>}

        <div className="group-label-row">
          <strong>{showTracker ? 'Solved' : FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'All'}</strong>
          <button type="button" className="outline-button small" disabled={addBusy} onClick={() => void addQuestion()}>+ Add Question</button>
        </div>

        <div className="revision-tabs" role="tablist" aria-label="Revision filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`tab-button ${!showTracker && selectedFilter === filter.key ? 'active' : ''}`}
              onClick={() => {
                setShowTracker(false);
                setSelectedFilter(filter.key);
              }}
            >
              {filter.label}
              <span className="tab-count">{filter.key === 'all' ? counts.all : filterRows(activeRows, filter.key).length}</span>
            </button>
          ))}
          <button
            type="button"
            className={`tab-button ${showTracker ? 'active' : ''}`}
            onClick={() => setShowTracker(true)}
          >
            Solved
            <span className="tab-count">{trackerRows.length}</span>
          </button>
        </div>

        {showTracker ? (
          trackerRows.length === 0 ? (
            <div className="empty-state-box">
              <h3>No solved problems yet</h3>
              <p>Solve a problem to start tracking its 3 revisions here.</p>
            </div>
          ) : (
            <div className="revision-row-list">
              {trackerRows.map((row) => (
                <div className="revision-row tracker-row" key={row.problemId}>
                  <div className="problem-name-wrap">
                    <span className="problem-name">{row.title}</span>
                    <span className="meta-row">
                      <span>{row.platform}</span>
                      <span>·</span>
                      <span>{row.difficulty || 'Easy'}</span>
                      <span>·</span>
                      <span>Solved: {formatDate(row.solvedAt)}</span>
                    </span>
                  </div>
                  <div className="tracker-checkboxes">
                    {(['1st', '2nd', '3rd'] as const).map((label, index) => (
                      <label className="tracker-checkbox" key={label}>
                        <input type="checkbox" checked={row.done[index]} disabled readOnly />
                        <span>{label} Revision</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="state">Loading revisions...</div>
        ) : error ? (
          <div className="state error">{error}<button className="outline-button small" onClick={() => void load()}>Retry</button></div>
        ) : groupedRows.length === 0 ? (
          <div className="empty-state-box">
            <h3>✓ You're all caught up</h3>
            <p>There are no active revisions in this view.</p>
          </div>
        ) : (
          <div className="revision-group-stack">
            {groupedRows.map((group) => (
              <div className="revision-group" key={group.key}>
                <div className="group-label-row">
                  <span>{group.label}</span>
                  <strong>{group.items.length}</strong>
                </div>
                <div className="revision-row-list">
                  {group.items.map((item) => {
                    const dueAt = dueDateFor(item);
                    const status = isOverdue(item) ? 'OVERDUE' : isToday(item) ? 'DUE' : 'UPCOMING';
                    const overdueDays = status === 'OVERDUE' && dueAt ? Math.max(0, Math.ceil((Date.now() - new Date(dueAt).getTime()) / 86400000)) : 0;
                    return (
                      <div className="revision-row" key={item._id}>
                        <div className="revision-row-main">
                          <div className="problem-name-wrap">
                            <span className="problem-name">{item.problemId?.title || 'Problem'}</span>
                            <span className="meta-row">
                              <span>{item.platform || 'LeetCode'}</span>
                              <span>·</span>
                              <span>{item.problemId?.difficulty || 'Easy'}</span>
                              <span>·</span>
                              <span>Solved: {formatDate(item.solvedAt || undefined)}</span>
                              <span>·</span>
                              <span>Revision: {stageDisplay(item.stage)}</span>
                              <span>·</span>
                              <span>Due: {formatDate(dueAt)}</span>
                            </span>
                          </div>
                          <div className="meta-stack">
                            <span className={`mini-badge ${status.toLowerCase()}`}>
                              {status === 'DUE' ? 'Due' : status === 'OVERDUE' ? `Overdue · ${overdueDays}d` : 'Upcoming'}
                            </span>
                          </div>
                        </div>
                        <div className="revision-row-actions">
                          <a href={item.problemId?.url || '#'} target="_blank" rel="noreferrer" aria-label={`Open ${item.problemId?.title || 'problem'}`}>↗</a>
                          {(status === 'DUE' || status === 'OVERDUE') && (
                            <button type="button" onClick={() => setReviewTarget(item)}>Review</button>
                          )}
                          <button type="button" className="outline-button small" onClick={() => void deleteRevision(item._id)}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {pickerOpen && (
        <div className="modal-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Problems</h3>
              <button type="button" className="text-button" onClick={() => setPickerOpen(false)}>Close</button>
            </div>
            <input placeholder="Search problem name or number..." value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} />
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {problemOptions
                .filter((problemEntry) => {
                  const query = pickerSearch.toLowerCase();
                  const title = problemEntry.problemId.title.toLowerCase();
                  const id = String(problemEntry.problemId.leetcodeId || problemEntry.problemId.externalId || '');
                  return title.includes(query) || id.includes(query);
                })
                .map((problemEntry) => (
                  <div className="revision-row" key={problemEntry.problemId._id}>
                    <span>{problemEntry.problemId.title} · {problemEntry.platform || 'LeetCode'} · {problemEntry.problemId.difficulty}</span>
                    <button type="button" onClick={() => setSelectedProblems((current) => {
                      const next = new Set(current);
                      if (next.has(problemEntry.problemId._id)) next.delete(problemEntry.problemId._id);
                      else next.add(problemEntry.problemId._id);
                      return next;
                    })}>
                      {selectedProblems.has(problemEntry.problemId._id) ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                ))}
            </div>
            <div className="modal-actions">
              <span>Selected: {selectedProblems.size}</span>
              <button type="button" className="outline-button" onClick={() => setPickerOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!selectedProblems.size || addBusy} onClick={() => void addSelected()}>Add Selected</button>
            </div>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className="modal-backdrop" onClick={() => setReviewTarget(null)}>
          <div className="modal-card compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{reviewTarget.problemId?.title || 'Review problem'}</h3>
              <button type="button" className="text-button" onClick={() => setReviewTarget(null)}>Close</button>
            </div>
            <div className="review-meta-grid">
              <div><span>Revision</span><strong>{stageDisplay(reviewTarget.stage)}</strong></div>
              <div><span>Platform</span><strong>{reviewTarget.platform || 'LeetCode'}</strong></div>
              <div><span>Difficulty</span><strong>{reviewTarget.problemId?.difficulty || 'Easy'}</strong></div>
            </div>
            <a className="open-problem-link" href={reviewTarget.problemId?.url || '#'} target="_blank" rel="noreferrer">Open Problem ↗</a>
            <div className="review-choice-block">
              <span>How did it go?</span>
              <div className="review-choice-grid">
                {(['Solved', 'Needed Hint', 'Not Solved'] as ReviewChoice[]).map((choice) => (
                  <button key={choice} type="button" className="choice-button" onClick={() => void submitReview(choice)}>{choice}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

