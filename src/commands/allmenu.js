/**
 * Command: allmenu
 * Full command list grouped by category. Each entry shows the command
 * and its description. Buttons fire actual commands via cmd_ prefix.
 */
import { getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config }                          from '../config/index.js';
import { sendInteractive, quickReply }     from '../services/rich-messages.js';

export const meta = {
  name:        'allmenu',
  description: 'Full command list by category',
  category:    'utility',
  aliases:     ['commands', 'allcmds'],
  cooldown:    5,
  permission:  'public',
};

const BRAND_FOOTER = 'Yuzuki AI • Powered by cv3inx';

const CAT_ICONS = {
  ai:         '🧠',
  utility:    '⚙️',
  owner:      '👑',
  general:    '📋',
  fun:        '🎉',
  tools:      '🛠️',
  downloader: '📥',
  search:     '🔍',
  media:      '🎬',
};

function catIcon(cat) { return CAT_ICONS[cat?.toLowerCase()] ?? '📂'; }
function cap(s)       { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const p    = config.prefix;
  const cats = getCategoryNames();

  // Build full command list text grouped by category
  const sections = cats.map(cat => {
    const entries = getByCategory(cat);
    if (!entries.length) return null;

    const lines = entries.map(e => {
      const aliases = e.meta.aliases?.length
        ? ` _(${e.meta.aliases.map(a => `${p}${a}`).join(', ')})_`
        : '';
      return `• \`${p}${e.meta.name}\`${aliases} — ${e.meta.description ?? ''}`;
    });

    return `${catIcon(cat)} *${cap(cat)}*\n${lines.join('\n')}`;
  }).filter(Boolean);

  const total    = cats.reduce((n, c) => n + getByCategory(c).length, 0);
  const bodyText = sections.join('\n\n');
  const header   = `📋 All Commands (${total})`;

  // WhatsApp caps interactive body at ~4000 chars — split if needed
  const MAX = 3800;
  if (bodyText.length <= MAX) {
    return sendInteractive(sock, jid, {
      header,
      body:    bodyText,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🧠 AI Chat',  'cmd_ai'),
        quickReply('📥 Download', 'cmd_dl'),
        quickReply('🔍 Search',   'cmd_search'),
      ],
    }, rawMessage);
  }

  // Too long — send as chunks of plain text, one per category
  for (let i = 0; i < sections.length; i++) {
    const isLast = i === sections.length - 1;
    await sock.sendMessage(
      jid,
      { text: isLast ? `${sections[i]}\n\n_${total} commands total · ${config.botName} v${config.version}_` : sections[i] },
      i === 0 && rawMessage ? { quoted: rawMessage } : {},
    );
  }
}
