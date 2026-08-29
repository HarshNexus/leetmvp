import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Revision } from '../types';

type StageKey = 'overdue' | 'today' | '1-day' | '7-day' | '21-day' | 'custom';
type ReviewChoice = 'Solved' | 'Needed Hint' | 'Not Solved';
type SectionKey = 'OVERDUE' | 'DUE' | 'UPCOMING';

const DEFAULT_STAGE_TABS = [
  { key: 'today', label: 'Today' },
  { key: '1-day', label: '1 Day' },
  { key: '7-day', label: '7 Days' },
  { key: '21-day', label: '21 Days' },
] as const;

const DEFAULT_STAGES = [1, 7, 21];

const asRevisionList = (value: unknown): Revision[] => {
  if (Array.isArray(value)) return value as Revision[];
  const candidate = value as { revisions?: Revision[]; data?: Revision[] } | undefined;
  if (Array.isArray(candidate?.revisions)) return candidate.revisions;
  if (Array.isArray(candidate?.data)) return candidate.data;
  return [];
};

const stageDisplay = (stage?: string) => {
  const value = (stage || '').toLowerCase();
  if (!value) return '1 Day';
  if (value === '1-day') return '1 Day';
  if (value === '7-day') return '7 Days';
  if (value === '21-day') return '21 Days';
  if (/^\d+-day$/i.test(value)) return `${Number.parseInt(value, 10)} Days`;
  return value.replace(/-/g, ' ');
};

const stageKeyFromRevision = (revision: Revision): StageKey => {
  const value = (revision.stage || '').toLowerCase();
  if (value === '1-day' || value === '7-day' || value === '21-day') return value as '1-day' | '7-day' | '21-day';
  if (/^\d+-day$/i.test(value)) return 'custom';
  return 'custom';
};

const statusFor = (revision: Revision): 'DUE' | 'OVERDUE' | 'UPCOMING' | 'COMPLETED' => {
  if (revision.completedAt) return 'COMPLETED';
  const scheduledAt = revision.scheduledAt ? new Date(revision.scheduledAt) : null;
  if (!scheduledAt) return 'UPCOMING';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  scheduledAt.setHours(0, 0, 0, 0);
  if (scheduledAt.getTime() === today.getTime()) return 'DUE';
  if (scheduledAt.getTime() < today.getTime()) return 'OVERDUE';
  return 'UPCOMING';
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const readCustomIntervals = () => {
  try {
    const value = localStorage.getItem('leetmvp-custom-revision-intervals');
    if (!value) return [] as number[];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [] as number[];
    const normalized = parsed
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0 && item < 10000)
      .map((item) => Math.floor(item));
    return [...new Set(normalized)].sort((a, b) => a - b);
  } catch {
    return [] as number[];
  }
};

const toCustomIntervals = (stages: number[] | undefined) => {
  const values = (stages ?? DEFAULT_STAGES).filter((value) => !DEFAULT_STAGES.includes(value));
  return [...new Set(values)].sort((a, b) => a - b);
};

const resolveCustomValue = (customIntervals: number[], current: number | null) => {
  if (customIntervals.length === 0) return null;
  if (current !== null && customIntervals.includes(current)) return current;
  return customIntervals[0];
};

const matchCustomStage = (revision: Revision, interval: number) => {
  const stage = (revision.stage || '').toLowerCase();
  if (!stage) return false;
  const match = /^\d+-day$/i.test(stage) ? Number.parseInt(stage, 10) : NaN;
  return Number.isFinite(match) && match === interval;
};

export default function Revisions() {
  const [rows, setRows] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStage, setSelectedStage] = useState<StageKey>('today');
  const [customIntervals, setCustomIntervals] = useState<number[]>(() => readCustomIntervals());
  const [customSelection, setCustomSelection] = useState<number | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customInput, setCustomInput] = useState('30');
  const [reviewTarget, setReviewTarget] = useState<Revision | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [reviewNotice,setReviewNotice]=useState('');
  const [pickerOpen,setPickerOpen]=useState(false); const [problemOptions,setProblemOptions]=useState<any[]>([]); const [pickerSearch,setPickerSearch]=useState(''); const [selectedProblems,setSelectedProblems]=useState<Set<string>>(new Set());
  const [, refreshClock] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [response, settings] = await Promise.all([
        api.revisions(),
        api.revisionsSettings().catch(() => ({ revisionStages: DEFAULT_STAGES })),
      ]);
      const nextRows = asRevisionList(response);
      setRows(nextRows);
      const configured = Array.isArray(settings?.revisionStages) ? settings.revisionStages : DEFAULT_STAGES;
      const custom = toCustomIntervals(configured);
      setCustomIntervals(custom);
      setCustomSelection((current) => resolveCustomValue(custom, current));
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
    // Re-evaluate date-based sections while the page remains open across midnight.
    const timer = window.setInterval(() => refreshClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('leetmvp-custom-revision-intervals', JSON.stringify(customIntervals));
  }, [customIntervals]);

  const activeRows = useMemo(() => rows.filter((row) => !row.completedAt), [rows]);
  const overdueRows = useMemo(
    () => activeRows.filter((row) => statusFor(row) === 'OVERDUE'),
    [activeRows],
  );
  const todayRows = useMemo(
    () => activeRows.filter((row) => statusFor(row) === 'DUE'),
    [activeRows],
  );

  const counts = useMemo(() => {
    const dueToday = activeRows.filter((row) => statusFor(row) === 'DUE').length;
    const overdue = activeRows.filter((row) => statusFor(row) === 'OVERDUE').length;
    const upcoming = activeRows.filter((row) => statusFor(row) === 'UPCOMING').length;
    const completed = rows.filter((row) => row.completedAt).length;
    return { dueToday, overdue, upcoming, completed, todayTotal: dueToday + overdue };
  }, [activeRows, rows]);

  const stageCounts = useMemo(() => ({
    overdue: overdueRows.length,
    today: todayRows.length,
    '1-day': activeRows.filter((row) => stageKeyFromRevision(row) === '1-day').length,
    '7-day': activeRows.filter((row) => stageKeyFromRevision(row) === '7-day').length,
    '21-day': activeRows.filter((row) => stageKeyFromRevision(row) === '21-day').length,
    custom: customIntervals.length,
  }), [activeRows, customIntervals.length, overdueRows.length, todayRows.length]);

  const stageProgress = useMemo(() => {
    const items = [
      { key: 'today', label: 'Today', total: todayRows.length, due: todayRows.length },
      { key: '1-day', label: '1 Day', total: activeRows.filter((row) => stageKeyFromRevision(row) === '1-day').length, due: activeRows.filter((row) => stageKeyFromRevision(row) === '1-day' && (statusFor(row) === 'DUE' || statusFor(row) === 'OVERDUE')).length },
      { key: '7-day', label: '7 Days', total: activeRows.filter((row) => stageKeyFromRevision(row) === '7-day').length, due: activeRows.filter((row) => stageKeyFromRevision(row) === '7-day' && (statusFor(row) === 'DUE' || statusFor(row) === 'OVERDUE')).length },
      { key: '21-day', label: '21 Days', total: activeRows.filter((row) => stageKeyFromRevision(row) === '21-day').length, due: activeRows.filter((row) => stageKeyFromRevision(row) === '21-day' && (statusFor(row) === 'DUE' || statusFor(row) === 'OVERDUE')).length },
    ];
    return items.map((item) => ({ ...item, pct: item.total > 0 ? Math.min(100, Math.round((item.due / item.total) * 100)) : 0 }));
  }, [activeRows, todayRows]);

  const customVisibleValue = resolveCustomValue(customIntervals, customSelection);

  useEffect(() => {
    if (customSelection !== null && customIntervals.includes(customSelection)) return;
    setCustomSelection(customIntervals[0] ?? null);
  }, [customIntervals, customSelection]);

  const visibleRows = useMemo(() => {
    if (selectedStage === 'overdue') return overdueRows;
    if (selectedStage === 'today') return todayRows;
    if (selectedStage === 'custom') {
      if (customVisibleValue === null) return [];
      return activeRows.filter((row) => matchCustomStage(row, customVisibleValue));
    }
    return activeRows.filter((row) => stageKeyFromRevision(row) === selectedStage);
  }, [selectedStage, overdueRows, todayRows, activeRows, customVisibleValue]);

  const groupedRows = useMemo(() => {
    const groups: Record<SectionKey, Revision[]> = { OVERDUE: [], DUE: [], UPCOMING: [] };
    for (const row of [...visibleRows].sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime())) {
      const status = statusFor(row);
      if (status === 'OVERDUE') groups.OVERDUE.push(row);
      else if (status === 'DUE') groups.DUE.push(row);
      else if (status === 'UPCOMING') groups.UPCOMING.push(row);
    }
    return groups;
  }, [visibleRows]);

  const addCustomInterval = async () => {
    const parsed = Number(customInput);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 3650) {
      setError('Custom revision intervals must be a positive number under 3650 days.');
      return;
    }
    const rounded = Math.floor(parsed);
    if (customIntervals.includes(rounded)) {
      setError('This custom revision interval already exists.');
      return;
    }
    const next = [...new Set([...customIntervals, rounded])].sort((a, b) => a - b);
    setCustomIntervals(next);
    setCustomSelection(rounded);
    setSelectedStage('custom');
    setCustomModalOpen(false);
    setCustomInput('30');
    setError('');
    await api.updateRevisionSettings([...DEFAULT_STAGES, ...next]);
  };

  const removeCustomInterval = async (interval: number) => {
    const activeCustom = activeRows.some((row) => matchCustomStage(row, interval));
    if (activeCustom) {
      setError('This custom interval still has active revisions.');
      return;
    }
    const next = customIntervals.filter((value) => value !== interval);
    setCustomIntervals(next);
    setCustomSelection(next[0] ?? null);
    if (next.length === 0) setSelectedStage('today');
    else setSelectedStage('custom');
    await api.updateRevisionSettings([...DEFAULT_STAGES, ...next]);
  };

  const submitReview = async (result: ReviewChoice) => {
    if (!reviewTarget) return;
    try {
      await api.completeRevision(reviewTarget._id, result);
      setReviewNotice(result === 'Solved' ? 'Question review completed.' : 'Question is now in Overdue.');
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
  const addQuestion = async () => { if(!problemOptions.length){const response=await api.problems();setProblemOptions(response.items);}setSelectedProblems(new Set());setPickerSearch('');setPickerOpen(true); };
  const addSelected=async()=>{const days=selectedStage==='today'?0:selectedStage==='1-day'?1:selectedStage==='7-day'?7:selectedStage==='21-day'?21:customVisibleValue;if(days===null||days===undefined||selectedProblems.size===0)return;setAddBusy(true);try{for(const id of selectedProblems)await api.addRevision(id,days);setPickerOpen(false);await load();}catch(e){setError(e instanceof Error?e.message:'Unable to add revisions.');}finally{setAddBusy(false);}};

  return (
    <main className="shell page-shell revision-page">
      <div className="page-intro">
        <span className="eyebrow">RETENTION</span>
        <h1>Revision</h1>
        <p className="muted">Review your solved problems at the right time.</p>
      </div>

      <section className="revision-summary">
        <div className="revision-metric"><span>Due today</span><strong>{counts.dueToday}</strong></div>
        <div className="revision-metric"><span>Overdue</span><strong>{counts.overdue}</strong></div>
        <div className="revision-metric"><span>Upcoming</span><strong>{counts.upcoming}</strong></div>
        <div className="revision-metric"><span>Today</span><strong>{counts.todayTotal}</strong></div>
      </section>

      <div className="revision-progress-block">
        {stageProgress.map((item) => (
          <div className="revision-progress-item" key={item.key}>
            <div className="progress-label-row">
              <span>{item.label}</span>
              <strong>{item.due} / {item.total}</strong>
            </div>
            <div className="progress-bar"><i style={{ width: `${item.pct}%` }} /></div>
          </div>
        ))}
      </div>

      <section className="panel revision-panel">
        {reviewNotice && <p className="state">{reviewNotice}</p>}
        <div className="group-label-row"><strong>{selectedStage==='overdue'?'Overdue':selectedStage==='today'?'Today':selectedStage==='custom'&&customVisibleValue?`${customVisibleValue} Days`:stageDisplay(selectedStage)}</strong>{selectedStage !== 'overdue' && <button type="button" className="outline-button small" disabled={addBusy} onClick={()=>void addQuestion()}>+ Add Question</button>}</div>
        <div className="revision-tabs" role="tablist" aria-label="Revision stages">
          {[{ key: 'overdue', label: 'Overdue' }, ...DEFAULT_STAGE_TABS, { key: 'custom', label: 'Custom' }].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-button ${selectedStage === tab.key ? 'active' : ''}`}
              onClick={() => {
                if (tab.key === 'custom') {
                  setSelectedStage('custom');
                  if (customIntervals.length > 0 && customSelection === null) setCustomSelection(customIntervals[0]);
                  return;
                }
                setSelectedStage(tab.key as StageKey);
              }}
            >
              {tab.label}
              <span className="tab-count">{tab.key === 'custom' ? customIntervals.length : stageCounts[tab.key as keyof typeof stageCounts] ?? 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="state">Loading revisions...</div>
        ) : error ? (
          <div className="state error">{error}<button className="outline-button small" onClick={() => void load()}>Retry</button></div>
        ) : selectedStage === 'custom' ? (
          <div className="custom-stage-wrapper">
            {customIntervals.length === 0 ? (
              <div className="empty-state-box">
                <h3>No custom revision intervals yet.</h3>
                <p>Create intervals for longer retention cycles.</p>
                <button className="primary-button" onClick={() => setCustomModalOpen(true)}>+ Add interval</button>
              </div>
            ) : (
              <>
                <div className="custom-header-row">
                  {customIntervals.map((interval) => (
                    <button key={interval} type="button" className={`custom-chip ${customVisibleValue === interval ? 'active' : ''}`} onClick={() => { setCustomSelection(interval); setSelectedStage('custom'); }}>
                      {interval} Days
                    </button>
                  ))}
                  <button className="outline-button small" onClick={() => setCustomModalOpen(true)}>+ Add</button>
                </div>
                <div className="custom-list-toolbar">
                  <span>{customVisibleValue ?? 0} day queue</span>
                  {customVisibleValue !== null && (
                    <button className="text-button" onClick={() => void removeCustomInterval(customVisibleValue)}>Remove</button>
                  )}
                </div>
                {visibleRows.length === 0 ? (
                  <div className="empty-state-box compact"><h3>No upcoming revisions in this stage.</h3></div>
                ) : (
                  <RevisionGroups rows={groupedRows} onReview={(item) => setReviewTarget(item)} onDelete={deleteRevision} />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="stage-content">
            {visibleRows.length === 0 ? (
              <div className="empty-state-box">
                <h3>✓ You're all caught up</h3>
                <p>There are no active revisions in this stage.</p>
              </div>
            ) : (
              <RevisionGroups rows={groupedRows} onReview={(item) => setReviewTarget(item)} onDelete={deleteRevision} />
            )}
          </div>
        )}
      </section>

      {customModalOpen && (
        <div className="modal-backdrop" onClick={() => setCustomModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add revision interval</h3>
              <button type="button" className="text-button" onClick={() => setCustomModalOpen(false)}>Close</button>
            </div>
            <label className="modal-field">
              <span>Days</span>
              <input type="number" min="1" max="3650" value={customInput} onChange={(event) => setCustomInput(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="outline-button" onClick={() => setCustomModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => void addCustomInterval()}>Add</button>
            </div>
          </div>
        </div>
      )}
      {pickerOpen && <div className="modal-backdrop" onClick={()=>setPickerOpen(false)}><div className="modal-card" onClick={e=>e.stopPropagation()}><div className="modal-header"><h3>Select Problems</h3><button className="text-button" onClick={()=>setPickerOpen(false)}>Close</button></div><input placeholder="Search problem name or number..." value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)}/><div style={{maxHeight:360,overflowY:'auto'}}>{problemOptions.filter(p=>{const q=pickerSearch.toLowerCase();return p.problemId.title.toLowerCase().includes(q)||String(p.problemId.leetcodeId||p.problemId.externalId||'').includes(q)}).map(p=><div className="revision-row" key={p.problemId._id}><span>{p.problemId.title} · {p.platform||'LeetCode'} · {p.problemId.difficulty}</span><button onClick={()=>setSelectedProblems(s=>{const n=new Set(s);n.has(p.problemId._id)?n.delete(p.problemId._id):n.add(p.problemId._id);return n})}>{selectedProblems.has(p.problemId._id)?'Added ✓':'Add'}</button></div>)}</div><div className="modal-actions"><span>Selected: {selectedProblems.size}</span><button className="outline-button" onClick={()=>setPickerOpen(false)}>Cancel</button><button className="primary-button" disabled={!selectedProblems.size||addBusy} onClick={()=>void addSelected()}>Add Selected</button></div></div></div>}

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

function RevisionGroups({ rows, onReview, onDelete }: { rows: Record<SectionKey, Revision[]>; onReview: (item: Revision) => void; onDelete: (id: string) => Promise<void> }) {
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'OVERDUE', label: 'Overdue' },
    { key: 'DUE', label: 'Due today' },
    { key: 'UPCOMING', label: 'Upcoming' },
  ];

  return (
    <div className="revision-group-stack">
      {sections.filter((section) => rows[section.key].length > 0).map((section) => (
        <div className="revision-group" key={section.key}>
          <div className="group-label-row">
            <span>{section.label}</span>
            <strong>{rows[section.key].length}</strong>
          </div>
          <div className="revision-row-list">
            {rows[section.key].map((item) => {
              const status = statusFor(item);
              const overdueDays = status === 'OVERDUE' && item.scheduledAt ? Math.max(0, Math.ceil((Date.now() - new Date(item.scheduledAt).getTime()) / 86400000)) : 0;
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
                        <span>Due: {formatDate(item.scheduledAt)}</span>
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
                    <button type="button" onClick={() => onReview(item)}>Review</button>
                    <button type="button" className="outline-button small" onClick={() => void onDelete(item._id)}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
