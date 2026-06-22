import fs from 'fs';
export function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function formatUptime(ms) {
  const s=Math.floor(ms/1e3),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  return d>0?`${d}d ${h%24}h ${m%60}m`:h>0?`${h}h ${m%60}m ${s%60}s`:m>0?`${m}m ${s%60}s`:`${s}s`;
}
export function formatBytes(b) {
  if(!b)return'0 B';const u=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(1024));
  return `${parseFloat((b/Math.pow(1024,i)).toFixed(2))} ${u[i]}`;
}
export const randomInt     = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
export const sanitizeInput = t => typeof t==='string'?t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').trim():'';
export const truncate      = (s,n=100) => !s?'':s.length<=n?s:s.slice(0,n-3)+'...';
