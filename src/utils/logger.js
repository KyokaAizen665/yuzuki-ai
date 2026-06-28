import chalk from 'chalk';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

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
  debug:   m => { if (process.env.DEBUG === 'true') console.log(chalk.gray(`[${ts()}] 🐛 ${m}`)); },
};

export function printBanner({ version, nodeVersion, pluginCount }) {
  // Values are truncated to 22 chars so they never overflow the box border.
  const trunc = (v, n = 22) => String(v).length > n ? String(v).slice(0, n - 1) + '…' : String(v);
  const R = (l, v) => `  ║  ${l.padEnd(12)}: ${trunc(v).padEnd(22)} ║`;
  console.log(chalk.bold.cyan(
    '\n  ╔══════════════════════════════════════════╗\n' +
    '  ║            YUZUKI  AI  v2.0              ║\n' +
    '  ╠══════════════════════════════════════════╣\n' +
    R('Version',  version)       + '\n' +
    R('Node.js',  nodeVersion)   + '\n' +
    R('Baileys',  'cv3inx fork') + '\n' +
    R('Auth',     'Pairing Code') + '\n' +
    R('Plugins',  pluginCount + ' loaded') +
    '\n  ╚══════════════════════════════════════════╝\n',
  ));
}

// ── Baileys-compatible silent logger ─────────────────────────────────────────
// Baileys expects a pino-shaped logger. We keep it silent to avoid flooding
// the console with protocol-level noise; real bot events go through `log`.
const _noop = () => {};
export const pinoLogger = {
  level: 'silent',
  trace: _noop,
  debug: _noop,
  info:  _noop,
  warn:  m => log.warn(`[baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
  error: m => log.error(`[baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
  fatal: m => log.error(`[baileys] FATAL ${typeof m === 'object' ? JSON.stringify(m) : m}`),
  child() { return this; },
};
