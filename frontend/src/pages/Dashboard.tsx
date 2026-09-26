import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, getCached } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMagnetic } from '../hooks/useMagnetic';
import RecentProblems from '../components/RecentProblems';
import type { AnalyticsBucket, DashboardAnalytics } from '../types';

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const analyticsPath = `/dashboard/analytics?timezone=${encodeURIComponent(localTimezone)}`;
const readableDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const bucketCount = (buckets: AnalyticsBucket[], name: string) => buckets.find(bucket => bucket.name.toLowerCase() === name)?.count ?? 0;

// Monotone cubic (Fritsch-Carlson) interpolation - the same curve family
// D3 calls curveMonotoneX. Flows exactly through every real data point
// (no fabricated values) while avoiding the overshoot a naive Catmull-Rom
// spline can introduce between uneven data points.
function smoothPath(coords: { x: number; y: number }[]) {
  const n = coords.length;
  if (n === 0) return '';
  if (n === 1) return `M${coords[0].x},${coords[0].y}`;
  const xs = coords.map(c => c.x), ys = coords.map(c => c.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
  const m = new Array(n);
  m[0] = d[0];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    const cp1x = xs[i] + dx, cp1y = ys[i] + m[i] * dx;
    const cp2x = xs[i + 1] - dx, cp2y = ys[i + 1] - m[i + 1] * dx;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return path;
}

const computeRevisionsDue = (response: unknown) => {
  const rows = (Array.isArray(response) ? response : (Array.isArray((response as { revisions?: unknown[] })?.revisions) ? (response as { revisions: unknown[] }).revisions : [])) as Array<{ completedAt?: string | null; scheduledAt?: string; nextReviewAt?: string | null }>;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let dueToday = 0, overdue = 0;
  for (const row of rows) {
    if (row.completedAt) continue;
    const dueAtRaw = row.nextReviewAt || row.scheduledAt;
    if (!dueAtRaw) continue;
    const due = new Date(dueAtRaw); due.setHours(0, 0, 0, 0);
    if (due.getTime() === today.getTime()) dueToday += 1;
    else if (due.getTime() < today.getTime()) overdue += 1;
  }
  return { dueToday, overdue };
};

export default function Dashboard() {
  const { user } = useAuth();
  // Seed from the last response the API client cached (survives switching
  // pages and back) so the dashboard renders real numbers immediately
  // instead of flashing zeroed defaults while it refetches in the background.
  const cachedAnalytics = getCached<DashboardAnalytics>(analyticsPath);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(cachedAnalytics ?? null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [trendRange, setTrendRange] = useState('30d');
  const [selectedActivity, setSelectedActivity] = useState('');
  const [goals, setGoals] = useState(cachedAnalytics?.goals ?? { daily: 1, weekly: 5, monthly: 20 });
  const [goalMessage, setGoalMessage] = useState('');
  const [revisionsDue, setRevisionsDue] = useState(() => computeRevisionsDue(getCached('/revisions')));

  const loadAnalytics = () => { setAnalyticsError(''); api.analytics(localTimezone).then(response => { setAnalytics(response); setGoals(response.goals); }).catch(e => setAnalyticsError(e.message || 'Unable to load analytics.')); };
  const loadRevisionsDue = () => { api.revisions().then(response => setRevisionsDue(computeRevisionsDue(response))).catch(() => undefined); };
  useEffect(loadAnalytics, []); useEffect(loadRevisionsDue, []);

  async function saveGoals(event: FormEvent) { event.preventDefault(); try { const response = await api.updateGoals(goals); setGoals(response.goals); setGoalMessage('Goals saved.'); window.setTimeout(() => setGoalMessage(''), 2500); } catch (goalError) { setGoalMessage(goalError instanceof Error ? goalError.message : 'Unable to save goals.'); } }

  const name = user?.name?.trim();
  const easy = analytics ? bucketCount(analytics.difficulty, 'easy') : 0;
  const medium = analytics ? bucketCount(analytics.difficulty, 'medium') : 0;
  const hard = analytics ? bucketCount(analytics.difficulty, 'hard') : 0;
  const total = analytics?.summary.total ?? 0;

  return (
    <main className="shell page-shell">
      <div className="hero-block">
        <span className="eyebrow">DSA TRACKER</span>
        <h1>{name ? `Welcome back, ${name}` : 'Welcome back'}</h1>
        <div className="hero-row">
          <div className="streak-block">
            <div>
              <span className="label">Current streak</span>
              <div className="streak-number"><strong className="num">{analytics?.streak.current ?? 0}</strong><span>days</span></div>
            </div>
            {analytics && <Sparkline points={analytics.activity} />}
          </div>
          <div className="hero-actions">
            <Link to="/revisions"><button type="button">Review queue</button></Link>
            <Link to="/problems"><button type="button">View all problems</button></Link>
          </div>
        </div>
      </div>

      {analytics ? (
        <>
          <section className="bento">
            <Tile wide label="Total solved" value={total}>
              <div className="stack-bar">
                <i style={{ width: `${total ? (easy / total) * 100 : 0}%`, background: 'var(--easy)' }} />
                <i style={{ width: `${total ? (medium / total) * 100 : 0}%`, background: 'var(--medium)' }} />
                <i style={{ width: `${total ? (hard / total) * 100 : 0}%`, background: 'var(--hard)' }} />
              </div>
              <div className="stack-legend">
                <span><i style={{ background: 'var(--easy)' }} />{easy} Easy</span>
                <span><i style={{ background: 'var(--medium)' }} />{medium} Med</span>
                <span><i style={{ background: 'var(--hard)' }} />{hard} Hard</span>
              </div>
            </Tile>
            <Tile label="Today" value={analytics.summary.today} />
            <Tile label="This week" value={analytics.summary.thisWeek} />
            <Tile label="This month" value={analytics.summary.thisMonth} />
            <Tile label="Longest streak" value={analytics.streak.longest} note="days" />
            <Tile label="Revisions due" value={revisionsDue.dueToday + revisionsDue.overdue} link="/revisions" note={revisionsDue.overdue > 0 ? `${revisionsDue.overdue} overdue` : undefined} noteTone="warn" />
          </section>

          <Heatmap data={analytics.activity} selected={selectedActivity} onSelect={setSelectedActivity} />

          <div className="analytics-grid">
            <Breakdown title="Difficulty" data={analytics.difficulty} />
            <Breakdown title="Languages" data={analytics.languages} />
            <Breakdown title="Topics" data={analytics.topics} />
          </div>

          <section className="analytics-panel">
            <div className="section-heading"><h2>Progress trends</h2><select value={trendRange} onChange={e => setTrendRange(e.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="6m">Last 6 months</option><option value="all">All time</option></select></div>
            <TrendChart points={analytics.trends[trendRange] || []} />
          </section>

          <Goals analytics={analytics} goals={goals} setGoals={setGoals} saveGoals={saveGoals} message={goalMessage} />

          <div className="dashboard-split">
            <RecentProblems />
            <Achievements achievements={analytics.achievements} />
          </div>
        </>
      ) : analyticsError ? <p className="state error">{analyticsError}</p> : <p className="state">Loading analytics…</p>}
    </main>
  );
}

function Tile({ label, value, note, noteTone, link, wide, children }: { label: string; value: number; note?: string; noteTone?: 'warn' | 'good'; link?: string; wide?: boolean; children?: React.ReactNode }) {
  const { ref, onMouseMove, onMouseLeave } = useMagnetic<HTMLDivElement>();
  const content = <div ref={ref} className={`tile ${wide ? 'tile-wide' : ''}`} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
    <p className="tile-label">{label}</p>
    <div className="tile-value num">{value}</div>
    {note && <span className={`tile-note ${noteTone || ''}`}>{note}</span>}
    {children}
  </div>;
  return link ? <Link className="tile-link" to={link}>{content}</Link> : content;
}

function Sparkline({ points }: { points: { date: string; count: number }[] }) {
  const recent = points.slice(-14);
  if (recent.length < 2) return null;
  const max = Math.max(...recent.map(point => point.count), 1);
  const step = 160 / (recent.length - 1);
  const coords = recent.map((point, index) => ({ x: index * step, y: 36 - (point.count / max) * 32 }));
  const path = smoothPath(coords);
  return (
    <svg className="spark" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true">
      <path className="spark-line" d={path} fill="none" stroke="var(--accent-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" key={path} />
    </svg>
  );
}

function Heatmap({ data, selected, onSelect }: { data: { date: string; count: number }[]; selected: string; onSelect: (date: string) => void }) { const [hovered, setHovered] = useState<{ date: string; count: number } | null>(null); const active = hovered || data.find(point => point.date === selected); return <section className="analytics-panel"><div className="section-heading"><h2>Activity</h2>{active && <span className="activity-tooltip" role="status">{readableDate(active.date)}<strong>{active.count} {active.count === 1 ? 'problem' : 'problems'} solved</strong></span>}</div><div className="heatmap-heading"><span>Daily activity · Last 12 months</span><span className="heatmap-legend"><span>Less</span><i className="heat-cell heat-0" /><i className="heat-cell heat-1" /><i className="heat-cell heat-2" /><i className="heat-cell heat-3" /><i className="heat-cell heat-4" /><span>More</span></span></div><div className="heatmap">{data.map(point => <button key={point.date} className={`heat-cell heat-${Math.min(point.count, 4)} ${selected === point.date ? 'selected' : ''}`} title={`${readableDate(point.date)}: ${point.count} ${point.count === 1 ? 'problem' : 'problems'} solved`} aria-label={`${readableDate(point.date)}: ${point.count} ${point.count === 1 ? 'problem' : 'problems'} solved`} onMouseEnter={() => setHovered(point)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(point)} onBlur={() => setHovered(null)} onClick={() => onSelect(point.date)} />)}</div></section>; }
function Breakdown({ title, data }: { title: string; data: AnalyticsBucket[] }) { const max = Math.max(...data.map(item => item.count), 0); return <section className="analytics-panel breakdown"><h2>{title}</h2>{data.length === 0 ? <p className="muted">Start solving to build your history.</p> : [...data].sort((a, b) => b.count - a.count).map(item => <div className="breakdown-row" key={item.name}><div><span>{item.name}</span><strong>{item.count}{item.percentage !== undefined ? ` (${item.percentage}%)` : ''}</strong></div><div className="bar"><i style={{ width: `${max ? item.count / max * 100 : 0}%` }} /></div></div>)}</section>; }
function TrendChart({ points }: { points: { date: string; count: number }[] }) {
  if (points.length === 0) return <p className="state">Start solving to build your trend.</p>;
  const max = Math.max(...points.map(point => point.count), 1);
  const labels = points.length > 2 ? [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]] : points;
  const width = 600, height = 190, padTop = 16, padBottom = 10;
  const usable = height - padTop - padBottom;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({ x: index * stepX, y: padTop + usable - (point.count / max) * usable, point }));
  const linePath = smoothPath(coords);
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L${last.x.toFixed(1)},${height - padBottom} L0,${height - padBottom} Z`;
  return (
    <>
      <div className="trend-chart">
        <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" key={linePath}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-bg)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent-bg)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="trend-grid">
            <line x1="0" y1={padTop} x2={width} y2={padTop} />
            <line x1="0" y1={padTop + usable / 2} x2={width} y2={padTop + usable / 2} />
            <line x1="0" y1={height - padBottom} x2={width} y2={height - padBottom} />
          </g>
          <path className="trend-area" d={areaPath} />
          <path className="trend-line" d={linePath} />
        </svg>
        <div className="trend-dots">
          {coords.map((c, index) => (
            <button
              key={c.point.date}
              type="button"
              className={`trend-dot ${index === coords.length - 1 ? 'latest' : ''}`}
              style={{ left: `${(c.x / width) * 100}%`, top: `${(c.y / height) * 100}%` }}
              title={`${readableDate(c.point.date)}: ${c.point.count} ${c.point.count === 1 ? 'problem' : 'problems'} solved`}
              aria-label={`${readableDate(c.point.date)}: ${c.point.count} ${c.point.count === 1 ? 'problem' : 'problems'} solved`}
            />
          ))}
        </div>
      </div>
      <div className="trend-labels">{labels.map(point => <span key={point.date}>{readableDate(point.date)}<strong>{point.count} solved</strong></span>)}</div>
    </>
  );
}
function GoalRing({ value, target }: { value: number; target: number }) {
  const radius = 22, circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const complete = target > 0 && value >= target;
  return (
    <svg className="goal-ring" width="54" height="54" viewBox="0 0 54 54">
      <circle className="ring-track" cx="27" cy="27" r={radius} />
      <circle
        className={`ring-fill ${complete ? 'complete' : ''}`}
        cx="27" cy="27" r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
      />
      <text className="goal-ring-value" x="27" y="27" textAnchor="middle" dominantBaseline="central">{Math.round(pct * 100)}%</text>
    </svg>
  );
}
function Goals({ analytics, goals, setGoals, saveGoals, message }: { analytics: DashboardAnalytics; goals: DashboardAnalytics['goals']; setGoals: (goals: DashboardAnalytics['goals']) => void; saveGoals: (event: FormEvent) => void; message: string }) { const entries: [keyof DashboardAnalytics['goals'], string, number][] = [['daily', 'Today', analytics.summary.today], ['weekly', 'This week', analytics.summary.thisWeek], ['monthly', 'This month', analytics.summary.thisMonth]]; return <section className="analytics-panel goals"><div className="section-heading"><h2>Goals</h2>{message && <span className="muted">{message}</span>}</div><form onSubmit={saveGoals}><div className="goal-grid">{entries.map(([key, label, value]) => { const target = goals[key]; const complete = value >= target && target > 0; const remaining = Math.max(0, target - value); return <label key={key}><div className="goal-ring-row"><GoalRing value={value} target={target} /><div className="goal-fields"><span>{label}</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={target} onChange={event => setGoals({ ...goals, [key]: Number(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')) })} /><span>{value} / {target} problems</span></div></div><small className={`goal-status ${complete ? 'complete' : ''}`}>{complete ? 'Goal completed!' : `${remaining} more ${remaining === 1 ? 'problem' : 'problems'} to reach your goal`}</small></label>; })}</div><button>Save goals</button></form></section>; }

function AchievementIcon({ id }: { id: string }) {
  if (id.includes('streak')) return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 4 3 4 6a6 6 0 01-12 0c0-5 3-6 6-12z" /></svg>;
  if (id.includes('hard')) return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" /><path d="M7 5H4a3 3 0 003 3M17 5h3a3 3 0 01-3 3" /></svg>;
}
function Achievements({ achievements }: { achievements: DashboardAnalytics['achievements'] }) {
  const unlockedCount = achievements.filter(item => item.unlocked).length;
  return (
    <section className="analytics-panel achievements">
      <div className="achievements-head"><h2>Achievements</h2><span className="achievements-count">{unlockedCount}/{achievements.length} unlocked</span></div>
      <div className="achievement-grid">
        {achievements.map(item => (
          <div className={item.unlocked ? 'achievement unlocked' : 'achievement'} key={item.id}>
            <span className="badge-icon"><AchievementIcon id={item.id} /></span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
