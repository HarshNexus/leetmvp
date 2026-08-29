export {};
type Pending = { payload: Record<string, unknown>; attempts: number };
const API = 'http://localhost:5000/api';

async function refresh() {
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (!refreshToken) return false;
  const response = await fetch(`${API}/auth/extension/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, clientId: chrome.runtime.id }) });
  if (!response.ok) { await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']); return false; }
  const body = await response.json();
  await chrome.storage.local.set({ accessToken: body.data.accessToken, user: body.data.user });
  return true;
}

async function sync(item: Pending) {
  let { accessToken } = await chrome.storage.local.get('accessToken');
  if (!accessToken) throw new Error('Not connected');
  const url=`${API}/problems/solved`; console.log('[DSA Tracker] Background sending solved problem to backend'); console.log('[DSA Tracker] Backend URL:',url); let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(item.payload) });
  if (response.status === 401 && await refresh()) {
    ({ accessToken } = await chrome.storage.local.get('accessToken'));
    response = await fetch(`${API}/problems/solved`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(item.payload) });
  }
  const body=await response.clone().json().catch(()=>({})); console.log('[DSA Tracker] Backend response status:',response.status); console.log('[DSA Tracker] Backend response body:',body); if (!response.ok) throw new Error(body?.error?.message||'Unable to sync problem');
}

async function flush() { const { pending = [] } = await chrome.storage.local.get({ pending: [] }); const left: Pending[] = []; for (const item of pending as Pending[]) { try { await sync(item); } catch (error) { console.error('[DSA Tracker] Backend ingestion failed:',error instanceof Error?error.message:error); if (item.attempts < 5) left.push({ ...item, attempts: item.attempts + 1 }); } } await chrome.storage.local.set({ pending: left }); return left.length===0; }
chrome.runtime.onInstalled.addListener(flush);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { if (message.type !== 'ACCEPTED_SUBMISSION') return; console.log('[DSA Tracker] Background received solved payload:',message.payload); chrome.storage.local.get({ pending: [] }).then(async ({ pending }) => { await chrome.storage.local.set({ pending: [...(pending as Pending[]), { payload: {...message.payload,platform:message.payload.platform||'LeetCode'}, attempts: 0 }] }); const synced=await flush(); sendResponse({ success: synced, message: synced?'Accepted problem synchronized':'Accepted problem queued for retry', error:synced?undefined:'Backend ingestion failed; retry pending' }); }).catch(error => sendResponse({ success: false, error: error?.message || 'Unable to queue accepted problem' })); return true; });
