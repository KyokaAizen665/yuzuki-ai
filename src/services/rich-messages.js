/**
   * RichMessageService — Phase 5 (cv3inx Runtime Fix)
   *
   * Production-ready service for all advanced WhatsApp message types.
   * Abstracts raw proto/baileys complexity so commands operate at a
   * clean semantic level.
   *
   * ── RUNTIME FIX (cv3inx compatibility) ──────────────────────────────────────
   * cv3inx's generateWAMessageContent has an `else` catch-all that calls
   * prepareWAMessageMedia() for any unrecognised top-level key.
   * Passing { interactiveMessage: {...} } or { listMessage: {...} } directly
   * to sock.sendMessage() hits that catch-all → "Invalid media type".
   *
   * Fix: add `raw: true` to the content object. cv3inx handles this explicitly:
   *   if (hasNonNullishProperty(message, 'raw')) {
   *     delete message.raw;
   *     return message;   ← bypasses prepareWAMessageMedia entirely
   *   }
   * The proto-level message object is then forwarded to generateWAMessageFromContent
   * which correctly identifies interactiveMessage / listMessage via getContentType().
   *
   * ── NativeFlow Interactive Messages ─────────────────────────────────────────
   * sendInteractive()       — NativeFlow interactive message with buttons
   * Builders: ctaUrl, ctaCall, ctaCopy, quickReply, singleSelect
   *
   * ── Rich Text (AI-friendly) ──────────────────────────────────────────────────
   * sendMarkdown()          — WhatsApp-formatted text
   * sendCode()              — monospace code block
   * sendTable()             — ASCII table
   * sendCitation()          — quoted source with attribution
   * sendRichResponse()      — multi-section AI response
   * sendAIRichResponse()    — structured AI output (code, table, citation)
   *
   * ── Standard Features ────────────────────────────────────────────────────────
   * sendPoll()              — native WhatsApp poll
   * sendReaction()          — emoji reaction
   * sendCarousel()          — multi-card carousel (proto-level)
   * sendList()              — list message with sections/rows
   *
   * ── Business / AI ────────────────────────────────────────────────────────────
   * sendCollection()        — shop storefront / collection message
   * sendInteractiveAsTemplate() — template-rendered interactive
   *
   * NativeFlow button params reference:
   *   cta_url    : { display_text, url, merchant_url }
   *   cta_call   : { display_text, phone_number }
   *   cta_copy   : { display_text, id, copy_code }
   *   quick_reply: { display_text, id, variables? }
   *   single_select: { title, sections: [{ title, rows: [{ header, title, description, id }] }] }
   *
   * Offer / commerce params (interactiveMessage extensions):
   *   offerText, offerExpiration, offerUrl, offerCode (attach as body text or footer)
   *   optionText / optionTitle → use singleSelect sections
   */

  import { createRequire } from 'module';
  import { log } from '../utils/logger.js';

  const _req = createRequire(import.meta.url);

  // Lazy-load baileys to avoid breaking startup if not installed yet
  let _baileysMod = null;
  function getBaileys() {
    if (!_baileysMod) {
      try { _baileysMod = _req('baileys'); }
      catch (e) { throw new Error(`[rich-messages] Failed to load baileys: ${e.message}`); }
    }
    return _baileysMod;
  }

  // ── NativeFlow Button Builders ────────────────────────────────────────────────

  /**
   * ctaUrl(displayText, url, merchantUrl?) → NativeFlowButton
   * Opens a URL in WhatsApp's in-app browser.
   */
  export function ctaUrl(displayText, url, merchantUrl) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text:  displayText,
        url,
        merchant_url:  merchantUrl ?? url,
      }),
    };
  }

  /**
   * ctaCall(displayText, phoneNumber) → NativeFlowButton
   * Initiates a phone call.
   */
  export function ctaCall(displayText, phoneNumber) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text: displayText,
        phone_number: phoneNumber,
      }),
    };
  }

  /**
   * ctaCopy(displayText, copyCode, id?) → NativeFlowButton
   * Copies text to clipboard with a confirmation toast.
   */
  export function ctaCopy(displayText, copyCode, id) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: displayText,
        id:           id ?? 'copy_code',
        copy_code:    copyCode,
      }),
    };
  }

  /**
   * quickReply(displayText, id, variables?) → NativeFlowButton
   * Quick reply button that echoes a predefined message.
   */
  export function quickReply(displayText, id, variables) {
    const params = { display_text: displayText, id };
    if (variables) params.variables = variables;
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify(params) };
  }

  /**
   * singleSelect(title, sections) → NativeFlowButton
   * Dropdown list selector.
   *
   * sections: [{ title, rows: [{ header?, title, description?, id }] }]
   */
  export function singleSelect(title, sections) {
    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title, sections }),
    };
  }

  /** All button builders in one object for convenient import */
  export const buttons = { ctaUrl, ctaCall, ctaCopy, quickReply, singleSelect };

  // ── Interactive Message Sender ────────────────────────────────────────────────

  /**
   * sendInteractive(sock, jid, opts, quoted?) → Promise<void>
   *
   * Sends a NativeFlow interactive message. Works on both personal and
   * business WhatsApp accounts.
   *
   * cv3inx fix: `raw: true` is added so generateWAMessageContent skips its
   * else-catch-all (which calls prepareWAMessageMedia and throws
   * "Invalid media type" for unrecognised top-level keys).
   *
   * @param {object} opts
   * @param {string}           [opts.header]             — header text
   * @param {string}           opts.body                 — main body (required)
   * @param {string}           [opts.footer]             — footer text
   * @param {Array}            opts.buttons              — NativeFlowButton[]
   * @param {boolean}          [opts.useWebview]         — open URLs in webview
   * @param {string}           [opts.messageParamsJson]  — custom message params JSON
   */
  export async function sendInteractive(sock, jid, opts, quoted) {
    const {
      body, footer, buttons: btns = [], header,
      useWebview, messageParamsJson,
    } = opts;

    // raw: true → cv3inx's generateWAMessageContent returns the object directly,
    // bypassing the else-catch-all that calls prepareWAMessageMedia() and throws
    // "Invalid media type" for proto-level keys it does not recognise.
    const content = {
      raw: true,
      interactiveMessage: {
        header: {
          hasMediaAttachment: false,
          ...(header ? { title: header } : {}),
        },
        body:   { text: body },
        footer: footer ? { text: footer } : undefined,
        nativeFlowMessage: {
          buttons:            btns,
          messageParamsJson:  messageParamsJson ?? '',
          ...(useWebview !== undefined ? { useWebview } : {}),
        },
      },
    };

    log.debug({ jid, header, btns: btns.length }, '[rich-messages] sendInteractive payload');

    try {
      await sock.sendMessage(jid, content, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendInteractive failed: ${e.message}`);
      throw e;
    }
  }


  // ── Interactive Message with Hero Image ───────────────────────────────────────

  /**
   * sendInteractiveWithImage(sock, jid, opts, quoted?) → Promise<void>
   *
   * Like sendInteractive but with a hero image in the card.
   * Uses cv3inx's { image, caption, nativeFlow, footer } path — the same code
   * path that help.js uses for the main menu — so it is proven to work.
   *
   * When 'image' is omitted or the image path throws, falls back automatically
   * to sendInteractive (text-only header) so the card is never silent.
   *
   * Button objects from quickReply / ctaCall / ctaUrl / ctaCopy are passed
   * directly as the 'nativeFlow' array; cv3inx processes both the simple
   * { text, id } format AND the proto-level { name, buttonParamsJson } format.
   *
   * @param {object} opts
   * @param {{ url: string }|{ data: Buffer }} [opts.image]  — getRandomHeroImage()
   * @param {string}   opts.body     — caption / body text
   * @param {string}   [opts.footer] — footer text
   * @param {Array}    opts.buttons  — NativeFlowButton[]
   * @param {string}   [opts.header] — used only in the text fallback path
   */
  export async function sendInteractiveWithImage(sock, jid, opts, quoted) {
    const { image, body, footer, buttons: btns = [] } = opts;

    if (!image) {
      return sendInteractive(sock, jid, opts, quoted);
    }

    try {
      await sock.sendMessage(
        jid,
        {
          image,
          caption:    body,
          nativeFlow: btns,
          ...(footer ? { footer } : {}),
        },
        quoted ? { quoted } : {},
      );
    } catch (e) {
      log.warn(`[rich-messages] sendInteractiveWithImage image path failed (${e.message}) — text fallback`);
      // Fallback: send without image so the interactive card always appears
      await sendInteractive(sock, jid, { ...opts, image: undefined }, quoted);
    }
  }

  // ── Poll ──────────────────────────────────────────────────────────────────────

  /**
   * sendPoll(sock, jid, question, options, opts?) → Promise<void>
   *
   * @param {string}   question  — poll question
   * @param {string[]} options   — 2–12 option strings
   * @param {{ selectableCount?: number, quoted?: object }} [opts]
   */
  export async function sendPoll(sock, jid, question, options, opts = {}) {
    if (!Array.isArray(options) || options.length < 2 || options.length > 12) {
      throw new Error('[rich-messages] Poll requires 2–12 options');
    }
    try {
      await sock.sendMessage(
        jid,
        { poll: { name: question, values: options, selectableCount: opts.selectableCount ?? 1 } },
        opts.quoted ? { quoted: opts.quoted } : {},
      );
    } catch (e) {
      log.error(`[rich-messages] sendPoll failed: ${e.message}`);
      throw e;
    }
  }

  // ── Reaction ──────────────────────────────────────────────────────────────────

  /**
   * sendReaction(sock, jid, key, emoji) → Promise<void>
   *
   * React to a message. Pass emoji='' to remove the reaction.
   *
   * @param {object} key   — message key { id, remoteJid, fromMe }
   * @param {string} emoji — emoji or '' to remove
   */
  export async function sendReaction(sock, jid, key, emoji) {
    try {
      await sock.sendMessage(jid, { react: { text: emoji, key } });
    } catch (e) {
      log.error(`[rich-messages] sendReaction failed: ${e.message}`);
      throw e;
    }
  }

  // ── List Message ──────────────────────────────────────────────────────────────

  /**
   * sendList(sock, jid, opts, quoted?) → Promise<void>
   *
   * cv3inx fix: `raw: true` added — see sendInteractive for explanation.
   *
   * @param {object} opts
   * @param {string} opts.title        — header title
   * @param {string} opts.description  — body text
   * @param {string} opts.buttonText   — button label
   * @param {string} [opts.footer]     — optional footer
   * @param {Array}  opts.sections     — [{ title, rows: [{ id, title, description? }] }]
   */
  export async function sendList(sock, jid, opts, quoted) {
    const { title, description, buttonText, footer, sections } = opts;

    // raw: true → bypasses cv3inx else-catch-all → prepareWAMessageMedia not called
    const content = {
      raw: true,
      listMessage: {
        title, description, buttonText,
        footerText: footer ?? '',
        listType:   1, // SINGLE_SELECT
        sections,
      },
    };

    log.debug({ jid, title, sections: sections?.length }, '[rich-messages] sendList payload');

    try {
      await sock.sendMessage(
        jid,
        content,
        quoted ? { quoted } : {},
      );
    } catch (e) {
      log.error(`[rich-messages] sendList failed: ${e.message}`);
      throw e;
    }
  }

  // ── Rich Text Helpers ─────────────────────────────────────────────────────────

  /**
   * sendMarkdown(sock, jid, text, quoted?) → Promise<void>
   *
   * WhatsApp markdown: *bold* _italic_ ~strikethrough~ ```code```
   * Pass pre-formatted WA markdown — no conversion is performed.
   */
  export async function sendMarkdown(sock, jid, text, quoted) {
    try {
      await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendMarkdown failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * sendCode(sock, jid, code, language?, quoted?) → Promise<void>
   *
   * Sends a monospace code block using WhatsApp's ```code``` syntax.
   * Optionally prefixes with the language name in bold.
   */
  export async function sendCode(sock, jid, code, language, quoted) {
    const header = language ? `*${language}*\n` : '';
    const text   = `${header}\`\`\`${code}\`\`\``;
    try {
      await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendCode failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * sendTable(sock, jid, headers, rows, title?, quoted?) → Promise<void>
   *
   * @deprecated Use renderTable() from services/table-renderer.js instead.
   *             This function renders ASCII/Unicode box-drawing art which is
   *             prohibited in the Yuzuki style guide (no ASCII boxes, no fake UI).
   *             Retained as an internal last-resort fallback ONLY.
   *             External callers: use renderTable(ctx, { title, columns, rows }).
   *
   * @param {string[]} headers  — column names
   * @param {Array[]}  rows     — array of row arrays
   * @param {string}   [title]  — optional title above table
   */
  export async function sendTable(sock, jid, headers, rows, title, quoted) {
    const cols    = headers.length;
    const allRows = [headers, ...rows];
    const widths  = Array.from({ length: cols }, (_, i) =>
      Math.max(...allRows.map(r => String(r[i] ?? '').length)),
    );

    const topBorder = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    const divider   = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    const botBorder = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
    const fmtRow    = row =>
      '│' + row.map((cell, i) => ` ${String(cell ?? '').padEnd(widths[i])} `).join('│') + '│';

    const tableStr = [topBorder, fmtRow(headers), divider, ...rows.map(fmtRow), botBorder].join('\n');
    const text     = title
      ? `*${title}*\n\`\`\`\n${tableStr}\n\`\`\``
      : `\`\`\`\n${tableStr}\n\`\`\``;

    try {
      await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendTable failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * sendCitation(sock, jid, opts, quoted?) → Promise<void>
   *
   * Sends a citation: source attribution + quoted content + optional comment.
   *
   * @param {{ source: string, content: string, comment?: string }} opts
   */
  export async function sendCitation(sock, jid, opts, quoted) {
    const { source, content, comment } = opts;
    const body = `📎 *${source}*\n\n> ${content.split('\n').join('\n> ')}`
      + (comment ? `\n\n${comment}` : '');
    try {
      await sock.sendMessage(jid, { text: body }, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendCitation failed: ${e.message}`);
      throw e;
    }
  }

  // ── AI Rich Response ──────────────────────────────────────────────────────────

  /**
   * sendRichResponse(sock, jid, opts, quoted?) → Promise<void>
   *
   * Structured multi-section AI response. Appends sections to the main text
   * then sends as interactive (if actions) or plain text (if not).
   *
   * @param {object} opts
   * @param {string}  opts.text          — main response text
   * @param {Array}   [opts.sections]    — [{ type, content, language?, source? }]
   *   types: 'code' | 'table' | 'citation' | 'heading' | 'list'
   * @param {Array}   [opts.actions]     — NativeFlowButton[] to append
   * @param {string}  [opts.footer]      — attribution / model info
   * @param {boolean} [opts.split]       — split at 4 096-char boundaries
   */
  export async function sendRichResponse(sock, jid, opts, quoted) {
    const { text, sections = [], actions = [], footer, split } = opts;

    let fullText = text;
    for (const sec of sections) {
      fullText += '\n\n';
      switch (sec.type) {
        case 'code':
          fullText += sec.language
            ? `*${sec.language}*\n\`\`\`${sec.content}\`\`\``
            : `\`\`\`${sec.content}\`\`\``;
          break;
        case 'heading':
          fullText += `*${sec.content}*`;
          break;
        case 'list':
          fullText += Array.isArray(sec.content)
            ? sec.content.map((item, i) => `${i + 1}. ${item}`).join('\n')
            : sec.content;
          break;
        case 'citation':
          fullText += `📎 *${sec.source ?? 'Source'}*\n> ${String(sec.content).split('\n').join('\n> ')}`;
          break;
        default:
          fullText += String(sec.content ?? '');
      }
    }

    if (actions.length > 0) {
      return sendInteractive(sock, jid, {
        body:    fullText.slice(0, 1024),
        footer:  footer ?? '',
        buttons: actions,
      }, quoted);
    }

    const MAX = 4096;
    if (split && fullText.length > MAX) {
      const chunks = [];
      let rem = fullText;
      while (rem.length > 0) {
        const chunk   = rem.slice(0, MAX);
        const splitAt = chunk.lastIndexOf('\n\n');
        const cutAt   = splitAt > MAX / 2 ? splitAt : MAX;
        chunks.push(rem.slice(0, cutAt).trim());
        rem = rem.slice(cutAt).trim();
      }
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const msg    = isLast && footer ? `${chunks[i]}\n\n_${footer}_` : chunks[i];
        await sock.sendMessage(jid, { text: msg }, i === 0 && quoted ? { quoted } : {});
      }
      return;
    }

    const finalText = footer ? `${fullText}\n\n_${footer}_` : fullText;
    try {
      await sock.sendMessage(jid, { text: finalText }, quoted ? { quoted } : {});
    } catch (e) {
      log.error(`[rich-messages] sendRichResponse failed: ${e.message}`);
      throw e;
    }
  }

  // ── Native table helper (used by sendAIRichResponse) ─────────────────────
  //
  // Renders a parsed markdown table using native WhatsApp structures.
  // 2-col ≤12 rows → sendList (native tappable list).
  // Multi-col or sendList failure → sendInteractive with WA-markdown body.
  // No ASCII/box-drawing is ever produced.

  async function _sendNativeTable(sock, jid, tbl, footer, quoted) {
    const { headers = [], rows = [], title } = tbl;
    if (!rows.length) return;

    const isKeyValue = headers.length === 2 && rows.length <= 12;

    if (isKeyValue) {
      try {
        await sendList(sock, jid, {
          title:       title ?? headers[0] ?? 'Data',
          description: '',
          buttonText:  'View',
          footer:      footer ?? '',
          sections: [{
            title: title ?? '',
            rows:  rows.map((row, i) => ({
              id:          `ai_tbl_${i}`,
              title:       String(row[0] ?? ''),
              description: String(row[1] ?? ''),
            })),
          }],
        }, quoted);
        return;
      } catch { /* fall through to interactive */ }
    }

    // Multi-column or sendList failure → WA-markdown interactive body
    const sep      = ' · ';
    const bodyLines = [
      title ? `*${title}*` : null,
      '*' + headers.join(sep) + '*',
      ...rows.map(row => row.map(c => String(c ?? '')).join(sep)),
    ].filter(Boolean);

    await sendInteractive(sock, jid, {
      header:  title ?? 'Table',
      body:    bodyLines.join('\n').slice(0, 1024),
      footer:  footer ?? '',
      buttons: [],
    }, quoted).catch(() => {
      // absolute last resort — plain text, no box drawing
      const text = bodyLines.join('\n');
      return sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
    });
  }

  /**
   * sendAIRichResponse(sock, jid, aiResponse, quoted?) → Promise<void>
   *
   * Processes a structured AI response object and renders it in WhatsApp.
   * Compatible with Gemini, Claude, OpenAI, Groq, and Pollinations output.
   *
   * aiResponse shape (all fields optional except text):
   * {
   *   text:              string,
   *   codeBlocks?:       [{ language, code }],
   *   tables?:           [{ headers, rows, title? }],
   *   citations?:        [{ source, content }],
   *   suggestedPrompts?: string[],   ← rendered as quick_reply buttons
   *   model?:            string,
   *   provider?:         string,
   *   tokens?:           number,
   * }
   */
  export async function sendAIRichResponse(sock, jid, aiResponse, quoted) {
    const {
      text = '',
      codeBlocks = [],
      tables     = [],
      citations  = [],
      suggestedPrompts = [],
      model,
      provider,
      tokens,
    } = aiResponse;

    const sections = [
      ...codeBlocks.map(cb => ({ type: 'code',     content: cb.code,    language: cb.language })),
      ...citations.map(c  => ({ type: 'citation',  content: c.content,  source:   c.source    })),
    ];

    // Attribution footer
    const footerParts = [provider, model, tokens ? `${tokens} tokens` : ''].filter(Boolean);
    const footer      = footerParts.length ? footerParts.join(' · ') : undefined;

    // Suggested prompts → quick_reply buttons (max 3)
    const actions = suggestedPrompts.slice(0, 3).map((p, i) =>
      quickReply(p.slice(0, 20), `suggest_${i}`),
    );

    await sendRichResponse(sock, jid, { text, sections, actions, footer, split: true }, quoted);

    // Render parsed markdown tables natively — no ASCII/box-drawing
    for (const [i, tbl] of tables.entries()) {
      await _sendNativeTable(sock, jid, tbl, footer, i === 0 ? quoted : undefined)
        .catch(e => log.debug(`[rich-messages] table ${i} render skipped: ${e.message}`));
    }
  }

  // ── Carousel (proto-level) ────────────────────────────────────────────────────

  /**
   * sendCarousel(sock, jid, opts, quoted?) → Promise<void>
   *
   * Multi-card carousel. Uses generateWAMessageFromContent + relayMessage.
   * Falls back to a numbered text list if proto construction fails.
   *
   * @param {object} opts
   * @param {string}  opts.body    — body text shown above carousel
   * @param {Array}   opts.cards   — [{ header?, imageUrl?, body, footer?, buttons }]
   */
  export async function sendCarousel(sock, jid, opts, quoted) {
    const { body, cards = [] } = opts;
    if (!cards.length) throw new Error('[rich-messages] sendCarousel requires at least 1 card');

    try {
      const { proto, generateWAMessageFromContent } = getBaileys();

      const protoCards = cards.map(card => {
        const headerObj = card.imageUrl
          ? {
              hasMediaAttachment: true,
              imageMessage: proto.Message.ImageMessage.create({
                url:        card.imageUrl,
                mimetype:   'image/jpeg',
                fileLength: 0,   // prevent undefined uint64 → NaN → Buffer.alloc(NaN) crash
              }),
            }
          : { hasMediaAttachment: false, title: card.header ?? '' };

        return proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create(headerObj),
          body:   proto.Message.InteractiveMessage.Body.create({ text: card.body }),
          ...(card.footer
            ? { footer: proto.Message.InteractiveMessage.Footer.create({ text: card.footer }) }
            : {}),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons:           card.buttons ?? [],
            messageParamsJson: '',
          }),
        });
      });

      const msg = generateWAMessageFromContent(
        jid,
        {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body:             proto.Message.InteractiveMessage.Body.create({ text: body }),
            carouselMessage:  proto.Message.InteractiveMessage.CarouselMessage.create({ cards: protoCards }),
          }),
        },
        { userJid: sock.user?.id, quoted },
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    } catch (e) {
      log.warn(`[rich-messages] sendCarousel proto path failed (${e.message}) — text fallback`);
      const fallback = [body, '', ...cards.map((c, i) => `${i + 1}. ${c.body}`)].join('\n');
      await sock.sendMessage(jid, { text: fallback }, quoted ? { quoted } : {});
    }
  }

  // ── Collection / Shop Storefront ──────────────────────────────────────────────

  /**
   * sendCollection(sock, jid, opts, quoted?) → Promise<void>
   *
   * Sends a shop collection / storefront message.
   * Requires a WhatsApp Business account with a catalog.
   *
   * @param {{ bizJid: string, id: string, title?: string }} opts
   */
  export async function sendCollection(sock, jid, opts, quoted) {
    const { bizJid, id, title } = opts;
    try {
      const { proto, generateWAMessageFromContent } = getBaileys();
      // Correct proto class is ShopMessage (not ShopStorefrontMessage)
      const shopMsg = proto.Message.InteractiveMessage.ShopMessage?.create?.({ bizJid, id })
                   ?? { bizJid, id };

      const msg = generateWAMessageFromContent(
        jid,
        {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            ...(title ? { body: proto.Message.InteractiveMessage.Body.create({ text: title }) } : {}),
            shopStorefrontMessage: shopMsg,
          }),
        },
        { userJid: sock.user?.id, quoted },
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    } catch (e) {
      log.error(`[rich-messages] sendCollection failed: ${e.message}`);
      throw e;
    }
  }

  // ── Interactive As Template ───────────────────────────────────────────────────

  /**
   * sendInteractiveAsTemplate(sock, jid, opts, quoted?) → Promise<void>
   *
   * Renders an interactive message via the WA template path.
   * Requires a WhatsApp Business account with an approved template.
   *
   * @param {{ header?, body?, footer?, buttons?: HydratedTemplateButton[] }} opts
   */
  export async function sendInteractiveAsTemplate(sock, jid, opts, quoted) {
    try {
      const { proto, generateWAMessageFromContent } = getBaileys();
      const msg = generateWAMessageFromContent(
        jid,
        {
          templateMessage: proto.Message.TemplateMessage.create({
            hydratedTemplate: proto.Message.TemplateMessage.HydratedFourRowTemplate.create({
              hydratedContentText: opts.body   ?? '',
              hydratedFooterText:  opts.footer ?? '',
              hydratedTitleText:   opts.header ?? '',
              hydratedButtons: (opts.buttons ?? []).map(b =>
                proto.HydratedTemplateButton.create(b)
              ),
            }),
          }),
        },
        { userJid: sock.user?.id, quoted },
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    } catch (e) {
      log.error(`[rich-messages] sendInteractiveAsTemplate failed: ${e.message}`);
      throw e;
    }
  }

  // ── AI Text Parser ────────────────────────────────────────────────────────────

  /**
   * parseAIText(text) → { text, codeBlocks }
   *
   * Extracts fenced code blocks (```lang\ncode```) from raw AI response text.
   * Returns cleaned text (code blocks removed) + array of { language, code }.
   *
   * @param {string} rawText
   * @returns {{ text: string, codeBlocks: { language: string, code: string }[] }}
   */
  export function parseAIText(rawText) {
    if (!rawText) return { text: '', codeBlocks: [], tables: [] };

    // ── Step 1: Extract fenced code blocks ───────────────────────────────────
    const codeBlocks = [];
    const CODE_FENCE = /```(\w+)?\n?([\s\S]*?)```/g;
    let match;

    while ((match = CODE_FENCE.exec(rawText)) !== null) {
      const lang = match[1]?.trim() || 'text';
      const code = match[2]?.trim() || '';
      if (code) codeBlocks.push({ language: lang, code });
    }

    // Remove code blocks before table extraction to avoid false positives
    let intermediate = rawText
      .replace(/```(\w+)?\n?[\s\S]*?```/g, '\u0000')
      .trim();

    // ── Step 2: Extract markdown tables ──────────────────────────────────────
    const tables = [];
    const TABLE_BLOCK = /(\|.+\|[ \t]*\n)([ \t]*\|[ \t]*[-:]+[ \t]*\|[ \t\-:|]*\n)((?:\|.+\|[ \t]*\n?)+)/gm;

    let tableMatch;
    while ((tableMatch = TABLE_BLOCK.exec(intermediate)) !== null) {
      const headerLine = tableMatch[1].trim();
      const dataBlock  = tableMatch[3].trim();
      const parseRow = (line) =>
        line.split('|').slice(1, -1).map(cell => cell.trim());
      const headers = parseRow(headerLine);
      const rows    = dataBlock
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('|') && l.endsWith('|'))
        .map(parseRow);
      if (headers.length >= 2 && rows.length >= 1) {
        tables.push({ headers, rows });
      }
    }

    // Remove matched table blocks from text
    intermediate = intermediate.replace(TABLE_BLOCK, '\u0000');

    // ── Step 3: Clean up ─────────────────────────────────────────────────────
    const cleanText = intermediate
      .replace(/\u0000+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      text:       cleanText || rawText,
      codeBlocks,
      tables,
    };
  }

  // ── cv3inx Native AI Rich Response ───────────────────────────────────────────

  /**
   * sendNativeAIResponse(sock, jid, opts, quoted?) → Promise<void>
   *
   * Sends an AIRichResponseMessage using the cv3inx proto format.
   * Uses proto.AIRichResponseMessage with unifiedResponse (toUnified JSON).
   * Falls back to sendAIRichResponse() if proto construction fails.
   *
   * @param {object} opts  — same shape as sendAIRichResponse
   */
  export async function sendNativeAIResponse(sock, jid, opts, quoted) {
    try {
      const { proto, generateWAMessageFromContent } = getBaileys();

      // Dynamically import cv3inx rich-message-utils (may not exist in all builds)
      const richUtils = await import('baileys/lib/Utils/rich-message-utils.js').catch(() => null);
      const richTypes = await import('baileys/lib/Types/RichType.js').catch(() => null);

      if (!richUtils || !richTypes) throw new Error('rich-message-utils not available');

      const { toUnified, tokenizeCode } = richUtils;
      const { RichSubMessageType }      = richTypes;

      const submessages = [];

      // Main text block
      if (opts.text?.trim()) {
        submessages.push({
          messageType: RichSubMessageType.TEXT,
          messageText: opts.text.trim(),
        });
      }

      // Code blocks
      for (const cb of (opts.codeBlocks ?? [])) {
        const tokenized = tokenizeCode(cb.code, cb.language ?? 'javascript');
        submessages.push({
          messageType:  RichSubMessageType.CODE,
          codeMetadata: {
            codeLanguage: cb.language ?? 'javascript',
            codeBlocks:   tokenized?.codeBlocks ?? [],
          },
        });
      }

      if (!submessages.length) throw new Error('No submessages to send');

      const unified = toUnified(submessages);

      const richMsg = proto.AIRichResponseMessage.create({
        messageType:     1, // AI_RICH_RESPONSE_TYPE_STANDARD
        unifiedResponse: proto.AIRichResponseUnifiedResponse.create({
          data: Buffer.from(JSON.stringify(unified)),
        }),
      });

      const msg = generateWAMessageFromContent(
        jid,
        { richResponseMessage: richMsg },
        { userJid: sock.user?.id, quoted },
      );

      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });

      // Send suggested prompts as a follow-up interactive if any
      if (opts.suggestedPrompts?.length) {
        const actions = opts.suggestedPrompts.slice(0, 3).map((p, i) =>
          quickReply(p.slice(0, 20), `suggest_${i}`)
        );
        await sendInteractive(sock, jid, {
          body:    `_💡 Continue the conversation:_`,
          footer:  opts.provider ? `${opts.provider}${opts.model ? ` · ${opts.model}` : ''}` : '',
          buttons: actions,
        }, quoted).catch(() => {});
      }

    } catch (e) {
      log.debug(`[rich-messages] sendNativeAIResponse proto path failed (${e.message}) — fallback`);
      await sendAIRichResponse(sock, jid, opts, quoted);
    }
  }

  // ── Service bundle ────────────────────────────────────────────────────────────

  export const RichMessageService = {
    // NativeFlow / Interactive
    sendInteractive,
    sendInteractiveWithImage,
    sendCarousel,
    sendCollection,
    sendList,
    sendInteractiveAsTemplate,
    // Polls / Reactions
    sendPoll,
    sendReaction,
    // Rich text
    sendMarkdown,
    sendCode,
    sendTable,
    sendCitation,
    sendRichResponse,
    // AI
    sendAIRichResponse,
    sendNativeAIResponse,
    parseAIText,
    // Button builders
    buttons,
    ctaUrl,
    ctaCall,
    ctaCopy,
    quickReply,
    singleSelect,
  };