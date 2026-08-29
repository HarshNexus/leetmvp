import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { SolvedProblem } from '../types';

const platform = (value?: string) => value === 'leetcode' || !value ? 'LeetCode' : value;
export default function RecentProblems() { const [items, setItems] = useState<SolvedProblem[]>([]); useEffect(() => { api.problems().then(response => setItems(response.items.slice(0, 5))).catch(() => undefined); }, []); return <section className="recent-panel"><div className="section-heading"><h2>Recent problems</h2><Link to="/problems">View all problems →</Link></div>{items.length === 0 ? <p className="muted">No solved problems yet.</p> : <div className="recent-list">{items.map(item => <a className="recent-item" href={item.problemId.url} target="_blank" rel="noreferrer" key={item._id}><strong>{item.problemId.title}</strong><span>{platform(item.platform)} · {item.problemId.difficulty} · {item.language || 'Unknown'}</span><time>{new Date(item.solvedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></a>)}</div>}</section>; }
