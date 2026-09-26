import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return <main className="settings-page"><div className="page-intro"><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p className="muted">Manage your account and dashboard experience.</p></div><section className="settings-grid"><div className="settings-card"><h2>Account</h2><p className="muted">Name</p><strong>{user?.name?.trim() || 'Name not provided'}</strong><p className="muted">Email</p><strong>{user?.email}</strong><button className="outline-button" onClick={() => signOut().then(() => nav('/login'))}>Logout</button></div></section></main>;
}
