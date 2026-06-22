#!/usr/bin/env node
import http from 'http';
import { config } from './src/config/index.js';
import { log, printBanner } from './src/utils/logger.js';
import { ensureDir } from './src/utils/helpers.js';
import { initDatabase } from './src/database/index.js';
import { useSQLiteAuthState } from './src/database/auth.js';
import { getBaileysVersion } from './src/core/socket.js';
import { initConnectionManager,connect,shutdown,getSocket } from './src/core/connection.js';
async function main(){
  ensureDir(config.sessionDir);ensureDir(config.tempDir);ensureDir(config.logsDir);
  initDatabase(config.dbPath);
  const{state:authState,saveCreds,clearCreds}=useSQLiteAuthState(config.dbPath);
  const version=await getBaileysVersion();
  log.info(`[boot] Baileys: ${version.join('.')}`);
  printBanner({version:config.version,nodeVersion:process.version,pluginCount:0});
  initConnectionManager({authState,saveCreds,clearCreds,onSocketReady:s=>{log.startup('[boot] Socket ready — Phase 2 pending');}});
  await connect(version);
  if(config.port>0){
    const srv=http.createServer((_,res)=>{const s=getSocket();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'running',bot:config.botName,version:config.version,connected:!!s,jid:s?.user?.id??null,uptime:process.uptime(),ts:new Date().toISOString()}));});
    srv.on('error',e=>e.code==='EADDRINUSE'?log.warn(`[health] Port ${config.port} busy`):log.error(`[health] ${e.message}`));
    srv.listen(config.port,()=>log.info(`[health] :${config.port}`));
  }
  const bye=sig=>{log.warn(`\n[boot] ${sig}`);shutdown();process.exit(0);};
  process.on('SIGINT',()=>bye('SIGINT'));process.on('SIGTERM',()=>bye('SIGTERM'));
  process.on('uncaughtException',e=>log.error(`[boot] ${e.message}`));
  process.on('unhandledRejection',r=>log.error(`[boot] ${r}`));
}
main().catch(e=>{console.error('[FATAL]',e);process.exit(1);});
