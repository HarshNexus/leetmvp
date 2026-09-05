console.log('[DSA Tracker] Content script loaded');
console.log('[DSA Tracker] Extension context:',typeof chrome!=='undefined'&&!!chrome.runtime,typeof chrome!=='undefined'&&typeof chrome.runtime?.sendMessage==='function');
import { observeAccepted } from './detector';
import { gfgAdapter, observeGfgAccepted } from './adapters';
function sendAccepted(payload:Record<string,unknown>){
  const message={type:'ACCEPTED_SUBMISSION',payload};
  console.log('[DSA Tracker] Sending accepted problem to background...'); console.log('[DSA Tracker] Content sending solved payload:',message.payload);
  if(typeof chrome==='undefined'||!chrome.runtime||typeof chrome.runtime.sendMessage!=='function'){
    console.error('[DSA Tracker] Background messaging unavailable: chrome.runtime.sendMessage is not available');
    return;
  }
  try {
    chrome.runtime.sendMessage(message)
      .then(response=>console.log('[DSA Tracker] Background response received:',response))
      .catch(error=>console.error('[DSA Tracker] Background messaging failed:',error?.message||error));
  } catch (error) {
    console.error('[DSA Tracker] Background messaging failed (extension was reloaded; refresh this page):',error instanceof Error?error.message:error);
  }
}
if (gfgAdapter.canHandlePage()) {
  console.log('[DSA Tracker] GFG detector initialized');
  observeGfgAccepted(payload=>sendAccepted(payload));
} else if (/leetcode\.com$/i.test(location.hostname)) {
  console.log('[DSA Tracker] LeetCode detector initialized');
  observeAccepted(payload=>sendAccepted({...payload,url:location.href}));
}
