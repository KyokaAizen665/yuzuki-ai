/**
 * Command: owner
 * Contact the bot owner via native WhatsApp CTA CALL. Phase 10.
 *
 * Usage:
 *   .owner   — show owner contact card with CTA CALL button
 *   .support — alias
 *   .dev     — alias
 *
 * Aliases: support, dev, contact
 */
import {
  sendInteractive,
  ctaCall,
  ctaUrl,
  quickReply,
} from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'owner',
  description: 'Contact the bot owner — native WhatsApp call button',
  category:    'utility',
  aliases:     ['support', 'dev', 'contact'],
  cooldown:    10,
  owner:       false,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = `🌸 ${config.botName ?? 'Yuzuki AI'}`;

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const ownerNum = config.ownerNumber;

  const buttons = [quickReply('📋 Commands', 'open_menu')];

  if (ownerNum) {
    buttons.unshift(ctaCall('📞 Call Owner', `+${ownerNum}`));
  }

  // Optional channel or support URL
  if (config.officialChannelUrl) {
    buttons.push(ctaUrl('📢 Official Channel', config.officialChannelUrl));
  }

  const body =
    `🌸 *Yuzuki AI* — Bot Owner\n\n` +
    `Need help, want to report a bug, or have a feature request?\n\n` +
    `Tap *Call Owner* below to start a native WhatsApp call, or message the owner directly.\n\n` +
    (ownerNum ? `Owner number: *+${ownerNum}*` : `_Contact details not configured._`);

  await sendInteractive(sock, jid, {
    header:  '👑 Contact Owner',
    body,
    footer:  BRAND_FOOTER,
    buttons,
  }, rawMessage);
}
