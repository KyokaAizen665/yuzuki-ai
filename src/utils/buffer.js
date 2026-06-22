/**
 * Buffer Serialization Fix
 * Encodes Buffer/Uint8Array as { _btype:'B64', _data:'<base64>' }.
 * Without this, Baileys crypto keys are corrupted after restart.
 */
export const bufferReplacer = (_,v) =>
  Buffer.isBuffer(v)     ? { _btype:'B64', _data:v.toString('base64') } :
  v instanceof Uint8Array ? { _btype:'B64', _data:Buffer.from(v).toString('base64') } : v;
export const bufferReviver = (_,v) =>
  (v&&typeof v==='object'&&v._btype==='B64'&&typeof v._data==='string') ? Buffer.from(v._data,'base64') : v;
export const serialize   = v => JSON.stringify(v, bufferReplacer);
export const deserialize = t => JSON.parse(t, bufferReviver);
