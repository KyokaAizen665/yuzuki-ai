/**
 * Command: wyr
 * Would You Rather — sends a native WhatsApp poll with two dilemma options.
 * Category filtering supported.
 *
 * Usage:
 *   .wyr               — random dilemma
 *   .wyr funny         — funny category
 *   .wyr deep          — deep/philosophical
 *   .wyr gross         — gross/disgusting (fun)
 */
import { sendPoll, sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'wyr',
  description: 'Would You Rather — native WhatsApp poll dilemmas',
  category:    'fun',
  aliases:     ['wouldyourather', 'dilema', 'dilemma', 'poll-wyr'],
  cooldown:    5,
  permission:  'public',
};

const WYR_ICON = { url: 'https://img.icons8.com/color/96/question-mark--v1.png' };

const QUESTIONS = {
  funny: [
    ['Always have to shout when speaking', 'Never be able to speak above a whisper'],
    ['Never be able to use a phone again', 'Never be able to use a laptop/PC again'],
    ['Have a dog-sized horse', 'Have a horse-sized dog'],
    ['Always wear a clown suit', 'Always wear a wedding dress/suit everywhere'],
    ['Speak every language but not understand music', 'Understand every song but speak only one language'],
    ['Only eat pizza for a year', 'Only eat sushi for a year'],
    ['Be invisible but can\'t turn it off', 'Be able to fly but only 1 foot off the ground'],
    ['Win an argument every time', 'Always feel energized after 4 hours of sleep'],
    ['Find $20 every day', 'Have your dream job but earn $20/day'],
    ['Always sing instead of talking', 'Always skip instead of walking'],
  ],
  deep: [
    ['Know when you will die', 'Know how you will die'],
    ['Be feared by all', 'Be loved by all'],
    ['Have all the money but no friends', 'Have all the friends but no money'],
    ['Never grow old physically', 'Never grow old mentally'],
    ['Live in the past', 'Live in the future'],
    ['Know every language', 'Know every instrument'],
    ['Have 10 close friends', 'Have 100 acquaintances'],
    ['Spend a year alone on a beach', 'Spend a year in a crowded city but know no one'],
    ['Be able to read minds but unable to turn it off', 'Be able to see 5 min into the future once a day'],
    ['Never lie again', 'Never need to sleep again'],
  ],
  gross: [
    ['Drink a cup of sweat', 'Eat a spoonful of hair'],
    ['Smell like garlic permanently', 'Always hear the same annoying song in your head'],
    ['Never shower again', 'Never brush teeth again'],
    ['Eat a live spider', 'Lick a public toilet seat'],
    ['Have sandpaper hands', 'Have noodle fingers'],
  ],
  random: [
    ['Be fluent in all languages', 'Be an expert in every musical instrument'],
    ['Always be 10 minutes late', 'Always be 20 minutes early'],
    ['Be stuck in the 1990s forever', 'Be stuck in 2007 forever'],
    ['Have free WiFi wherever you go', 'Have free food wherever you go'],
    ['Work 3 days a week, earn less', 'Work 7 days a week, earn 5× more'],
    ['Never have to sleep', 'Never have to eat'],
    ['Have a photographic memory', 'Have a perfect imagination'],
    ['Know the exact date of your death', 'Not know and be surprised'],
    ['Be 5 years older', 'Be 5 years younger'],
    ['Always be cold', 'Always be hot'],
  ],
};

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    return sendInteractive(sock, jid, {
      header:       '🤔 Would You Rather',
      contextImage: WYR_ICON,
      body:
        `*Usage:* \`${p}wyr [category]\`\n\n` +
        `*Categories:*\n` +
        `• \`${p}wyr\` or \`${p}wyr random\`\n` +
        `• \`${p}wyr funny\`\n` +
        `• \`${p}wyr deep\`\n` +
        `• \`${p}wyr gross\`\n\n` +
        `Results appear as a native WhatsApp poll 🗳`,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        quickReply('🎲 Random',  'wyr'),
        quickReply('😂 Funny',   'wyr funny'),
        quickReply('🧠 Deep',    'wyr deep'),
      ],
    }, rawMessage);
  }

  const cat      = (sub && QUESTIONS[sub]) ? sub : 'random';
  const pool     = [
    ...QUESTIONS[cat],
    ...(cat === 'random' ? Object.values(QUESTIONS).flat() : []),
  ];
  const question = pool[Math.floor(Math.random() * pool.length)];
  const [a, b]   = question;

  try {
    await sendPoll(
      sock,
      jid,
      `🤔 Would you rather…`,
      [`🅰 ${a}`, `🅱 ${b}`],
      { selectableCount: 1, quoted: rawMessage }
    );
  } catch {
    // Fallback if sendPoll fails
    await sendInteractive(sock, jid, {
      header:       '🤔 Would You Rather?',
      contextImage: WYR_ICON,
      body:
        `🅰 *${a}*\n\n— OR —\n\n🅱 *${b}*\n\n` +
        `_Vote: reply A or B!_`,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        quickReply('🔄 Another', 'wyr'),
        quickReply('😂 Funny',   'wyr funny'),
      ],
    }, rawMessage);
  }
}
