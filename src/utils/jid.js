export const isJidUser         = j => typeof j==='string'&&j.endsWith('@s.whatsapp.net');
export const isJidGroup        = j => typeof j==='string'&&j.endsWith('@g.us');
export const isJidBroadcast    = j => typeof j==='string'&&j.endsWith('@broadcast');
export const isJidNewsletter   = j => typeof j==='string'&&j.endsWith('@newsletter');
export const isJidStatusBroadcast = j => j==='status@broadcast';
export const phoneToJid = p => `${p.replace(/\D/g,'')}@s.whatsapp.net`;
export const jidToPhone = j => (j??'').split('@')[0];
export function normalizeJid(jid) {
  if(!jid)return'';const[u,s]=jid.split('@');return s?`${u.split(':')[0]}@${s}`:u.split(':')[0];
}
export const jidsEqual = (a,b) => normalizeJid(a)===normalizeJid(b);
