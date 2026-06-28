/**
 * Command: lab  (owner only)
 *
 * Menu Style Laboratory — Yuzuki AI
 *
 * Sends the same "Yuzuki AI" menu content through every WhatsApp message type
 * so you can compare side-by-side how each one renders on real devices.
 * The identical content across all types makes rendering differences obvious.
 *
 * Usage:
 *   .lab              — interactive test selector
 *   .lab <type>       — run one specific type
 *   .lab all          — send every type in sequence
 *   .lab list         — plain-text list of all types
 *
 * Types:
 *   interactive  — NativeFlow body + buttons  (standard)
 *   image        — NativeFlow with hero image header
 *   carousel     — one swipeable card per category
 *   list         — listMessage with sections + rows
 *   template     — hydratedTemplate quick-reply buttons
 *   product      — productMessage (description renders dim grey) ← the trick
 *   text         — plain markdown extendedTextMessage
 *   contact      — contactMessage / vCard as info card
 *   location     — locationMessage pin as decorative header
 *   order        — orderMessage (items as command entries)
 *   ordermenu    — orderMessage banner → image + NativeFlow buttons (dev pattern)
 *   storefront   — shopStorefrontMessage commerce card
 *   all          — every type in sequence
 */

import { log }                from '../utils/logger.js';
import { config }             from '../config/index.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { getBaileys }         from '../core/socket.js';
import {
  sendInteractive,
  sendCarousel,
  sendList,
  sendInteractiveAsTemplate,
  sendCollection,
  sendProductMenu,
  sendCode,
  sendTable,
  sendCitation,
  sendAIRichResponse,
  sendNativeAIResponse,
  quickReply,
} from '../services/rich-messages.js';

// ── Shared menu content — identical across all types for fair comparison ──────

const BOT  = config.botName ?? 'Yuzuki AI';
const P    = config.prefix  ?? '.';
const FOOT = `🤖 ${BOT} — Menu Style Lab`;

const MENU_TITLE = `🤖 ${BOT}`;

// Markdown body — for types that render markdown
const MENU_BODY =
  'Choose a category to get started:\n\n' +
  '🧠 *AI*        — Chat, translate, summarise\n' +
  '📥 *Download*  — YouTube, TikTok, Instagram\n' +
  '🔍 *Search*    — Web, Wikipedia, YouTube\n' +
  '🎮 *Fun*       — Games, memes, trivia\n' +
  '📡 *Info*      — Weather, news, facts';

// Plain text body — for types that strip markdown (product, contact, location)
const MENU_DESC =
  `AI · Download · Search · Fun · Info\nType ${P}help to explore all commands.`;

const MENU_BUTTONS = [
  quickReply('🧠 AI Chat',  'cmd_ai'),
  quickReply('📥 Download', 'cmd_dl'),
  quickReply('🔍 Search',   'cmd_search'),
];

// ── Test metadata ──────────────────────────────────────────────────────────────

const TESTS = {
  interactive: {
    icon:  '💬',
    label: 'NativeFlow Interactive',
    desc:  'Standard text body + buttons card — the default menu container',
  },
  image: {
    icon:  '🖼️',
    label: 'Image + NativeFlow',
    desc:  'Hero image header with markdown body and quick-reply buttons',
  },
  carousel: {
    icon:  '🎠',
    label: 'Carousel Cards',
    desc:  'Each category gets its own swipeable card with a button',
  },
  list: {
    icon:  '📋',
    label: 'List Message',
    desc:  'Sections + rows — deepest text capacity, no image, no inline buttons',
  },
  template: {
    icon:  '📄',
    label: 'Hydrated Template',
    desc:  'WA Business template format with three quick-reply buttons',
  },
  product: {
    icon:  '📦',
    label: 'Product Message ← dim text trick',
    desc:  'description field renders dim grey automatically — no markdown needed',
  },
  text: {
    icon:  '✍️',
    label: 'Extended Text',
    desc:  'Pure markdown — no card chrome, no buttons, maximum text freedom',
  },
  contact: {
    icon:  '👤',
    label: 'Contact Card',
    desc:  'vCard: FN (name) = bold · ORG field = dim grey below name',
  },
  location: {
    icon:  '📍',
    label: 'Location Pin',
    desc:  'Map thumbnail: name = bold above pin, address = dim grey below',
  },
  order: {
    icon:  '🛒',
    label: 'Order Message',
    desc:  'orderTitle = bold, message = dim — itemCount as secondary text',
  },
  ordermenu: {
    icon:  '🛒🖼️',
    label: 'Order Banner → Image + Buttons (dev pattern)',
    desc:  'orderMessage as visual header, then hero image + NativeFlow buttons — how other bots attach it to .menu',
  },
  storefront: {
    icon:  '🏪',
    label: 'Shop Storefront',
    desc:  'shopStorefrontMessage commerce card — requires a WA Business account',
  },
  // ── Rendering tricks ────────────────────────────────────────────────────────
  code: {
    icon:  '💻',
    label: 'sendCode — markdown code block',
    desc:  'Triple-backtick code block — WA applies its own syntax colour to keywords',
  },
  nativecode: {
    icon:  '🔮',
    label: 'sendNativeAIResponse — cv3inx rich CODE',
    desc:  'cv3inx RichSubMessageType.CODE → tokenized → GenAICodeUXPrimitive native renderer',
  },
  table: {
    icon:  '📊',
    label: 'sendTable — cv3inx native TABLE',
    desc:  'cv3inx RichSubMessageType.TABLE → GenATableUXPrimitive — no ASCII drawing',
  },
  citation: {
    icon:  '📎',
    label: 'sendCitation — source attribution',
    desc:  'Source bold + block-quoted content + optional comment',
  },
  richresponse: {
    icon:  '🤖',
    label: 'sendAIRichResponse — full AI card',
    desc:  'Text + code block + table sent as a combined AI rich response in one call',
  },
};

// ── Lab selector menu ─────────────────────────────────────────────────────────

async function sendLabMenu(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;

  const lines = Object.entries(TESTS)
    .map(([k, t]) => `${t.icon} *${t.label}* — \`${P}lab ${k}\`\n_${t.desc}_`)
    .join('\n\n');

  return sendInteractive(sock, jid, {
    header:  '🔬 Menu Style Lab',
    body:    `Compare how every WA message type renders as a menu.\n\n${lines}`,
    footer:  FOOT,
    buttons: [
      quickReply('🚀 Run All',       'lab_all'),
      quickReply('📋 List Types',    'lab_list'),
      quickReply('🛒🖼️ Order Menu',  'lab_ordermenu'),
    ],
  }, rawMessage);
}

// ── Runners — one per message type ────────────────────────────────────────────

const runners = {

  // 1. NativeFlow text-only card
  async interactive(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_💬 *interactive* — NativeFlow body + buttons_' }).catch(() => {});
    return sendInteractive(sock, jid, {
      header: MENU_TITLE, body: MENU_BODY, footer: FOOT, buttons: MENU_BUTTONS,
    }, rawMessage);
  },

  // 2. Hero image + NativeFlow
  async image(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    const hero = getRandomHeroImage('ai') ?? { url: 'https://picsum.photos/720/400.jpg' };
    await sock.sendMessage(jid, { text: '_🖼️ *image* — hero image header + NativeFlow buttons_' }).catch(() => {});
    return sendInteractive(sock, jid, {
      contextImage: hero, header: MENU_TITLE, body: MENU_BODY, footer: FOOT, buttons: MENU_BUTTONS,
    }, rawMessage);
  },

  // 3. Carousel — one card per category
  async carousel(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_🎠 *carousel* — one swipeable card per category_' }).catch(() => {});
    return sendCarousel(sock, jid, {
      body: `${MENU_TITLE} — Pick a Category`,
      cards: [
        { header: '🧠 AI Features',  body: 'Chat, translate, summarise, debug code.\nSupports GPT · Gemini · LLaMA.',    footer: FOOT, buttons: [quickReply('▶ Try AI',     'cmd_ai')]     },
        { header: '📥 Downloader',   body: 'YouTube, TikTok, Instagram, Twitter.\nHigh-quality, no watermark.',           footer: FOOT, buttons: [quickReply('📥 Download',  'cmd_dl')]     },
        { header: '🔍 Search',       body: 'Web, Wikipedia, YouTube search.\nPowered by DuckDuckGo.',                     footer: FOOT, buttons: [quickReply('🔍 Search',    'cmd_search')] },
        { header: '🎮 Fun & Games',  body: 'Trivia, memes, random facts.\nKeep the chat entertaining.',                   footer: FOOT, buttons: [quickReply('🎮 Fun',        'cmd_fun')]    },
        { header: '📡 Info & Tools', body: 'Weather, news, currency rates.\nReal-time data on demand.',                   footer: FOOT, buttons: [quickReply('📡 Info',       'cmd_info')]   },
      ],
    }, rawMessage);
  },

  // 4. List message with sections
  async list(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_📋 *list* — sections + rows, deepest text capacity_' }).catch(() => {});
    return sendList(sock, jid, {
      title: MENU_TITLE, text: `${MENU_BODY}\n\nTap *Browse Commands* to explore.`,
      footer: FOOT, buttonText: 'Browse Commands',
      sections: [
        {
          title: '🤖 AI & Intelligence',
          rows: [
            { id: 'cmd_ai',       title: `${P}ai`,       description: 'Chat with AI — translate, summarise, debug' },
            { id: 'cmd_ai_clear', title: `${P}ai clear`, description: 'Reset your conversation history'            },
          ],
        },
        {
          title: '📥 Downloaders',
          rows: [
            { id: 'cmd_dl', title: `${P}dl`, description: 'YouTube · TikTok · Instagram · Twitter' },
            { id: 'cmd_yt', title: `${P}yt`, description: 'YouTube video / audio downloader'        },
            { id: 'cmd_tt', title: `${P}tt`, description: 'TikTok downloader (no watermark)'         },
          ],
        },
        {
          title: '🔍 Search',
          rows: [
            { id: 'cmd_search',      title: `${P}search`,      description: 'DuckDuckGo web search' },
            { id: 'cmd_search_wiki', title: `${P}search wiki`, description: 'Wikipedia summary'      },
            { id: 'cmd_search_yt',   title: `${P}search yt`,   description: 'YouTube video search'  },
          ],
        },
        {
          title: '⚙️ Utility',
          rows: [
            { id: 'open_menu', title: `${P}help`, description: 'Show the main menu'     },
            { id: 'cmd_ping',  title: `${P}ping`, description: 'Check bot response time' },
          ],
        },
      ],
    }, rawMessage);
  },

  // 5. Hydrated template buttons
  async template(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_📄 *template* — WA Business hydratedTemplate format_' }).catch(() => {});
    return sendInteractiveAsTemplate(sock, jid, {
      header: MENU_TITLE, body: MENU_BODY, footer: FOOT,
      buttons: [
        { quickReplyButton: { displayText: '🧠 AI Chat',  id: 'cmd_ai'     } },
        { quickReplyButton: { displayText: '📥 Download', id: 'cmd_dl'     } },
        { quickReplyButton: { displayText: '🔍 Search',   id: 'cmd_search' } },
      ],
    }, rawMessage);
  },

  // 6. productMessage — dim description trick
  async product(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text:
        '_📦 *product* — productMessage\n' +
        'The *description* field renders dim grey automatically — no markdown tricks needed.\n' +
        "It's the product card renderer's own visual hierarchy._",
    }).catch(() => {});
    return sendProductMenu(sock, jid, {
      title:           MENU_TITLE,
      description:     MENU_DESC,
      retailerId:      'yuzuki_menu',
      currency:        '',
      priceAmount1000: 0,
      catalogTitle:    `${BOT} Command Menu`,
    }, rawMessage);
  },

  // 7. Plain markdown extended text
  async text(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_✍️ *text* — plain extendedTextMessage, maximum markdown freedom_' }).catch(() => {});
    const body =
      `╔══════════════════╗\n` +
      `║  🤖 ${BOT.slice(0, 14).padEnd(14)} ║\n` +
      `╚══════════════════╝\n\n` +
      MENU_BODY + '\n\n' +
      `──────────────────────\n` +
      FOOT;
    return sock.sendMessage(jid, { text: body }, rawMessage ? { quoted: rawMessage } : {});
  },

  // 8. Contact card as info card
  async contact(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text: '_👤 *contact* — contactMessage / vCard\nFN (name) = bold · ORG field = dim grey below name._',
    }).catch(() => {});
    const num = config.ownerNumber ?? '1234567890';
    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${BOT}\n` +
      'ORG:AI · Download · Search · Fun · Info;\n' +
      `NOTE:Type ${P}help to explore all commands.\n` +
      `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n` +
      `X-WA-BIZ-NAME:${BOT}\n` +
      'END:VCARD';
    return sock.sendMessage(
      jid,
      { contacts: { displayName: BOT, contacts: [{ vcard }] } },
      rawMessage ? { quoted: rawMessage } : {},
    );
  },

  // 9. Location pin as decorative header
  async location(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text: '_📍 *location* — locationMessage\nname = bold above the map pin · address = dim grey below._',
    }).catch(() => {});
    return sock.sendMessage(
      jid,
      {
        location: {
          degreesLatitude:  1.3521,
          degreesLongitude: 103.8198,
          name:    MENU_TITLE,
          address: MENU_DESC,
        },
      },
      rawMessage ? { quoted: rawMessage } : {},
    );
  },

  // 10. orderMessage — title bold, message dim
  async order(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text:
        '_🛒 *order* — orderMessage\n' +
        'orderTitle = bold · message / itemCount = dim secondary text.\n' +
        'May require a WA Business account to render correctly._',
    }).catch(() => {});
    const { proto, generateWAMessageFromContent } = getBaileys();
    const ownerJid = sock.user?.id ?? `${config.ownerNumber ?? '0'}@s.whatsapp.net`;
    try {
      const msg = generateWAMessageFromContent(
        jid,
        {
          orderMessage: proto.Message.OrderMessage.create({
            orderId:    'lab_menu_001',
            token:      'menu',
            itemCount:  5,
            status:     1,
            surface:    1,
            message:    `${P}help — see all 5 categories`,
            orderTitle: MENU_TITLE,
            sellerJid:  ownerJid,
          }),
        },
        { userJid: sock.user?.id, quoted: rawMessage },
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    } catch (e) {
      log.warn(`[lab] order failed (${e.message})`);
      await ctx.reply(`⚠️ *orderMessage* failed:\n${e.message}\n\n_Requires a WA Business account._`);
    }
  },

  // 11. orderMessage banner → image + NativeFlow buttons  (the dev pattern)
  //
  //  This is the layout many bot devs use when attaching an order message to .menu:
  //
  //  Part 1: orderMessage — fully populated so every visible field renders.
  //    orderTitle  → BOLD headline on the card          e.g. "🤖 Yuzuki AI"
  //    message     → dim grey subtitle below the title   e.g. category listing
  //    itemCount   → secondary badge                     e.g. "5 items"
  //    status      → 1 = PENDING (standard display state)
  //    surface     → 1 = CATALOG surface
  //    thumbnail   → base64-encoded 100×100 JPEG fed into ImageMessage
  //                  (gives the order card its own small preview image)
  //    sellerJid   → owner JID — required for the card to attribute correctly
  //    token       → opaque string, used by WA to link back to the catalog entry
  //
  //  400 ms pause — lets WA deliver and render the order card before the
  //  menu card arrives, so they stack visually as two separate bubbles.
  //
  //  Part 2: sendInteractive with contextImage.
  //    Hero image fills the NativeFlow card header,
  //    MENU_BODY fills the body, MENU_BUTTONS appear below.
  //
  //  Net effect in the chat:
  //    ┌─────────────────────────────┐
  //    │  🛒  🤖 Yuzuki AI   [bold] │  ← orderMessage banner
  //    │  AI · Download · Search…   │  ← dim grey
  //    │  5 items                   │  ← badge
  //    └─────────────────────────────┘
  //    ┌─────────────────────────────┐
  //    │  [hero image]               │  ← interactive card
  //    │  🤖 Yuzuki AI               │
  //    │  Choose a category…         │
  //    │  [AI Chat] [Download] [🔍]  │  ← NativeFlow buttons
  //    └─────────────────────────────┘
  async ordermenu(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;

    await sock.sendMessage(jid, {
      text:
        '_🛒🖼️ *ordermenu* — orderMessage banner + image + NativeFlow buttons\n' +
        'orderMessage fires first as the visual header (bold title, dim grey text,\n' +
        'item count badge, thumbnail), then the menu card with image + buttons drops below.\n' +
        "This is how other bot devs attach order messages to their .menu._",
    }).catch(() => {});

    const { proto, generateWAMessageFromContent } = getBaileys();
    const ownerJid = sock.user?.id ?? `${config.ownerNumber ?? '0'}@s.whatsapp.net`;

    // ── Part 1: orderMessage — the header banner ──────────────────────────────
    //
    // Populate every visible field so the card renders fully:
    //   orderTitle  — bold headline
    //   message     — dim grey subtitle (plain text, no markdown)
    //   itemCount   — rendered as "N items" badge on the card
    //   status      — 1 = PENDING (normal non-error state)
    //   surface     — 1 = CATALOG
    //   sellerJid   — attributes the card to this bot's JID
    //   token       — opaque reference token; not shown to user
    //   thumbnail   — 1×1 transparent GIF as a minimal placeholder so the
    //                 imageMessage field is present; swap for a real JPEG
    //                 buffer (100×100) to show a proper thumbnail image.

    // Minimal 1×1 transparent GIF — keeps the thumbnail field non-null
    // without requiring an external image download during the lab test.
    // Replace with a real image buffer for production menus.
    const BLANK_GIF = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    );

    try {
      const thumbnailMsg = proto.Message.ImageMessage.create({
        url:           '',
        mimetype:      'image/gif',
        fileSha256:    Buffer.alloc(32),
        fileLength:    BigInt(BLANK_GIF.length),
        height:        1,
        width:         1,
        jpegThumbnail: BLANK_GIF,
      });

      const orderMsg = generateWAMessageFromContent(
        jid,
        {
          orderMessage: proto.Message.OrderMessage.create({
            orderId:    'lab_ordermenu_banner',
            token:      'yuzuki_menu_v2',
            itemCount:  5,
            status:     proto.Message.OrderMessage.OrderStatus?.INQUIRY ?? 1,
            surface:    proto.Message.OrderMessage.OrderSurface?.CATALOG ?? 1,
            message:    `AI · Download · Search · Fun · Info\nSend ${P}help to explore all commands.`,
            orderTitle: MENU_TITLE,
            sellerJid:  ownerJid,
            thumbnail:  thumbnailMsg,
          }),
        },
        { userJid: sock.user?.id },
      );
      await sock.relayMessage(jid, orderMsg.message, { messageId: orderMsg.key.id });
    } catch (e) {
      log.warn(`[lab] ordermenu: banner failed (${e.message})`);
      // Fall through — still send the menu card below even if the banner failed
      await sock.sendMessage(jid, { text: `⚠️ Order banner failed: ${e.message}` }).catch(() => {});
    }

    // Short pause — lets WA render the order card before the menu card arrives
    await new Promise(r => setTimeout(r, 400));

    // ── Part 2: image + caption + NativeFlow buttons ──────────────────────────
    const hero = getRandomHeroImage('menu')
              ?? getRandomHeroImage('ai')
              ?? { url: 'https://picsum.photos/720/400.jpg' };

    return sendInteractive(sock, jid, {
      contextImage: hero,
      header:       MENU_TITLE,
      body:         MENU_BODY,
      footer:       FOOT,
      buttons:      MENU_BUTTONS,
    }, rawMessage);
  },

  // 12. shopStorefrontMessage commerce card
  async storefront(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text: '_🏪 *storefront* — shopStorefrontMessage\nCommerce card — requires a WA Business account with an active catalog._',
    }).catch(() => {});
    const ownerJid = sock.user?.id ?? `${config.ownerNumber ?? '0'}@s.whatsapp.net`;
    return sendCollection(sock, jid, { bizJid: ownerJid, id: '0', title: MENU_TITLE }, rawMessage);
  },

  // ── Rendering tricks ────────────────────────────────────────────────────────

  // 13. sendCode — markdown triple-backtick code block
  async code(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_💻 *code* — sendCode() — WA markdown triple-backtick block_' }).catch(() => {});
    const sample = [
      'function greet(name) {',
      '  const msg = `Hello, ${name}!`;',
      '  console.log(msg);',
      '  return msg;',
      '}',
      '',
      'greet("Yuzuki");',
    ].join('\n');
    return sendCode(sock, jid, sample, 'javascript', rawMessage);
  },

  // 14. sendNativeAIResponse — cv3inx rich CODE renderer
  async nativecode(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text:
        '_🔮 *nativecode* — sendNativeAIResponse()\n' +
        'Uses cv3inx RichSubMessageType.CODE → tokenizeCode() → GenAICodeUXPrimitive.\n' +
        'Keywords, strings, numbers get individual colour tokens — no markdown involved._',
    }).catch(() => {});
    const sample = [
      'async function fetchWeather(city) {',
      '  const url = `https://api.weather.com/v1/${city}`;',
      '  const res  = await fetch(url);',
      '  if (!res.ok) throw new Error(`HTTP ${res.status}`);',
      '  const data = await res.json();',
      '  return { temp: data.temp, unit: "°C" };',
      '}',
    ].join('\n');
    return sendNativeAIResponse(sock, jid, {
      text:       'Native code renderer — each token is individually coloured:',
      codeBlocks: [{ code: sample, language: 'javascript' }],
    }, rawMessage);
  },

  // 15. sendTable — cv3inx native TABLE (GenATableUXPrimitive)
  async table(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text:
        '_📊 *table* — sendTable()\n' +
        'cv3inx RichSubMessageType.TABLE = 4 → toUnified() → GenATableUXPrimitive.\n' +
        'Native WA table card — no ASCII box-drawing characters._',
    }).catch(() => {});
    return sendTable(
      sock, jid,
      ['Command', 'Category', 'Description'],
      [
        ['.ai',     'AI',       'Chat with AI — translate, summarise, debug'],
        ['.dl',     'Download', 'YouTube · TikTok · Instagram · Twitter'],
        ['.search', 'Search',   'DuckDuckGo · Wikipedia · YouTube'],
        ['.fun',    'Fun',      'Trivia · memes · random facts'],
        ['.help',   'Utility',  'Show main menu'],
      ],
      'Yuzuki AI — Command Reference',
      rawMessage,
    );
  },

  // 16. sendCitation
  async citation(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, { text: '_📎 *citation* — sendCitation() — source attribution card_' }).catch(() => {});
    return sendCitation(sock, jid, {
      source:  'Yuzuki AI Documentation',
      content: 'Yuzuki AI supports 11 WhatsApp message types as menu containers.\n' +
               'Each type has different capabilities for headers, body text, and buttons.\n' +
               'Use .lab to compare them side-by-side on any device.',
      comment: '_💡 Run .lab all to see every type back-to-back_',
    }, rawMessage);
  },

  // 17. sendAIRichResponse — full combined AI card
  async richresponse(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    await sock.sendMessage(jid, {
      text:
        '_🤖 *richresponse* — sendAIRichResponse()\n' +
        'Sends text + a code block + a table all in one structured AI response.\n' +
        'This is what the bot uses when replying to .ai queries._',
    }).catch(() => {});
    return sendAIRichResponse(sock, jid, {
      text:
        '✅ Here is a combined AI rich response.\n\n' +
        'It contains *three parts*: a text block, a code snippet, and a data table — ' +
        'all sent as a single structured message.',
      codeBlocks: [{
        language: 'python',
        code: [
          'def fibonacci(n):',
          '    a, b = 0, 1',
          '    for _ in range(n):',
          '        yield a',
          '        a, b = b, a + b',
          '',
          'print(list(fibonacci(8)))',
          '# → [0, 1, 1, 2, 3, 5, 8, 13]',
        ].join('\n'),
      }],
      tables: [{
        title:   'Fibonacci — first 8 terms',
        headers: ['n', '0', '1', '2', '3', '4', '5', '6', '7'],
        rows: [
          ['F(n)', '0', '1', '1', '2', '3', '5', '8', '13'],
        ],
      }],
      suggestedPrompts: ['Explain Fibonacci', 'Show n=20', 'Graph it'],
      model:    'lab-demo',
      provider: 'Yuzuki',
    }, rawMessage);
  },

  // Run all in sequence
  async all(ctx) {
    const { sock, chat: jid } = ctx;
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const order = ['interactive','image','carousel','list','template','product','text','contact','location','order','ordermenu','storefront','code','nativecode','table','citation','richresponse'];

    await sock.sendMessage(jid, {
      text:
        `🚀 *Running all ${order.length} menu types in sequence.*\n` +
        `Compare them side-by-side to see how each one renders.\n\n` +
        order.map((k, i) => `${i + 1}. ${TESTS[k]?.icon ?? '•'} ${k}`).join('\n'),
    }).catch(() => {});

    for (const key of order) {
      await delay(700);
      try {
        await ctx.react('🔬');
        await runners[key](ctx);
      } catch (e) {
        log.warn(`[lab:all] ${key} failed: ${e.message}`);
        await sock.sendMessage(jid, { text: `⚠️ *${key}* — ${e.message}` }).catch(() => {});
      }
    }

    await delay(800);
    await sock.sendMessage(jid, {
      text: `✅ *Done — ${order.length} types sent.*\n\nScroll up and compare how each one renders on your device.`,
    }).catch(() => {});
  },
};

// ── Plain text list ────────────────────────────────────────────────────────────

function sendTestList(ctx) {
  const lines = Object.entries(TESTS)
    .map(([k, t]) => `${t.icon} \`${P}lab ${k}\` — *${t.label}*\n   _${t.desc}_`)
    .join('\n\n');
  return ctx.reply(
    `🔬 *Lab — Menu Style Types (${Object.keys(TESTS).length})*\n\n${lines}\n\n` +
    `\`${P}lab all\`  — run every type in sequence\n` +
    `\`${P}lab\`      — interactive selector`,
  );
}

// ── Exports ────────────────────────────────────────────────────────────────────

export const meta = {
  name:        'lab',
  description: 'Menu style lab — compare every WA message type as a menu container',
  category:    'owner',
  aliases:     ['labtest'],
  cooldown:    3,
  permission:  'owner',
};

export async function handler(ctx) {
  const { args } = ctx;
  const sub = (args[0] ?? '').toLowerCase().replace(/-/g, '');

  if (!sub || sub === 'menu') return sendLabMenu(ctx);
  if (sub === 'list')         return sendTestList(ctx);

  const runner = runners[sub];
  if (!runner) {
    return ctx.reply(
      `❌ Unknown type: *${sub}*\n\n` +
      `Available: ${Object.keys(runners).map(k => `\`${P}lab ${k}\``).join(' · ')}\n\n` +
      `Use \`${P}lab list\` or \`${P}lab\` to browse.`,
    );
  }

  try { await ctx.react('🔬'); } catch {}
  try {
    await runner(ctx);
  } catch (e) {
    log.error(`[lab] ${sub} threw: ${e.message}`);
    return ctx.reply(`⚠️ Lab test *${sub}* failed:\n${e.message}`);
  }
}
