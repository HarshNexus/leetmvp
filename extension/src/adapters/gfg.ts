import type { NormalizedProblem } from './types';
function normalize(text:string){return text.replace(/\s+/g,' ').trim();}
const DIFFICULTY_KEYS=['basic','school','easy','medium','hard'] as const;
const DIFFICULTY_MAP:Record<string,'Easy'|'Medium'|'Hard'>={basic:'Easy',school:'Easy',easy:'Easy',medium:'Medium',hard:'Hard'};
function getDifficulty():'Easy'|'Medium'|'Hard'{const el=document.querySelector('[class*="difficulty" i],[data-difficulty],[aria-label*="difficulty" i]');const text=normalize(el?.textContent||el?.getAttribute('aria-label')||el?.getAttribute('data-difficulty')||'').toLowerCase();const key=DIFFICULTY_KEYS.find(k=>text.includes(k));return key?DIFFICULTY_MAP[key]:'Easy';}
function getSlug(){return location.pathname.match(/(?:problems|explore|practice)\/([^/?#]+)/i)?.[1];}
export const gfgAdapter={canHandlePage:()=>/geeksforgeeks\.org$/i.test(location.hostname)&&/problems|explore|practice/i.test(location.pathname),getProblem:():NormalizedProblem|null=>{const slug=getSlug();const node=document.querySelector('meta[property="og:title"],h1');const title=(node?.getAttribute('content')||node?.textContent||'').replace(/\s*[-|].*$/,'').trim();if(!slug||!title)return null;return {platform:'GeeksforGeeks',questionNumber:slug,title,slug,url:location.href,difficulty:getDifficulty(),status:'Solved',solvedAt:new Date().toISOString()};},getSubmissionStatus:()=>/all test cases passed|correct answer|problem solved successfully|successfully submitted|\baccepted\b/i.test(document.body?.innerText||''),getUser:()=>null};
export function observeGfgAccepted(callback:(p:NormalizedProblem)=>void){
  let lastSlug='';let fired=false;let baseline=true;let timer:number|undefined;
  const check=()=>{timer=undefined;const slug=getSlug()||'';if(slug!==lastSlug){lastSlug=slug;fired=false;baseline=true;}const solved=gfgAdapter.getSubmissionStatus();if(baseline){baseline=false;fired=solved;return;}if(solved&&!fired){fired=true;const payload=gfgAdapter.getProblem();if(payload)callback(payload);}};
  const schedule=()=>{if(timer===undefined)timer=window.setTimeout(check,300);};
  schedule();
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true});
  window.addEventListener('popstate',schedule);
  for(const method of ['pushState','replaceState'] as const){const original=history[method];history[method]=function(...args:Parameters<typeof original>){const result=original.apply(this,args);schedule();return result};}
}
