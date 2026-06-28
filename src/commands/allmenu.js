/**
 * Command: allmenu
 * Full command list grouped by category.
 * Trigger: .allmenu  (aliases: commands, allcmds)
 * Quick-reply buttons at bottom navigate to key commands.
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

const SC_CATS = {
  ai:         'ᴀɪ',
  utility:    'ᴜᴛɪʟɪᴛʏ',
  owner:      'ᴏᴡɴᴇʀ',
  general:    'ɢᴇɴᴇʀᴀʟ',
  fun:        'ꜰᴜɴ',
  tools:      'ᴛᴏᴏʟs',
  downloader: 'ᴅᴏᴡɴʟᴏᴀᴅ',
  search:     'sᴇᴀʀᴄʜ',
  media:      'ᴍᴇᴅɪᴀ',
};

function catIcon(cat) { return CAT_ICONS[cat?.toLowerCase()] ?? '📂'; }
function scCat(cat)   { return SC_CATS[cat?.toLowerCase()] ?? cat; }
function cap(s)       { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const p    = config.prefix;
  const cats = getCategoryNames();

  // Build compact command list — names + aliases, no descriptions
  const sections = cats.map(cat => {
    const entries = getByCategory(cat);
    if (!entries.length) return null;

    const lines = entries.map(e => {
      const names = [`\`${p}${e.meta.name}\``, ...(e.meta.aliases?.map(a => `\`${p}${a}\``) ?? [])];
      return `▸ ${names.join('  ')}`;
    });

    return `◆ ${catIcon(cat)} *${scCat(cat)}*\n${lines.join('\n')}`;
  }).filter(Boolean);

  const total    = cats.reduce((n, c) => n + getByCategory(c).length, 0);
  const bodyText = sections.join('\n\n');
  const header   = `◆ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs  (${total})`;

  // Buttons use quickReply() so paramsJson is properly encoded.
  // button.js routes cmd_ai → .ai, cmd_dl → .dl, cmd_search → .search
  const navButtons = [
    quickReply('🧠 AI Chat',  'cmd_ai'),
    quickReply('📥 Download', 'cmd_dl'),
    quickReply('🔍 Search',   'cmd_search'),
  ];

  // WhatsApp caps interactive body at ~4000 chars — split if needed
  const MAX = 3800;
  if (bodyText.length <= MAX) {
    return sendInteractive(sock, jid, {
      header,
      body:    bodyText,
      footer:  BRAND_FOOTER,
      buttons: navButtons,
    }, rawMessage);
  }

  // Too long — send as chunks of plain text, one per category
  for (let i = 0; i < sections.length; i++) {
    const isLast = i === sections.length - 1;
    await sock.sendMessage(
      jid,
      { text: isLast ? `${sections[i]}\n\n_${total} ᴄᴏᴍᴍᴀɴᴅs  ·  ${config.botName}_` : sections[i] },
      i === 0 && rawMessage ? { quoted: rawMessage } : {},
    );
  }
}
