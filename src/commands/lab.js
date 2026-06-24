/**
 * Command: lab  (owner only)
 *
 * Interactive message laboratory for testing every cv3inx rich message type.
 * Safe sandbox — nothing is posted publicly, only sent to the chat where
 * the owner types the command.
 *
 * Usage:
 *   .lab                     — show lab menu
 *   .lab list                — list all available tests
 *   .lab <test>              — run a specific test
 *
 * Tests:
 *   catalog          — catalogMessage (product catalog)
 *   order            — orderMessage (shop order card)
 *   payment          — paymentMessage (payment info card)
 *   contact          — contactMessage (vCard contact)
 *   contacts         — multiple contacts in one message
 *   nativeflow       — nativeFlowMessage (button row)
 *   interactive      — interactiveMessage (NativeFlow w/ buttons)
 *   list             — listMessage (single select list)
 *   poll             — pollCreationMessage
 *   carousel         — carouselMessage (multi-card)
 *   collection       — collectionMessage (storefront card)
 *   template         — interactiveResponseMessage (template format)
 *   newsletter       — newsletter create/follow test
 *   reaction         — emoji reaction to quoted message
 *   location         — live location pin
 *   image            — high-quality image with caption
 *   video            — video with caption
 *   audio            — audio (voice note simulation)
 *   sticker          — sticker from image URL
 *   disappearing     — disappearing message (view once)
 *   mention          — mention yourself in a message
 *   forward          — forward a test message
 *
 * Aliases: laboratory, msglab
 */

import { log }          from '../utils/logger.js';
import { config }       from '../config/index.js';
import {
  sendInteractive,
  sendInteractiveWithImage,
  sendList,
  sendPoll,
  sendCarousel,
  sendCollection,
  sendReaction,
  quickReply,
  ctaUrl,
  ctaCall,
  ctaCopy,
  singleSelect,
} from '../services/rich-messages.js';
import { getRandomHeroImage }    from '../services/hero-images.js';
import { getNewsletterService }  from '../services/newsletter.js';
import { getBusinessService }    from '../services/business.js';

export const meta = {
  name:        'lab',
  description: 'Owner-only message laboratory — test every cv3inx rich message type',
  category:    'owner',
  aliases:     ['laboratory', 'msglab'],
  cooldown:    3,
  owner:       true,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = `🔬 ${config.botName ?? 'Yuzuki AI'} Lab`;

// ── Test registry ─────────────────────────────────────────────────────────────

const TESTS = {
  catalog:     { icon: '🛒', label: 'catalogMessage',    desc: 'Fetch + display bot product catalog' },
  order:       { icon: '📦', label: 'orderMessage',      desc: 'Parse an orderMessage (reply to one)' },
  payment:     { icon: '💳', label: 'paymentMessage',    desc: 'Send a payment info card' },
  contact:     { icon: '👤', label: 'contactMessage',    desc: 'Send a single vCard contact' },
  contacts:    { icon: '👥', label: 'multi-contact',     desc: 'Send multiple vCard contacts' },
  nativeflow:  { icon: '🔘', label: 'nativeFlowMessage', desc: 'Raw nativeFlowMessage buttons' },
  interactive: { icon: '🎛️', label: 'interactiveMessage', desc: 'sendInteractive() — NativeFlow standard' },
  list:        { icon: '📋', label: 'listMessage',       desc: 'sendList() — single select list' },
  poll:        { icon: '📊', label: 'pollMessage',       desc: 'sendPoll() — native poll' },
  carousel:    { icon: '🎠', label: 'carouselMessage',   desc: 'sendCarousel() — multi-card scroll' },
  collection:  { icon: '🏪', label: 'collectionMessage', desc: 'sendCollection() — storefront card' },
  newsletter:  { icon: '📢', label: 'newsletter',        desc: 'Newsletter service test (create/info)' },
  reaction:    { icon: '💬', label: 'reaction',          desc: 'Send emoji reaction to quoted message' },
  location:    { icon: '📍', label: 'locationMessage',   desc: 'Send a location pin' },
  image:       { icon: '🖼️', label: 'imageMessage',      desc: 'Send image with caption' },
  disappearing:{ icon: '👁️', label: 'viewOnce',          desc: 'View-once / disappearing image' },
  mention:     { icon: '@',  label: 'mentionMessage',    desc: 'Mention yourself in text' },
  sticker:     { icon: '🎨', label: 'stickerMessage',    desc: 'Send animated sticker' },
};

// ── Lab menu ──────────────────────────────────────────────────────────────────

async function sendLabMenu(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const p = config.prefix;

  const groups = [
    {
      title: '📨 Message Types',
      rows: Object.entries(TESTS).slice(0, 8).map(([key, t]) => ({
        header:      t.icon,
        title:       t.label,
        description: t.desc,
        id:          `lab_${key}`,
      })),
    },
    {
      title: '🛒 Business & Rich',
      rows: Object.entries(TESTS).slice(8, 14).map(([key, t]) => ({
        header:      t.icon,
        title:       t.label,
        description: t.desc,
        id:          `lab_${key}`,
      })),
    },
    {
      title: '📡 Media & Other',
      rows: Object.entries(TESTS).slice(14).map(([key, t]) => ({
        header:      t.icon,
        title:       t.label,
        description: t.desc,
        id:          `lab_${key}`,
      })),
    },
  ];

  return sendList(sock, jid, {
    header:       '🔬 Message Laboratory',
    body:         `Select a message type to test.\n\nAll messages are sent to *this chat only* — nothing is posted publicly.\n\n${Object.keys(TESTS).length} tests available.`,
    footer:       BRAND_FOOTER,
    buttonText:   '📋 Open Test Menu',
    sections:     groups,
  }, rawMessage);
}

// ── Individual test runners ───────────────────────────────────────────────────

const runners = {

  // ── Interactive / NativeFlow ────────────────────────────────────────────────

  async interactive(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    return sendInteractiveWithImage(sock, jid, {
      header:  '🎛️ Interactive Message Test',
      image:   getRandomHeroImage('menu'),
      body:
        `This is a *sendInteractive()* test.\n\n` +
        `It renders a NativeFlow interactive message with:\n` +
        `• Header (image)\n` +
        `• Body text (markdown)\n` +
        `• Footer text\n` +
        `• Up to 3 buttons\n\n` +
        `All button types demonstrated below.`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('✅ Quick Reply', 'lab_qr_test'),
        ctaUrl('🌐 URL Button', 'https://cobalt.tools'),
        ctaCopy('📋 Copy Code', 'YUZUKI2025', 'promo_code'),
      ],
    }, rawMessage);
  },

  async nativeflow(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    try {
      await sock.sendMessage(
        jid,
        {
          text:       `🔘 *nativeFlowMessage test*\n\nRaw nativeFlow payload — 3 button row sent via sock.sendMessage.\nThis tests the proto-level nativeFlow rendering on cv3inx.`,
          nativeFlow: [
            { text: '🟢 Quick 1', id: 'nf_1' },
            { text: '🔵 Quick 2', id: 'nf_2' },
            { text: '🔴 Quick 3', id: 'nf_3' },
          ],
          footer: BRAND_FOOTER,
        },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ nativeFlow error: ${e.message}`);
    }
  },

  async list(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    return sendList(sock, jid, {
      header:     '📋 List Message Test',
      body:       'This is a *sendList()* test.\n\nSelect any option to see how list rows render.',
      footer:     BRAND_FOOTER,
      buttonText: '📋 Open List',
      sections: [
        {
          title: '🧠 AI Features',
          rows: [
            { header: '🤖', title: 'GPT Chat',       description: 'Send an AI message', id: 'lab_ai_1' },
            { header: '🌐', title: 'Translation',     description: 'Translate text',     id: 'lab_ai_2' },
            { header: '📝', title: 'Summarisation',   description: 'Summarise content',  id: 'lab_ai_3' },
          ],
        },
        {
          title: '📥 Downloaders',
          rows: [
            { header: '▶', title: 'YouTube',   description: 'Download video',   id: 'lab_dl_1' },
            { header: '🎵', title: 'TikTok',   description: 'Download clip',    id: 'lab_dl_2' },
            { header: '📸', title: 'Instagram', description: 'Download reel',   id: 'lab_dl_3' },
          ],
        },
      ],
    }, rawMessage);
  },

  async poll(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    return sendPoll(
      sock, jid,
      '🔬 Lab Poll — Which message type do you use most?',
      ['Interactive / NativeFlow', 'listMessage', 'carouselMessage', 'catalogMessage', 'nativeFlowMessage'],
      { allowMultiple: false, quoted: rawMessage }
    );
  },

  async carousel(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    return sendCarousel(sock, jid, {
      cards: [
        {
          header:  '🧠 AI Features',
          body:    'Chat with GPT, Gemini, or LLaMA.\nTranslate, summarise, debug code.',
          footer:  BRAND_FOOTER,
          buttons: [quickReply('▶ Try AI', 'cmd_ai')],
        },
        {
          header:  '📥 Downloader',
          body:    'YouTube, TikTok, Instagram, Twitter.\nHigh-quality, no watermark.',
          footer:  BRAND_FOOTER,
          buttons: [quickReply('📥 Download', 'cmd_dl')],
        },
        {
          header:  '🔍 Search',
          body:    'Web search, Wikipedia, YouTube search.\nPowered by DuckDuckGo.',
          footer:  BRAND_FOOTER,
          buttons: [quickReply('🔍 Search', 'cmd_search')],
        },
      ],
    }, rawMessage);
  },

  async collection(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    return sendCollection(sock, jid, {
      title:       'Yuzuki AI Products',
      description: 'Test collection card — cv3inx sendCollection()',
      products: [
        { id: 'prod_1', title: 'AI Premium', price: '9.99', currency: 'USD', description: 'Unlimited AI chats' },
        { id: 'prod_2', title: 'Media Pack', price: '4.99', currency: 'USD', description: 'Bulk downloader access' },
      ],
    }, rawMessage);
  },

  // ── Business messages ─────────────────────────────────────────────────────

  async catalog(ctx) {
    const { sock, chat: jid, rawMessage, sender } = ctx;

    try {
      const bs = getBusinessService();
      const result = await bs.getCatalog({ limit: 5 });
      const products = result.products ?? [];

      if (!products.length) {
        return ctx.reply(
          `📦 *Catalog empty or not a Business account.*\n\n` +
          `catalogMessage requires a WhatsApp Business account with products listed in the catalog.\n\n` +
          `Manage products: Meta Business Manager → WhatsApp → Commerce.`
        );
      }

      const lines = products.map((p, i) =>
        `*${i + 1}.* ${p.name ?? 'Product'} — ${p.currency ?? ''} ${p.price ?? '?'}`
      );

      return sendInteractive(sock, jid, {
        header:  '🛒 Catalog Test',
        body:    `Found *${products.length}* product(s):\n\n${lines.join('\n')}`,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('🔄 Refresh Catalog', 'lab_catalog')],
      }, rawMessage);
    } catch (e) {
      return ctx.reply(
        `⚠️ *getCatalog failed:*\n${e.message}\n\n` +
        `This method requires a WhatsApp Business account with sock.getCatalog() available.`
      );
    }
  },

  async order(ctx) {
    const { rawMessage: raw } = ctx;
    const orderMsg = raw?.message?.orderMessage;

    if (!orderMsg) {
      return ctx.reply(
        `📦 *orderMessage test*\n\n` +
        `Reply to a *WhatsApp Shop order message* with \`.lab order\` to inspect its fields.\n\n` +
        `Fields available:\n` +
        `• orderId, token\n` +
        `• itemCount, message\n` +
        `• orderTitle, sellerJid\n` +
        `• thumbnail, surface\n\n` +
        `_No orderMessage found in the quoted message._`
      );
    }

    const fields = Object.entries(orderMsg)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `• *${k}*: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');

    return ctx.reply(`📦 *orderMessage fields:*\n\n${fields}`);
  },

  async payment(ctx) {
    return ctx.reply(
      `💳 *paymentMessage test*\n\n` +
      `paymentMessage is sent by WhatsApp Pay when a payment is made.\n` +
      `It arrives as an inbound event — not sendable directly via Baileys.\n\n` +
      `*Fields to inspect on receipt:*\n` +
      `• amount1000, currencyCodeIso4217\n` +
      `• status (PAYMENT_ACTION_REQUEST / PAYMENT_ACTION_SENT / etc.)\n` +
      `• transactionTimestamp, expiryTimestamp\n` +
      `• requestFrom / sendTo JID\n` +
      `• noteMessage (optional note text)\n\n` +
      `_Listen for incoming paymentMessage in events/messages.js to handle live payments._`
    );
  },

  // ── Contact messages ──────────────────────────────────────────────────────

  async contact(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    const ownerNum = config.ownerNumber ?? '1234567890';

    const vcard =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:${config.botName ?? 'Yuzuki AI'}\n` +
      `ORG:Lab Test;\n` +
      `TEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\n` +
      `X-WA-BIZ-NAME:${config.botName ?? 'Yuzuki AI'}\n` +
      `END:VCARD`;

    try {
      await sock.sendMessage(
        jid,
        {
          contacts: {
            displayName: config.botName ?? 'Yuzuki AI',
            contacts: [{ vcard }],
          },
        },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ contactMessage failed: ${e.message}`);
    }
  },

  async contacts(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    const ownerNum = config.ownerNumber ?? '1234567890';

    const makeVcard = (name, num, org) =>
      `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${org};\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`;

    try {
      await sock.sendMessage(
        jid,
        {
          contacts: {
            displayName: 'Lab Contacts',
            contacts: [
              { vcard: makeVcard('Contact One',  ownerNum, 'Lab Test') },
              { vcard: makeVcard('Contact Two',  ownerNum, 'Lab Test') },
              { vcard: makeVcard('Contact Three', ownerNum, 'Lab Test') },
            ],
          },
        },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ multi-contact failed: ${e.message}`);
    }
  },

  // ── Media ─────────────────────────────────────────────────────────────────

  async location(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    try {
      await sock.sendMessage(
        jid,
        {
          location: {
            degreesLatitude:  1.3521,   // Singapore
            degreesLongitude: 103.8198,
            name:  'Yuzuki Lab Pin',
            address: 'Replit Cloud ☁',
          },
        },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ location failed: ${e.message}`);
    }
  },

  async image(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    const heroImage = getRandomHeroImage('ai');
    const content   = heroImage
      ? { image: heroImage, caption: `🖼️ *imageMessage test*\nFrom assets/hero/ai/ — cv3inx image send.\n_Rendered via sock.sendMessage({ image, caption })_` }
      : { image: { url: 'https://picsum.photos/720/480.jpg' }, caption: `🖼️ *imageMessage test* (remote URL)` };

    try {
      await sock.sendMessage(jid, content, rawMessage ? { quoted: rawMessage } : {});
    } catch (e) {
      return ctx.reply(`⚠️ imageMessage failed: ${e.message}`);
    }
  },

  async disappearing(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    const content = {
      image:   { url: 'https://picsum.photos/480/480.jpg' },
      viewOnce: true,
      caption: '👁️ view-once test',
    };
    try {
      await sock.sendMessage(jid, content, rawMessage ? { quoted: rawMessage } : {});
    } catch (e) {
      return ctx.reply(`⚠️ viewOnce failed: ${e.message}`);
    }
  },

  async sticker(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    try {
      await sock.sendMessage(
        jid,
        { sticker: { url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' } },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ sticker failed: ${e.message}\n\n_Note: sticker requires a valid WebP or gif buffer._`);
    }
  },

  async reaction(ctx) {
    const { sock, chat: jid, rawMessage } = ctx;
    if (!rawMessage) return ctx.reply('⚠️ Reply to a message to react to it.');
    try {
      await sendReaction(sock, jid, rawMessage, '🔬');
    } catch (e) {
      return ctx.reply(`⚠️ reaction failed: ${e.message}`);
    }
  },

  async mention(ctx) {
    const { sock, chat: jid, sender, rawMessage } = ctx;
    try {
      await sock.sendMessage(
        jid,
        { text: `🔬 mention test — @${sender.split('@')[0]}`, mentions: [sender] },
        rawMessage ? { quoted: rawMessage } : {}
      );
    } catch (e) {
      return ctx.reply(`⚠️ mention failed: ${e.message}`);
    }
  },

  // ── Newsletter ────────────────────────────────────────────────────────────

  async newsletter(ctx) {
    const channelJid = config.officialChannelJid;
    if (!channelJid) {
      return ctx.reply(
        `📢 *Newsletter / Channel test*\n\n` +
        `OFFICIAL_CHANNEL_JID is not configured.\n\n` +
        `Set it in .env:\n` +
        `\`OFFICIAL_CHANNEL_JID=120363XXXXXXXXXX@newsletter\`\n\n` +
        `Available newsletter operations (via NewsletterService):\n` +
        `• create(name, desc)\n` +
        `• updateName / updateDescription / updatePicture\n` +
        `• follow / unfollow / mute / unmute\n` +
        `• fetchMessages / reactMessage\n` +
        `• metadata / subscribers\n\n` +
        `_Read src/services/newsletter.js for full API._`
      );
    }

    try {
      const ns   = getNewsletterService();
      const meta = await ns.metadata(channelJid);
      return ctx.reply(
        `📢 *Newsletter metadata:*\n\n` +
        `Name: ${meta.name ?? '?'}\n` +
        `Subscribers: ${meta.subscribers ?? '?'}\n` +
        `JID: ${channelJid}\n\n` +
        `_Channel is live and reachable._`
      );
    } catch (e) {
      return ctx.reply(`⚠️ Newsletter error: ${e.message}`);
    }
  },
};

// ── List all tests ─────────────────────────────────────────────────────────────

function sendTestList(ctx) {
  const p = config.prefix;
  const lines = Object.entries(TESTS)
    .map(([key, t]) => `${t.icon} \`${p}lab ${key}\` — ${t.label}\n   _${t.desc}_`)
    .join('\n\n');

  return ctx.reply(
    `🔬 *Lab — All Tests (${Object.keys(TESTS).length})*\n\n${lines}\n\n` +
    `Use \`${p}lab\` to open the interactive menu.`
  );
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { args } = ctx;
  const sub = args[0]?.toLowerCase().replace(/-/g, '');

  if (!sub || sub === 'menu') return sendLabMenu(ctx);
  if (sub === 'list' || sub === 'all') return sendTestList(ctx);

  const runner = runners[sub];
  if (!runner) {
    return ctx.reply(
      `❌ Unknown lab test: *${sub}*\n\n` +
      `Use \`.lab list\` to see all available tests.`
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
