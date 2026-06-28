/**
 * Command: 8ball
 * Classic magic 8-ball oracle. Shake the ball and receive your fate.
 *
 * Usage:
 *   .8ball Will it rain today?
 *   .8ball Am I handsome?
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        '8ball',
  description: 'Ask the magic 8-ball anything',
  category:    'fun',
  aliases:     ['eightball', 'magic8', 'fortune', 'oracle'],
  cooldown:    3,
  permission:  'public',
};

const BALL_ICON = { url: 'https://img.icons8.com/color/96/8-ball.png' };

const RESPONSES = [
  // Positive
  { text: 'It is certain.',           emoji: '✅', tone: 'positive' },
  { text: 'It is decidedly so.',       emoji: '✅', tone: 'positive' },
  { text: 'Without a doubt.',          emoji: '✅', tone: 'positive' },
  { text: 'Yes, definitely.',          emoji: '✅', tone: 'positive' },
  { text: 'You may rely on it.',       emoji: '✅', tone: 'positive' },
  { text: 'As I see it, yes.',         emoji: '✅', tone: 'positive' },
  { text: 'Most likely.',              emoji: '✅', tone: 'positive' },
  { text: 'Outlook good.',             emoji: '✅', tone: 'positive' },
  { text: 'Yes.',                      emoji: '✅', tone: 'positive' },
  { text: 'Signs point to yes.',       emoji: '✅', tone: 'positive' },
  // Neutral
  { text: 'Reply hazy, try again.',    emoji: '🔮', tone: 'neutral'  },
  { text: 'Ask again later.',          emoji: '🔮', tone: 'neutral'  },
  { text: 'Better not tell you now.',  emoji: '🔮', tone: 'neutral'  },
  { text: 'Cannot predict now.',       emoji: '🔮', tone: 'neutral'  },
  { text: 'Concentrate and ask again.',emoji: '🔮', tone: 'neutral'  },
  // Negative
  { text: "Don't count on it.",        emoji: '❌', tone: 'negative' },
  { text: 'My reply is no.',           emoji: '❌', tone: 'negative' },
  { text: 'My sources say no.',        emoji: '❌', tone: 'negative' },
  { text: 'Outlook not so good.',      emoji: '❌', tone: 'negative' },
  { text: 'Very doubtful.',            emoji: '❌', tone: 'negative' },
];

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  const question = args.join(' ').trim();

  if (!question) {
    return sendInteractive(sock, jid, {
      header:       '🎱 Magic 8-Ball',
      contextImage: BALL_ICON,
      body:
        `*Ask the 8-ball anything!*\n\n` +
        `*Usage:* \`${p}8ball <question>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}8ball Will I pass my exam?\`\n` +
        `• \`${p}8ball Should I go to the gym?\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🎱 Try it', '8ball Will today be a good day?')],
    }, rawMessage);
  }

  const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
  const header   = response.tone === 'positive' ? '🎉 Yes!' :
                   response.tone === 'negative' ? '😶 No...' : '🔮 Hmm...';

  await ctx.react(response.emoji);

  return sendInteractive(sock, jid, {
    header:       '🎱 Magic 8-Ball',
    contextImage: BALL_ICON,
    body:
      `*Your question:*\n_"${question}"_\n\n` +
      `🎱 *The 8-Ball says...*\n\n` +
      `${response.emoji} *${response.text}*`,
    footer:  `🌸 ${config.botName} · ${header}`,
    buttons: [
      quickReply('🔄 Ask Again', `8ball ${question}`),
      quickReply('🎱 New Question', '8ball'),
    ],
  }, rawMessage);
}
