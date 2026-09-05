export {};
const app = document.getElementById('app')!;
const API = 'https://leetmvp.onrender.com/api';
const WEB_APP = 'https://leetmvp-1.onrender.com';
type User = { id: string; email: string };

async function openOrFocusTab(url: string) {
  const [existing] = await chrome.tabs.query({ url: `${WEB_APP}/*` });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}
function openOnce(button: HTMLElement | null, url: string) {
  button?.addEventListener('click', () => { if (button.hasAttribute('disabled')) return; button.setAttribute('disabled', 'true'); openOrFocusTab(url).finally(() => button.removeAttribute('disabled')); });
}
function render(user: User | null, status = '') {
  app.innerHTML = user ? `<div class="status">Connected ✓</div><p class="muted">${user.email}</p><p class="muted">Accepted submissions sync automatically.</p><button id="dashboard">Open Dashboard</button><button class="secondary" id="logout">Disconnect</button>` : `<h3>Connect LeetCode Account</h3><p class="muted">Sign in through the LeetMVP web app to enable automatic syncing.</p><button id="connect">Connect LeetCode</button><button class="secondary" id="open">Open Dashboard</button>${status ? `<p class="error">${status}</p>` : ''}`;
  openOnce(document.getElementById('dashboard'), `${WEB_APP}/dashboard`);
  openOnce(document.getElementById('open'), `${WEB_APP}/login`);
  document.getElementById('connect')?.addEventListener('click', connect);
  document.getElementById('logout')?.addEventListener('click', disconnect);
}

async function getUser() {
  let { accessToken, refreshToken } = await chrome.storage.local.get(['accessToken', 'refreshToken']);
  if (!accessToken && !refreshToken) return null;
  let response = accessToken ? await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } }) : null;
  if (response?.status === 401 && refreshToken) {
    const refreshed = await fetch(`${API}/auth/extension/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, clientId: chrome.runtime.id }) });
    if (refreshed.ok) { const body = await refreshed.json(); accessToken = body.data.accessToken; await chrome.storage.local.set({ accessToken, user: body.data.user }); response = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } }); }
  }
  if (!response) return null;
  if (!response.ok) return null;
  return (await response.json()).data.user as User;
}

async function connect() {
  render(null, 'Opening secure sign-in...');
  try {
    const redirectUri = chrome.identity.getRedirectURL('extension-auth');
    const state = crypto.randomUUID();
    const authUrl = new URL(`${WEB_APP}/login`);
    authUrl.searchParams.set('extension_client_id', chrome.runtime.id);
    authUrl.searchParams.set('extension_redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    const callback = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
    if (!callback) throw new Error('Authentication was cancelled');
    const result = new URL(callback);
    if (result.searchParams.get('state') !== state) throw new Error('Invalid authentication response');
    const response = await fetch(`${API}/auth/extension/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: result.searchParams.get('code'), clientId: chrome.runtime.id, redirectUri }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'Authentication failed');
    await chrome.storage.local.set({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken, user: body.data.user });
    render(body.data.user);
  } catch (error) { render(null, error instanceof Error ? error.message : 'Authentication failed'); }
}

async function disconnect() {
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (refreshToken) await fetch(`${API}/auth/extension/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, clientId: chrome.runtime.id }) }).catch(() => undefined);
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
  render(null, 'Account disconnected.');
}

getUser().then(user => render(user)).catch(() => render(null, 'Backend unavailable.'));
