export { getDatabase } from './index.js';
export const getUser=j=>getDatabase().prepare('SELECT * FROM users WHERE jid=?').get(j);
export const isUserBanned=j=>{const r=getUser(j);return r?r.isBanned===1:false;};
export function touchUser(j,n){const db=getDatabase();if(db.prepare('SELECT jid FROM users WHERE jid=?').get(j))db.prepare('UPDATE users SET lastSeen=CURRENT_TIMESTAMP,pushName=COALESCE(?,pushName),commandCount=commandCount+1 WHERE jid=?').run(n??null,j);else db.prepare('INSERT INTO users(jid,pushName,lastSeen) VALUES(?,?,CURRENT_TIMESTAMP)').run(j,n??null);}
export function setUserFlag(j,f,v){const db=getDatabase();if(db.prepare('SELECT jid FROM users WHERE jid=?').get(j))db.prepare(`UPDATE users SET ${f}=? WHERE jid=?`).run(v?1:0,j);else db.prepare(`INSERT INTO users(jid,${f}) VALUES(?,?)`).run(j,v?1:0);}
export const getGroup=j=>getDatabase().prepare('SELECT * FROM groups WHERE jid=?').get(j);
export function upsertGroup(j,d){const db=getDatabase();if(db.prepare('SELECT jid FROM groups WHERE jid=?').get(j)){const s=Object.keys(d).map(k=>`${k}=@${k}`).join(',');db.prepare(`UPDATE groups SET ${s},updatedAt=CURRENT_TIMESTAMP WHERE jid=@jid`).run({...d,jid:j});}else{const c=['jid',...Object.keys(d)].join(',');const v=['@jid',...Object.keys(d).map(k=>`@${k}`)].join(',');db.prepare(`INSERT INTO groups(${c}) VALUES(${v})`).run({...d,jid:j});}}
export function setGroupSetting(j,k,v){const db=getDatabase();if(db.prepare('SELECT jid FROM groups WHERE jid=?').get(j))db.prepare(`UPDATE groups SET ${k}=?,updatedAt=CURRENT_TIMESTAMP WHERE jid=?`).run(v,j);else db.prepare(`INSERT INTO groups(jid,${k}) VALUES(?,?)`).run(j,v);}
export const getSetting=(k)=>{const r=getDatabase().prepare('SELECT value FROM settings WHERE key=?').get(k);return r?.value??null;};
export const setSetting=(k,v)=>getDatabase().prepare('INSERT OR REPLACE INTO settings(key,value,updatedAt) VALUES(?,?,CURRENT_TIMESTAMP)').run(k,String(v));
export const getStat=k=>{const r=getDatabase().prepare('SELECT value FROM stats WHERE key=?').get(k);return r?.value??0;};
export const incrementStat=(k,by=1)=>getDatabase().prepare('INSERT INTO stats(key,value,updatedAt) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value,updatedAt=CURRENT_TIMESTAMP').run(k,by);
export const getPluginData=(p,k)=>{const r=getDatabase().prepare('SELECT value FROM plugin_data WHERE plugin=? AND key=?').get(p,k);return r?.value??null;};
export const setPluginData=(p,k,v)=>getDatabase().prepare('INSERT OR REPLACE INTO plugin_data(plugin,key,value,updatedAt) VALUES(?,?,?,CURRENT_TIMESTAMP)').run(p,k,String(v));
export const getWarns=(j,g)=>getDatabase().prepare('SELECT * FROM warns WHERE jid=? AND groupJid=? ORDER BY createdAt DESC').all(j,g);
export const clearWarns=(j,g)=>getDatabase().prepare('DELETE FROM warns WHERE jid=? AND groupJid=?').run(j,g).changes;
export function addWarn(j,g,r,b){getDatabase().prepare('INSERT INTO warns(jid,groupJid,reason,givenBy) VALUES(?,?,?,?)').run(j,g,r??null,b??null);return getWarns(j,g).length;}
