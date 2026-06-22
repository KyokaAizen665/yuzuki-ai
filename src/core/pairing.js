/**
 * Pairing Code Authentication (pairing code ONLY — QR permanently disabled)
 *
 * Steps: WhatsApp → Settings → Linked Devices → Link a Device
 *        → "Link with phone number instead" → Enter 8-char code
 */
import readline from 'readline';
import { log } from '../utils/logger.js';
export function promptPhoneNumber() {
  return new Promise(resolve=>{
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    log.warn('[pairing] OWNER_NUMBER not set');
    rl.question('  Phone (country code + digits, no +): ',ans=>{rl.close();resolve(ans.replace(/\D/g,''));});
  });
}
export async function requestPairingCode(sock, phone) {
  const d=phone.replace(/\D/g,'');
  if(d.length<7)throw new Error(`[pairing] Invalid phone: "${phone}"`);
  log.auth(`[pairing] Requesting code for +${d}...`);
  try{return await sock.requestPairingCode(d);}
  catch(e){throw new Error(`[pairing] Failed: ${e.message}`);}
}
export function displayPairingCode(code, phone) {
  const s='  ════════════════════════════════════════';
  console.log('');console.log(s);
  console.log('  ║       WHATSAPP PAIRING CODE           ║');
  console.log(s);
  console.log(`  ║   Code  : ${String(code).padEnd(29)}║`);
  console.log(`  ║   Phone : +${String(phone).padEnd(28)}║`);
  console.log(s);console.log('');
  console.log('  → WhatsApp → Settings → Linked Devices → Link a Device');
  console.log('  → Tap "Link with phone number instead" → Enter code above');
  console.log('');
}
