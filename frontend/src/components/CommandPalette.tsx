import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

type Item = { label: string; tag: string; run: () => void };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toggle } = useTheme();

  const items = useMemo<Item[]>(() => [
    { label: 'Dashboard', tag: 'page', run: () => navigate('/dashboard') },
    { label: 'Problems', tag: 'page', run: () => navigate('/problems') },
    { label: 'Revisions', tag: 'page', run: () => navigate('/revisions') },
    { label: 'Settings', tag: 'page', run: () => navigate('/settings') },
    { label: 'Toggle theme', tag: 'action', run: () => toggle() },
    { label: 'Log out', tag: 'action', run: () => { void signOut().then(() => navigate('/login')); } },
  ], [navigate, toggle, signOut]);

  const filtered = useMemo(
    () => items.filter(item => item.label.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const close = () => setOpen(false);
  const openPalette = () => { setQuery(''); setActive(0); setOpen(true); };

  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 10); }, [open]);
  useEffect(() => { setActive(current => Math.min(current, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!open && event.key === '/' && !typing) { event.preventDefault(); openPalette(); return; }
      if (!open) return;
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => Math.min(current + 1, filtered.length - 1)); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); return; }
      if (event.key === 'Enter') { event.preventDefault(); const item = filtered[active]; if (item) { item.run(); close(); } }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, active]);

  return (
    <>
      <button type="button" className="cmdk-trigger" aria-haspopup="dialog" onClick={openPalette}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <span>Jump to…</span>
        <kbd>/</kbd>
      </button>
      <div className={`cmdk-overlay ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
        <div className="cmdk-panel">
          <input ref={inputRef} value={query} placeholder="Jump to a page or run a command…" autoComplete="off" onChange={event => { setQuery(event.target.value); setActive(0); }} />
          <div className="cmdk-list">
            {filtered.length === 0
              ? <div className="cmdk-empty">No matches</div>
              : filtered.map((item, index) => (
                <div key={item.label} className={`cmdk-item ${index === active ? 'active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => { item.run(); close(); }}>
                  <span>{item.label}</span>
                  <span className="tag">{item.tag}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
