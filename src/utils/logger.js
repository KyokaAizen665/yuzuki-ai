import chalk from 'chalk';
import pino  from 'pino';
const ts = () => new Date().toISOString().replace('T',' ').slice(0,19);
export const pinoLogger = pino({ level: 'silent' });
export const log = {
  info:    m => console.log(chalk.blueBright( `[${ts()}] ℹ  ${m}`)),
  success: m => console.log(chalk.greenBright(`[${ts()}] ✓  ${m}`)),
  warn:    m => console.log(chalk.yellow(     `[${ts()}] ⚠  ${m}`)),
  error:   m => console.log(chalk.redBright(  `[${ts()}] ✖  ${m}`)),
  event:   m => console.log(chalk.cyan(       `[${ts()}] ⚡ ${m}`)),
  db:      m => console.log(chalk.magenta(    `[${ts()}] 🗄  ${m}`)),
  plugin:  m => console.log(chalk.green(      `[${ts()}] 🔌 ${m}`)),
  startup: m => console.log(chalk.whiteBright(`[${ts()}] 🚀 ${m}`)),
  auth:    m => console.log(chalk.cyanBright( `[${ts()}] 🔐 ${m}`)),
  cmd:     m => console.log(chalk.white(      `[${ts()}] ›  ${m}`)),
  debug:   m => { if (process.env.DEBUG==='true') console.log(chalk.gray(`[${ts()}] 🐛 ${m}`)); },
};
export function printBanner({ version, nodeVersion, pluginCount }) {
  const R = (l,v) => `  ║  ${l.padEnd(12)}: ${String(v).padEnd(24)}║`;
  console.log(chalk.bold.cyan(
    '\n  ╔══════════════════════════════════════════╗\n' +
    '  ║            YUZUKI  AI  v2.0              ║\n' +
    '  ╠══════════════════════════════════════════╣\n' +
    R('Version',version)+'\n'+R('Node.js',nodeVersion)+'\n'+
    R('Baileys','cv3inx fork')+'\n'+R('Auth','Pairing Code')+'\n'+
    R('Plugins',pluginCount+' loaded')+
    '\n  ╚══════════════════════════════════════════╝\n'
  ));
}
