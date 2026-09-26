import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, getCached } from '../services/api';
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

type TrackerStage = { stageDays: number; done: boolean };
type TrackerRow = {
  problemId: string;
  title: string;
  platform: string;
  difficulty?: string;
  url?: string;
  solvedAt: string | null;
  stages: TrackerStage[];
};

// Revision stages are user-configurable (1-day is the only mandatory one -
// see Settings), so a problem can carry any number of them. This groups the
// raw revision list (which includes completed rows) by problem and marks
// which of its actual stages are already done, so the checkmarks are always
// derived from real data - never manually toggled or assumed to be 1/7/21.
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
        stages: [],
      };
      map.set(key, entry);
    }
    if (!entry.solvedAt && row.solvedAt) entry.solvedAt = row.solvedAt;
    const isDone = Boolean(row.completedAt) || row.status?.toLowerCase() === 'completed';
    const stageDays = row.stageDays ?? 0;
    let stage = entry.stages.find((existing) => existing.stageDays === stageDays);
    if (!stage) { stage = { stageDays, done: false }; entry.stages.push(stage); }
    if (isDone) stage.done = true;
  }
  for (const entry of map.values()) entry.stages.sort((a, b) => a.stageDays - b.stageDays);
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

// Swipe accelerator for due/overdue rows: drag right to mark solved on the
// spot, drag left to open the same review modal the "Review" button opens
// (needed since "Needed Hint" / "Not Solved" can't be told apart by a swipe
// direction alone). Clicks on links/buttons inside the row still work
// normally - only a drag that starts elsewhere on the row is captured.
function SwipeableRow({ children, onSwipeRight, onSwipeLeft }: { children: React.ReactNode; onSwipeRight: () => void; onSwipeLeft: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, dx: 0, active: false });

  const setTint = (dx: number) => {
    const node = ref.current?.parentElement;
    if (!node) return;
    const right = node.querySelector<HTMLElement>('.swipe-tint.right');
    const left = node.querySelector<HTMLElement>('.swipe-tint.left');
    if (right) right.style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
    if (left) left.style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a,button')) return;
    drag.current = { startX: event.clientX, dx: 0, active: true };
    ref.current?.setPointerCapture(event.pointerId);
    ref.current?.classList.add('dragging');
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !ref.current) return;
    const dx = event.clientX - drag.current.startX;
    drag.current.dx = dx;
    ref.current.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
    setTint(dx);
  };
  const release = () => {
    if (!drag.current.active || !ref.current) return;
    drag.current.active = false;
    const node = ref.current;
    const dx = drag.current.dx;
    drag.current.dx = 0;
    node.classList.remove('dragging');
    if (dx > 90) {
      // Keep sliding the card off in the direction it was swiped instead of
      // snapping back to center - it only actually leaves the list once the
      // "mark solved" request finishes, so this keeps the card in motion
      // through that gap instead of settling back into place first.
      node.style.transform = 'translateX(140%) rotate(10deg)';
      setTint(0);
      window.setTimeout(onSwipeRight, 280);
      return;
    }
    node.style.transform = '';
    setTint(0);
    if (dx < -90) onSwipeLeft();
  };

  return (
    <>
      <span className="swipe-tint right">Solved ✓</span>
      <span className="swipe-tint left">Review</span>
      <div ref={ref} className="swipe-target" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={release} onPointerCancel={release}>
        {children}
      </div>
    </>
  );
}

const activeOnly = (allRows: Revision[]) => allRows.filter((row) => {
  if (row.completedAt || row.status?.toLowerCase() === 'completed') return false;
  return true;
});

function RevisionScheduleCard({ onChange }: { onChange: () => void }) {
  const [days, setDays] = useState<number[]>([1]);
  const [loading, setLoading] = useState(true);
  const [newDay, setNewDay] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.revisionsSettings().then(result => setDays(result.revisionStages)).catch(() => undefined).finally(() => setLoading(false)); }, []);

  async function persist(next: number[]) {
    setBusy(true);
    try {
      const result = await api.updateRevisionSettings([...new Set(next)].sort((a, b) => a - b));
      setDays(result.revisionStages);
      onChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update schedule.');
    } finally {
      setBusy(false);
      window.setTimeout(() => setMessage(''), 2500);
    }
  }

  function addDay(event: FormEvent) {
    event.preventDefault();
    const value = Number.parseInt(newDay, 10);
    if (!Number.isInteger(value) || value <= 0 || value > 3650 || days.includes(value)) { setNewDay(''); return; }
    setNewDay('');
    void persist([...days, value]);
  }

  function removeDay(day: number) {
    if (day === 1) return;
    void persist(days.filter(existing => existing !== day));
  }

  return (
    <section className="panel revision-schedule-panel">
      <h2>Revision schedule</h2>
      <p className="muted">Choose which days you want to revise a solved problem on. The 1-day revision is always included.</p>
      {loading ? <p className="muted">Loading…</p> : (
        <div className="day-chip-row">
          {days.map(day => (
            <span className={`day-chip ${day === 1 ? 'locked' : ''}`} key={day}>
              {day === 1 ? '1 Day' : `${day} Days`}
              {day !== 1 && <button type="button" aria-label={`Remove ${day}-day revision`} disabled={busy} onClick={() => removeDay(day)}>×</button>}
            </span>
          ))}
        </div>
      )}
      <form className="day-chip-form" onSubmit={addDay}>
        <input type="number" min="2" max="3650" placeholder="e.g. 11" value={newDay} onChange={event => setNewDay(event.target.value)} disabled={busy}/>
        <button type="submit" className="outline-button small" disabled={busy || !newDay}>+ Add day</button>
      </form>
      {message && <span className="muted">{message}</span>}
    </section>
  );
}

export default function Revisions() {
  // Seed from the API client's cache (survives switching pages and back) so
  // a revisit renders the previous list immediately instead of flashing an
  // empty "Loading…" state while it refetches in the background.
  const cachedRawRows = asRevisionList(getCached('/revisions'));
  const [rows, setRows] = useState<Revision[]>(() => activeOnly(cachedRawRows));
  const [rawRows, setRawRows] = useState<Revision[]>(cachedRawRows);
  const [showTracker, setShowTracker] = useState(false);
  const [loading, setLoading] = useState(cachedRawRows.length === 0);
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
    setError('');
    try {
      const response = await api.revisions();
      const allRows = asRevisionList(response);
      setRawRows(allRows);
      setRows(activeOnly(allRows));
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

  const finishReview = async (revision: Revision, result: ReviewChoice) => {
    try {
      if (result === 'Needed Hint') {
        const solutionsUrl = solutionsUrlFor(revision);
        if (solutionsUrl) window.open(solutionsUrl, '_blank', 'noopener,noreferrer');
      }
      await api.completeRevision(revision._id, result);
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
  const submitReview = (result: ReviewChoice) => { if (reviewTarget) void finishReview(reviewTarget, result); };

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
        <p className="muted">Review your solved problems at the right time. Drag a due card right to mark it solved, or left to review it.</p>
      </div>

      <section className="revision-top-row">
        <div className="revision-stats-grid">
          <div className="revision-metric"><span>Overdue</span><strong>{counts.overdue}</strong></div>
          <div className="revision-metric"><span>Today</span><strong>{counts.today}</strong></div>
          <div className="revision-metric"><span>This Week</span><strong>{counts.thisWeek}</strong></div>
          <div className="revision-metric"><span>All</span><strong>{counts.all}</strong></div>
        </div>
        <RevisionScheduleCard onChange={() => void load()} />
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
              <p>Solve a problem to start tracking its revisions here.</p>
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
                    {row.stages.map((stage) => (
                      <label className="tracker-checkbox" key={stage.stageDays}>
                        <input type="checkbox" checked={stage.done} disabled readOnly />
                        <span>{stage.stageDays === 1 ? '1 Day' : `${stage.stageDays} Day`} Revision</span>
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
                    const actionable = status === 'DUE' || status === 'OVERDUE';
                    const rowBody = (
                      <>
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
                          {actionable && (
                            <button type="button" onClick={() => setReviewTarget(item)}>Review</button>
                          )}
                          <button type="button" className="outline-button small" onClick={() => void deleteRevision(item._id)}>🗑</button>
                        </div>
                      </>
                    );
                    return (
                      <div className="revision-row" key={item._id}>
                        {actionable ? (
                          <SwipeableRow onSwipeRight={() => void finishReview(item, 'Solved')} onSwipeLeft={() => setReviewTarget(item)}>
                            {rowBody}
                          </SwipeableRow>
                        ) : (
                          <div className="revision-row-inner">{rowBody}</div>
                        )}
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
          <div className="modal-card picker-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Problems</h3>
              <button type="button" className="text-button" onClick={() => setPickerOpen(false)}>Close</button>
            </div>
            <input placeholder="Search problem name or number..." value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} />
            <div className="picker-scroll">
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

