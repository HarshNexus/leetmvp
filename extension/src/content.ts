console.log('[DSA Tracker] Content script loaded');
console.log('[DSA Tracker] Extension context:',typeof chrome!=='undefined'&&!!chrome.runtime,typeof chrome!=='undefined'&&typeof chrome.runtime?.sendMessage==='function');
import { observeAccepted } from './detector';
import { gfgAdapter } from './adapters';
console.log('[DSA Tracker] LeetCode detector initialized');
if (gfgAdapter.canHandlePage()) { if (gfgAdapter.getSubmissionStatus()) { const payload=gfgAdapter.getProblem(); if (payload) chrome.runtime.sendMessage({type:'ACCEPTED_SUBMISSION',payload}); } } else observeAccepted(payload=>{
  const message={type:'ACCEPTED_SUBMISSION',payload:{...payload,url:location.href}};
  console.log('[DSA Tracker] Sending accepted problem to background...'); console.log('[DSA Tracker] Content sending solved payload:',message.payload);
  if(typeof chrome==='undefined'||!chrome.runtime||typeof chrome.runtime.sendMessage!=='function'){
    console.error('[DSA Tracker] Background messaging unavailable: chrome.runtime.sendMessage is not available');
    return;
  }
  chrome.runtime.sendMessage(message)
    .then(response=>console.log('[DSA Tracker] Background response received:',response))
    .catch(error=>console.error('[DSA Tracker] Background messaging failed:',error?.message||error));
});
