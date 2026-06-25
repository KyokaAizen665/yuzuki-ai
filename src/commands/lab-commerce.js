/**
 * Command: lab-commerce  (owner only)
 *
 * Commerce Message Laboratory — Yuzuki AI v2.0.0
 *
 * A dedicated developer sandbox for experimenting with WhatsApp commerce-based
 * message structures. Determines how modern WhatsApp clients render each type
 * and evaluates their potential as alternative menu containers.
 *
 * REQUIRES:  LAB_COMMERCE_MODE=true in .env
 *
 * ── Commands ─────────────────────────────────────────────────────────────────
 *
 *   .teststorefront  — shopStorefrontMessage (InteractiveMessage oneof)
 *   .testcollection  — collectionMessage     (InteractiveMessage oneof)
 *   .testcatalog     — catalogMessage        (Business catalog via getCatalog)
 *   .testproduct     — productMessage        (top-level proto.Message type)
 *   .testcommerce    — run all 4 tests in sequence, report each
 *
 * ── Proto reality (cv3inx fork) ──────────────────────────────────────────────
 *
 *   InteractiveMessage oneof body:
 *     "shopStorefrontMessage" → ShopMessage     { id, surface, messageVersion }
 *     "collectionMessage"     → CollectionMessage { bizJid, id, messageVersion }
 *     "nativeFlowMessage"     → NativeFlowMessage { buttons }
 *     "carouselMessage"       → CarouselMessage  { cards }
 *
 *   Commerce oneofs CANNOT coexist with nativeFlowMessage in the same message.
 *   The header/body/footer fields are still available for all oneof variants.
 *
 *   proto.Message.productMessage (top-level, not InteractiveMessage):
 *     { product: ProductSnapshot, businessOwnerJid, catalog: CatalogSnapshot }
 *     Requires a real WhatsApp Business account with a live catalog.
 *
 * ── Reporting ─────────────────────────────────────────────────────────────────
 *
 *   After each send attempt, a result card is returned:
 *     Message Type:          <type>
 *     Client Render Result:  Sent / Error
 *     Buttons Visible:       Yes / None / N/A
 *     Image Visible:         Included / Not included
 *     Footer Visible:        Included
 *
 * ── Logging ───────────────────────────────────────────────────────────────────
 *   [LAB] type=storefrontMessage status=sent
 *   [LAB] type=collectionMessage status=sent
 *   [LAB] type=catalogMessage    status=error reason=<msg>
 *   [LAB] type=productMessage    status=sent
 *
 * ── Guard ─────────────────────────────────────────────────────────────────────
 *   All handlers check config.labCommerceMode before running.
 *   If LAB_COMMERCE_MODE is not set to true, the command explains how to enable it.
 *   This prevents accidental use in production environments.
 */

import { log }                  from '../utils/logger.js';
import { config }               from '../config/index.js';
import { getRandomHeroImage }   from '../services/hero-images.js';
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { getBaileys }           from '../core/socket.js';
// ── Startup validation ────────────────────────────────────────────────────────
// Verify getBaileys() exposes the proto helpers this module depends on.
// Logs a clear warning instead of a cryptic runtime crash if Baileys changes.
try {
  const _b = getBaileys();
  if (!_b?.proto?.Message || typeof _b?.generateWAMessageFromContent !== 'function') {
    console.warn('[lab-commerce] ⚠ getBaileys() is missing proto.Message or generateWAMessageFromContent — carousel commands will fail at runtime');
  }
} catch (_e) {
  console.warn(`[lab-commerce] ⚠ getBaileys() validation threw: ${_e.message}`);
}

export const meta = {
  name:        'testcommerce',
  description: 'Commerce message laboratory — test shopStorefront, collection, catalog, product',
  category:    'owner',
  aliases:     ['teststorefront', 'testcollection', 'testcatalog', 'testproduct'],
  cooldown:    5,
  permission:  'owner',
};

const BRAND_FOOTER = `🧪 ${config.botName ?? 'Yuzuki AI'} Commerce Lab`;

// ── Guard ────────────────────────────────────────────────────────────────────

function guardLabMode(ctx) {
  if (config.labCommerceMode) return true;
  ctx.reply(
    `🔒 *Commerce Lab is disabled.*\n\n` +
    `To enable it, add the following to your \`.env\`:\n\n` +
    `\`LAB_COMMERCE_MODE=true\`\n\n` +
    `Then restart Yuzuki AI.\n\n` +
    `_This flag prevents accidental use of raw commerce proto payloads in production._`
  );
  return false;
}

// ── Alias resolver ────────────────────────────────────────────────────────────

/**
 * _resolveAlias(ctx) → string
 *
 * ctx.commandName always resolves to meta.name ('testcommerce').
 * Parse the actual typed command name from the raw message text so we can
 * route to the right test when an alias like .teststorefront was used.
 */
function _resolveAlias(ctx) {
  const p    = config.prefix;
  const body = ctx.rawMessage?.message?.conversation
            ?? ctx.rawMessage?.message?.extendedTextMessage?.text
            ?? '';
  const word = body.trim().slice(p.length).split(/\s+/)[0]?.toLowerCase() ?? '';
  const aliases = ['teststorefront', 'testcollection', 'testcatalog', 'testproduct', 'testcommerce'];
  return aliases.includes(word) ? word : 'testcommerce';
}

// ── Result card ───────────────────────────────────────────────────────────────

/**
 * _sendResult(ctx, opts) → Promise<void>
 *
 * Sends a standardised developer report card after each test attempt.
 * Always a plain interactive card — never a commerce proto — so it always renders.
 */
async function _sendResult(ctx, { type, status, error, imageIncluded, footerIncluded, buttonsInfo }) {
  const { sock, chat: jid, rawMessage } = ctx;
  const ok = status === 'sent';

  const body =
    `*Message Type:*\n${type}\n\n` +
    `*Client Render Result:*\n${ok ? '✅ Sent successfully' : `❌ Error — ${error ?? 'unknown'}`}\n\n` +
    `*Buttons Visible:*\n${buttonsInfo ?? 'N/A — commerce oneofs have no NativeFlow buttons'}\n\n` +
    `*Image Visible:*\n${imageIncluded ? 'Included in header' : 'Not included'}\n\n` +
    `*Footer Visible:*\n${footerIncluded ? 'Included' : 'Not included'}\n\n` +
    (ok
      ? `_Check your WhatsApp client to see how it rendered._`
      : `_Check logs for full stack trace._`);

  await sendInteractive(sock, jid, {
    header:  `🧪 Commerce Lab — ${type}`,
    body,
    footer:  BRAND_FOOTER,
    buttons: [quickReply('🔄 Run Again', `rerun_${type}`)],
  }, rawMessage).catch(() =>
    ctx.reply(`🧪 ${type}: ${ok ? '✅ sent' : `❌ ${error}`}`)
  );
}

// ── Individual test runners ───────────────────────────────────────────────────

/**
 * testStorefront — shopStorefrontMessage
 *
 * shopStorefrontMessage is one of the InteractiveMessage body oneofs.
 * ShopMessage proto: { id, surface (WA=3), messageVersion }
 *
 * The header/body/footer are still available.
 * NativeFlow buttons cannot be included — shopStorefrontMessage replaces
 * the nativeFlowMessage oneof body.
 *
 * Client rendering hypothesis: renders a tappable storefront card that
 * links to the business's WhatsApp Shop. Requires an active WA Business
 * catalog linked to the sending JID to show actual products.
 */
async function testStorefront(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const { proto, generateWAMessageFromContent } = getBaileys();
  const type = 'shopStorefrontMessage';

  log.info(`[LAB] type=${type} status=attempt`);

  let imageIncluded = false;

  try {
    const ShopMessage   = proto.Message.InteractiveMessage.ShopMessage;
    const Interactive   = proto.Message.InteractiveMessage;
    const Body          = proto.Message.InteractiveMessage.Body;
    const Footer        = proto.Message.InteractiveMessage.Footer;
    const Header        = proto.Message.InteractiveMessage.Header;

    const shopMsg = ShopMessage.create({
      id:             'lab_storefront_test',
      surface:        ShopMessage.Surface?.WA ?? 3,
      messageVersion: 1,
    });

    const headerFields = {
      title:            '🧪 Lab: shopStorefrontMessage',
      hasMediaAttachment: false,
    };

    const hero = getRandomHeroImage('menu');
    if (hero) {
      try {
        const imgMsg = await sock.proto?.Message?.ImageMessage?.create?.({ url: hero.url ?? hero })
                    ?? null;
        if (imgMsg) {
          headerFields.imageMessage  = imgMsg;
          headerFields.hasMediaAttachment = true;
          imageIncluded = true;
        }
      } catch { /* hero image optional */ }
    }

    const payload = generateWAMessageFromContent(
      jid,
      {
        interactiveMessage: Interactive.create({
          header:               Header.create(headerFields),
          body:                 Body.create({ text: 'This is a *shopStorefrontMessage* lab test.\n\nstorefront is a WhatsApp Shop link card. It requires a live Business catalog linked to this JID to render products.\n\n_No NativeFlow buttons can coexist with this oneof._' }),
          footer:               Footer.create({ text: BRAND_FOOTER }),
          shopStorefrontMessage: shopMsg,
        }),
      },
      { userJid: sock.user?.id, quoted: rawMessage }
    );

    await sock.relayMessage(jid, payload.message, { messageId: payload.key.id });
    log.info(`[LAB] type=${type} status=sent`);

    await _sendResult(ctx, {
      type, status: 'sent', imageIncluded, footerIncluded: true,
      buttonsInfo: 'None — shopStorefrontMessage replaces nativeFlowMessage oneof',
    });

  } catch (e) {
    log.error(`[LAB] type=${type} status=error reason=${e.message}`);
    await _sendResult(ctx, {
      type, status: 'error', error: e.message, imageIncluded, footerIncluded: true,
      buttonsInfo: 'N/A',
    });
  }
}

/**
 * testCollection — collectionMessage
 *
 * collectionMessage is one of the InteractiveMessage body oneofs.
 * CollectionMessage proto: { bizJid, id, messageVersion }
 *
 * Client rendering hypothesis: renders a "View Collection" storefront card
 * scoped to a specific catalog collection (category) within the shop.
 * Requires the bizJid to be a valid WA Business JID with an active catalog.
 */
async function testCollection(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const { proto, generateWAMessageFromContent } = getBaileys();
  const type = 'collectionMessage';
  const ownerJid = sock.user?.id ?? `${config.ownerNumber}@s.whatsapp.net`;

  log.info(`[LAB] type=${type} status=attempt`);

  let imageIncluded = false;

  try {
    const CollectionMessage = proto.Message.InteractiveMessage.CollectionMessage;
    const Interactive       = proto.Message.InteractiveMessage;
    const Body              = proto.Message.InteractiveMessage.Body;
    const Footer            = proto.Message.InteractiveMessage.Footer;
    const Header            = proto.Message.InteractiveMessage.Header;

    const collMsg = CollectionMessage.create({
      bizJid:         ownerJid,
      id:             'lab_collection_test',
      messageVersion: 1,
    });

    const headerFields = {
      title:              '🧪 Lab: collectionMessage',
      hasMediaAttachment: false,
    };

    const hero = getRandomHeroImage('menu');
    if (hero) {
      try {
        const rawHeroUrl = hero.url ?? hero;
        if (typeof rawHeroUrl === 'string') {
          headerFields.hasMediaAttachment = false;
        }
      } catch { /* hero image optional */ }
    }

    const payload = generateWAMessageFromContent(
      jid,
      {
        interactiveMessage: Interactive.create({
          header:            Header.create(headerFields),
          body:              Body.create({ text: 'This is a *collectionMessage* lab test.\n\ncollectionMessage links to a specific product collection in a WhatsApp Business catalog.\n\nbizJid must be a valid WA Business account JID with an active catalog.\n\n_No NativeFlow buttons can coexist with this oneof._' }),
          footer:            Footer.create({ text: BRAND_FOOTER }),
          collectionMessage: collMsg,
        }),
      },
      { userJid: sock.user?.id, quoted: rawMessage }
    );

    await sock.relayMessage(jid, payload.message, { messageId: payload.key.id });
    log.info(`[LAB] type=${type} status=sent`);

    await _sendResult(ctx, {
      type, status: 'sent', imageIncluded, footerIncluded: true,
      buttonsInfo: 'None — collectionMessage replaces nativeFlowMessage oneof',
    });

  } catch (e) {
    log.error(`[LAB] type=${type} status=error reason=${e.message}`);
    await _sendResult(ctx, {
      type, status: 'error', error: e.message, imageIncluded, footerIncluded: true,
      buttonsInfo: 'N/A',
    });
  }
}

/**
 * testCatalog — catalog inspection via getCatalog()
 *
 * catalogMessage is not a sendable top-level proto type in Baileys.
 * WhatsApp Business API catalog messages are sent by WhatsApp itself when
 * a user taps "View catalog" from the business chat. They are not send-initiatable
 * from Baileys.
 *
 * This test instead fetches the bot's catalog listing via sock.getCatalog()
 * and renders it — confirming catalog linkage and showing available products.
 *
 * If getCatalog() is not available (non-Business account), the test reports
 * the requirement and expected message structure.
 */
async function testCatalog(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const type = 'catalogMessage';
  log.info(`[LAB] type=${type} status=attempt`);

  const isBusiness = typeof sock.getCatalog === 'function'
                  || typeof sock.getBusinessProfile === 'function';

  if (!isBusiness) {
    log.info(`[LAB] type=${type} status=not-available reason=non-business-account`);
    await sendInteractive(sock, jid, {
      header:  '🧪 Lab: catalogMessage',
      body:
        `*catalogMessage is not sendable from Baileys.*\n\n` +
        `It is dispatched by WhatsApp servers when a customer taps "View catalog" from a Business chat. It arrives as an *inbound* event, not an outbound send.\n\n` +
        `*To experiment with catalog messages:*\n` +
        `• Use a WhatsApp Business account\n` +
        `• Link a product catalog in Meta Business Manager\n` +
        `• sock.getCatalog() returns your product listings\n` +
        `• sock.getProductsV2() returns paginated catalog items\n\n` +
        `*Fields on inbound catalogMessage:*\n` +
        `• catalogSnapshot.catalogId\n` +
        `• catalogSnapshot.title\n` +
        `• catalogSnapshot.description\n` +
        `• catalogSnapshot.thumbnailCdnUrl\n\n` +
        `_This account does not have getCatalog() available._`,
      footer:  BRAND_FOOTER,
      buttons: [quickReply('🔄 Try Again', 'lab_catalog_retry')],
    }, rawMessage);
    return;
  }

  try {
    const result   = await sock.getCatalog({ limit: 10 });
    const products = result?.products ?? [];
    log.info(`[LAB] type=${type} status=sent products=${products.length}`);

    const lines = products.length
      ? products.map((p, i) =>
          `*${i + 1}.* ${p.name ?? '?'} — ${p.currency ?? ''} ${(p.price / 1000).toFixed(2)}`
        ).join('\n')
      : '_No products found in catalog. Add products in Meta Business Manager._';

    await sendInteractive(sock, jid, {
      header:  '🛒 Lab: catalogMessage — Catalog Contents',
      body:    `*Found ${products.length} product(s):*\n\n${lines}\n\n_Catalog is live and reachable via getCatalog()._`,
      footer:  BRAND_FOOTER,
      buttons: [quickReply('🔄 Refresh', 'lab_catalog_refresh')],
    }, rawMessage);

    await _sendResult(ctx, {
      type, status: 'sent', imageIncluded: false, footerIncluded: true,
      buttonsInfo: 'N/A — catalog fetched, not sent as a commerce message',
    });
  } catch (e) {
    log.error(`[LAB] type=${type} status=error reason=${e.message}`);
    await _sendResult(ctx, {
      type, status: 'error', error: e.message, imageIncluded: false, footerIncluded: true,
      buttonsInfo: 'N/A',
    });
  }
}

/**
 * testProduct — proto.Message.productMessage (top-level)
 *
 * productMessage is a TOP-LEVEL WhatsApp message type (not inside InteractiveMessage).
 * It is used by WhatsApp Business to share a single product card.
 *
 * proto.Message.ProductMessage fields:
 *   product           ProductSnapshot  { productId, title, description, currencyCode,
 *                                        priceAmount1000, retailerId, url }
 *   businessOwnerJid  string           — the Business JID owning the product
 *   catalog           CatalogSnapshot  { catalogId, title }
 *
 * IMPORTANT: WhatsApp only renders this correctly if productId corresponds to
 * a real product in a live Business catalog. With stub data, the client may
 * show an error card or fail to render.
 *
 * This test sends a synthetic productMessage and documents the render result.
 */
async function testProduct(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const { proto, generateWAMessageFromContent } = getBaileys();
  const type = 'productMessage';
  const ownerJid = sock.user?.id ?? `${config.ownerNumber}@s.whatsapp.net`;

  log.info(`[LAB] type=${type} status=attempt`);

  try {
    const ProductMessage  = proto.Message.ProductMessage;
    const ProductSnapshot = proto.Message.ProductMessage.ProductSnapshot;
    const CatalogSnapshot = proto.Message.ProductMessage.CatalogSnapshot;

    const productMsg = ProductMessage.create({
      product: ProductSnapshot.create({
        productId:       'lab_product_001',
        title:           '🧪 Lab Product Test',
        description:     'Synthetic product for commerce lab testing. Not a real product.',
        currencyCode:    'USD',
        priceAmount1000: 999000,  // $999.00 in thousandths
        retailerId:      'LAB-001',
        url:             'https://wa.me/c/labtest',
      }),
      businessOwnerJid: ownerJid,
      catalog: CatalogSnapshot.create({
        catalogId: 'lab_catalog_001',
        title:     'Lab Test Catalog',
      }),
    });

    const payload = generateWAMessageFromContent(
      jid,
      { productMessage: productMsg },
      { userJid: sock.user?.id, quoted: rawMessage }
    );

    await sock.relayMessage(jid, payload.message, { messageId: payload.key.id });
    log.info(`[LAB] type=${type} status=sent`);

    await _sendResult(ctx, {
      type, status: 'sent', imageIncluded: false, footerIncluded: false,
      buttonsInfo: 'Built into product card UI — not NativeFlow buttons',
    });

  } catch (e) {
    log.error(`[LAB] type=${type} status=error reason=${e.message}`);
    await _sendResult(ctx, {
      type, status: 'error', error: e.message, imageIncluded: false, footerIncluded: false,
      buttonsInfo: 'N/A',
    });
  }
}

/**
 * testCommerce — run all 4 tests sequentially.
 *
 * Each test is awaited before the next starts so results arrive in order.
 * A short delay between tests avoids rate-limiting on the relay path.
 */
async function testCommerce(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;

  await sendInteractive(sock, jid, {
    header:  '🧪 Commerce Lab — Full Run',
    body:
      `Running all 4 commerce message experiments in sequence:\n\n` +
      `1️⃣ shopStorefrontMessage\n` +
      `2️⃣ collectionMessage\n` +
      `3️⃣ catalogMessage\n` +
      `4️⃣ productMessage\n\n` +
      `_Each test sends its proto payload then reports the result._`,
    footer:  BRAND_FOOTER,
    buttons: [quickReply('⏳ Running…', 'lab_commerce_running')],
  }, rawMessage).catch(() => {});

  const delay = ms => new Promise(r => setTimeout(r, ms));

  await testStorefront(ctx);  await delay(600);
  await testCollection(ctx);  await delay(600);
  await testCatalog(ctx);     await delay(600);
  await testProduct(ctx);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(ctx) {
  if (!guardLabMode(ctx)) return;

  const alias = _resolveAlias(ctx);
  log.info(`[LAB] commerce lab triggered alias=${alias} sender=${ctx.sender}`);

  try { await ctx.react('🧪'); } catch {}

  try {
    switch (alias) {
      case 'teststorefront':  return await testStorefront(ctx);
      case 'testcollection':  return await testCollection(ctx);
      case 'testcatalog':     return await testCatalog(ctx);
      case 'testproduct':     return await testProduct(ctx);
      case 'testcommerce':
      default:                return await testCommerce(ctx);
    }
  } catch (e) {
    log.error(`[LAB] commerce handler threw: ${e.message}`);
    return ctx.reply(`⚠️ Commerce lab error:\n${e.message}`);
  }
}