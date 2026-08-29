import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();
  const [goals, setGoals] = useState({ daily: 1, weekly: 5, monthly: 20 });
  const [message, setMessage] = useState('');
  useEffect(() => { api.analytics(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC').then(data => setGoals(data.goals)).catch(() => undefined); }, []);
  async function save(event: FormEvent) { event.preventDefault(); try { const result = await api.updateGoals(goals); setGoals(result.goals); setMessage('Goals saved.'); } catch { setMessage('Unable to save goals.'); } }
  return <main className="settings-page"><div className="page-intro"><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p className="muted">Manage your account and dashboard experience.</p></div><section className="settings-grid"><div className="settings-card"><h2>Account</h2><p className="muted">Name</p><strong>{user?.name?.trim() || 'Name not provided'}</strong><p className="muted">Email</p><strong>{user?.email}</strong><button className="outline-button" onClick={() => signOut().then(() => nav('/login'))}>Logout</button></div><div className="settings-card"><h2>Appearance</h2><p className="muted">Choose how DSA Tracker looks.</p><button className="outline-button" onClick={toggle}>{dark ? 'Switch to light mode' : 'Switch to dark mode'}</button></div><div className="settings-card"><h2>Goals</h2><form className="settings-goals" onSubmit={save}>{(['daily', 'weekly', 'monthly'] as const).map(key => <label key={key}>{key[0].toUpperCase()+key.slice(1)} problem goal<input type="number" min="0" value={goals[key]} onChange={event => setGoals({ ...goals, [key]: Number(event.target.value) })}/></label>)}<button>Save goals</button>{message && <span className="muted">{message}</span>}</form></div><div className="settings-card"><h2>Connected platforms</h2><p className="platform-connected">LeetCode <span>Connected</span></p><p className="platform-coming">GeeksforGeeks <span>Coming soon</span></p><p className="platform-coming">CodeChef <span>Coming soon</span></p><p className="platform-coming">Codeforces <span>Coming soon</span></p><p className="platform-coming">Coding Ninjas <span>Coming soon</span></p></div></section></main>;
}
