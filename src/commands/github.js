/**
 * Command: github
 *
 * GitHub search, repo lookup, user profile, and trending repos.
 * Authenticated via GITHUB_PERSONAL_ACCESS_TOKEN for higher rate limits
 * (60 req/hr unauthenticated → 5000 req/hr authenticated).
 *
 * Usage:
 *   .gh search <query>          — search repositories
 *   .gh repo <owner>/<repo>     — repository details + stats
 *   .gh user <username>         — user/org profile
 *   .gh trending [lang]         — trending repos (past week)
 *   .gh issues <owner>/<repo>   — open issues (latest 5)
 *   .gh code <query>            — code search
 *
 * Aliases: github, git
 * Env: GITHUB_PERSONAL_ACCESS_TOKEN — optional but strongly recommended
 */

import { log } from '../utils/logger.js';
import {
  sendInteractive,
  quickReply,
  ctaUrl,
} from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { config }             from '../config/index.js';

export const meta = {
  name:        'gh',
  description: 'GitHub search, repo info, user profiles, and trending repos',
  category:    'tools',
  aliases:     ['github', 'git'],
  cooldown:    5,
  permission:  'public',
};

const GH_API  = 'https://api.github.com';
const GH_PAT  = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

// ── GitHub API fetch helper ───────────────────────────────────────────────────

async function ghFetch(path, params = {}) {
  const url = new URL(`${GH_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers = {
    'Accept':     'application/vnd.github+json',
    'User-Agent': 'Yuzuki-AI/2.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GH_PAT) headers['Authorization'] = `Bearer ${GH_PAT}`;

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(12_000),
  });

  if (res.status === 404) throw new Error('Not found on GitHub');
  if (res.status === 401) throw new Error('GitHub token invalid — update GITHUB_PERSONAL_ACCESS_TOKEN');
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') throw new Error('GitHub rate limit reached — try again later');
    throw new Error('GitHub API forbidden');
  }
  if (!res.ok) throw new Error(`GitHub API error: HTTP ${res.status}`);

  return res.json();
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso) {
  if (!iso) return '?';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function langDot(lang) {
  const dots = {
    JavaScript: '🟨', TypeScript: '🔷', Python: '🐍', Rust: '🦀',
    Go: '🔵', Java: '☕', 'C++': '🔴', C: '⚫', Ruby: '💎',
    PHP: '🟣', Swift: '🟠', Kotlin: '🟤', Shell: '🐚',
    HTML: '🌐', CSS: '🎨', Dart: '💙', Lua: '🌙',
  };
  return dots[lang] ?? '📄';
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

async function searchRepos(ctx, query) {
  const { sock, chat: jid, rawMessage } = ctx;

  const data = await ghFetch('/search/repositories', {
    q:        query,
    sort:     'stars',
    order:    'desc',
    per_page: '5',
  });

  const repos = data.items ?? [];
  if (!repos.length) {
    return ctx.reply(`🔍 No repositories found for *"${query}"*`);
  }

  const lines = repos.map((r, i) => {
    const lang = r.language ? `${langDot(r.language)} ${r.language}` : '';
    return (
      `*${i + 1}.* *${r.full_name}*\n` +
      `${r.description ? r.description.slice(0, 80) + (r.description.length > 80 ? '…' : '') : '_No description_'}\n` +
      `⭐ ${fmtNum(r.stargazers_count)}  🍴 ${fmtNum(r.forks_count)}  ${lang}\n` +
      `${r.html_url}`
    );
  });

  const topRepo = repos[0];
  const body    = `🔍 *GitHub Repos — "${query}"*\n_${fmtNum(data.total_count)} total results_\n\n${lines.join('\n\n')}`;

  return sendInteractive(sock, jid, {
    header:  '🐙 GitHub Search',
    body:    body.slice(0, 1024),
    footer:  `🌸 ${config.botName} · ${GH_PAT ? 'Authenticated' : 'Public API'}`,
    buttons: [
      ctaUrl('🔗 Open #1', topRepo.html_url),
      quickReply('📋 Repo Details', `gh repo ${topRepo.full_name}`),
      ctaUrl('🔍 More Results', `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`),
    ],
  }, rawMessage);
}

async function repoDetails(ctx, fullName) {
  const { sock, chat: jid, rawMessage } = ctx;

  const [repo, releases] = await Promise.allSettled([
    ghFetch(`/repos/${fullName}`),
    ghFetch(`/repos/${fullName}/releases`, { per_page: '1' }),
  ]);

  if (repo.status === 'rejected') throw new Error(repo.reason.message);
  const r   = repo.value;
  const rel = releases.status === 'fulfilled' ? releases.value?.[0] : null;

  const topics = r.topics?.length ? r.topics.slice(0, 5).map(t => `\`${t}\``).join(' ') : '_none_';
  const lang   = r.language ? `${langDot(r.language)} ${r.language}` : 'Unknown';

  const body =
    `🐙 *${r.full_name}*\n` +
    `${r.description ? r.description.slice(0, 120) : '_No description_'}\n\n` +
    `⭐ Stars:    ${fmtNum(r.stargazers_count)}\n` +
    `🍴 Forks:    ${fmtNum(r.forks_count)}\n` +
    `👁 Watchers: ${fmtNum(r.watchers_count)}\n` +
    `🐛 Issues:   ${fmtNum(r.open_issues_count)}\n` +
    `${lang}\n` +
    `📅 Created:  ${fmtDate(r.created_at)}\n` +
    `🔄 Updated:  ${fmtDate(r.pushed_at)}\n` +
    (rel ? `🏷️  Latest:   ${rel.tag_name ?? '?'}\n` : '') +
    `\n🏷️  Topics: ${topics}\n` +
    (r.license ? `📜 License: ${r.license.spdx_id}\n` : '') +
    (r.homepage ? `🌐 Homepage: ${r.homepage}\n` : '');

  const buttons = [
    ctaUrl('🔗 Open Repo', r.html_url),
    ctaUrl('⬇️ Clone', `${r.clone_url}`),
  ];
  if (r.open_issues_count > 0) {
    buttons.push(quickReply('🐛 Issues', `gh issues ${fullName}`));
  }

  return sendInteractive(sock, jid, {
    header:  `📦 ${r.name}`,
    body:    body.slice(0, 1024),
    footer:  `🌸 ${config.botName} · ${r.owner?.login}`,
    buttons: buttons.slice(0, 3),
  }, rawMessage);
}

async function userProfile(ctx, username) {
  const { sock, chat: jid, rawMessage } = ctx;

  const [user, repos] = await Promise.allSettled([
    ghFetch(`/users/${username}`),
    ghFetch(`/users/${username}/repos`, { sort: 'stars', per_page: '3' }),
  ]);

  if (user.status === 'rejected') throw new Error(user.reason.message);
  const u = user.value;
  const topRepos = repos.status === 'fulfilled' ? repos.value : [];

  const repoLines = topRepos.map(r =>
    `• *${r.name}* ⭐${fmtNum(r.stargazers_count)} ${r.language ? `· ${langDot(r.language)} ${r.language}` : ''}`
  ).join('\n');

  const body =
    `👤 *${u.name ?? u.login}*${u.login !== u.name ? `\n@${u.login}` : ''}\n` +
    (u.bio ? `_${u.bio.slice(0, 100)}_\n\n` : '\n') +
    `📦 Public repos:  ${fmtNum(u.public_repos)}\n` +
    `👥 Followers:     ${fmtNum(u.followers)}\n` +
    `➡️  Following:     ${fmtNum(u.following)}\n` +
    (u.company  ? `🏢 Company:  ${u.company}\n`        : '') +
    (u.location ? `📍 Location: ${u.location}\n`       : '') +
    (u.blog     ? `🌐 Website:  ${u.blog}\n`           : '') +
    `📅 Joined: ${fmtDate(u.created_at)}\n` +
    (topRepos.length ? `\n🌟 *Top repos:*\n${repoLines}` : '');

  return sendInteractive(sock, jid, {
    header:  `👤 ${u.login}`,
    body:    body.slice(0, 1024),
    footer:  `🌸 ${config.botName} · ${u.type}`,
    buttons: [
      ctaUrl('🔗 Open Profile', u.html_url),
      ctaUrl('📦 Repositories', `${u.html_url}?tab=repositories`),
    ],
  }, rawMessage);
}

async function trendingRepos(ctx, lang) {
  const { sock, chat: jid, rawMessage } = ctx;

  // GitHub doesn't have an official trending API; approximate via search
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const q     = lang
    ? `language:${lang} created:>${since}`
    : `created:>${since} stars:>10`;

  const data = await ghFetch('/search/repositories', {
    q,
    sort:     'stars',
    order:    'desc',
    per_page: '5',
  });

  const repos = data.items ?? [];
  if (!repos.length) {
    return ctx.reply(`📈 No trending repos found${lang ? ` for language *${lang}*` : ''} this week.`);
  }

  const lines = repos.map((r, i) => {
    const lbl = r.language ? `${langDot(r.language)} ${r.language}` : '';
    return (
      `*${i + 1}.* *${r.full_name}*\n` +
      `${r.description ? r.description.slice(0, 70) + (r.description.length > 70 ? '…' : '') : ''}\n` +
      `⭐ ${fmtNum(r.stargazers_count)}  ${lbl}\n` +
      `${r.html_url}`
    );
  });

  const title  = lang ? `🔥 Trending *${lang}* repos this week` : `🔥 Trending repos this week`;
  const topUrl = repos[0]?.html_url ?? 'https://github.com/trending';

  return sendInteractive(sock, jid, {
    header:  '📈 GitHub Trending',
    body:    `${title}\n\n${lines.join('\n\n')}`.slice(0, 1024),
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🔗 Open #1', topUrl),
      ctaUrl('📈 All Trending', `https://github.com/trending${lang ? `/${encodeURIComponent(lang)}` : ''}`),
      quickReply('🔄 Refresh', lang ? `gh trending ${lang}` : 'gh trending'),
    ],
  }, rawMessage);
}

async function repoIssues(ctx, fullName) {
  const { sock, chat: jid, rawMessage } = ctx;

  const data = await ghFetch(`/repos/${fullName}/issues`, {
    state:    'open',
    per_page: '5',
    sort:     'created',
    direction:'desc',
  });

  if (!data.length) {
    return ctx.reply(`✅ No open issues in *${fullName}* — clean slate!`);
  }

  const lines = data.map((issue, i) => {
    const labels = issue.labels?.slice(0, 2).map(l => `\`${l.name}\``).join(' ') ?? '';
    return (
      `*${i + 1}.* #${issue.number} ${issue.title.slice(0, 70)}${issue.title.length > 70 ? '…' : ''}\n` +
      `   by @${issue.user.login} · ${fmtDate(issue.created_at)} ${labels}`
    );
  });

  return sendInteractive(sock, jid, {
    header:  `🐛 Issues — ${fullName}`,
    body:    `*${data.length} most recent open issues:*\n\n${lines.join('\n\n')}`.slice(0, 1024),
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🐛 All Issues', `https://github.com/${fullName}/issues`),
      ctaUrl('📝 New Issue', `https://github.com/${fullName}/issues/new`),
    ],
  }, rawMessage);
}

async function codeSearch(ctx, query) {
  const { sock, chat: jid, rawMessage } = ctx;

  if (!GH_PAT) {
    return ctx.reply(
      `🔑 *Code search requires authentication.*\n\n` +
      `Set \`GITHUB_PERSONAL_ACCESS_TOKEN\` in your environment to enable code search.\n\n` +
      `_Unauthenticated GitHub API does not allow code search._`
    );
  }

  const data = await ghFetch('/search/code', {
    q:        query,
    per_page: '5',
  });

  const items = data.items ?? [];
  if (!items.length) return ctx.reply(`🔍 No code found for *"${query}"*`);

  const lines = items.map((item, i) =>
    `*${i + 1}.* \`${item.path}\`\n   ${item.repository.full_name}\n   ${item.html_url}`
  );

  return sendInteractive(sock, jid, {
    header:  '💻 Code Search',
    body:    `💻 *Code results for "${query}"*\n_${fmtNum(data.total_count)} total_\n\n${lines.join('\n\n')}`.slice(0, 1024),
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🔗 Open #1', items[0].html_url),
      ctaUrl('🔍 All Results', `https://github.com/search?q=${encodeURIComponent(query)}&type=code`),
    ],
  }, rawMessage);
}

// ── Help card ─────────────────────────────────────────────────────────────────

async function sendHelpCard(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;
  const p = config.prefix;

  const body =
    `🐙 *GitHub Commands*\n\n` +
    `• \`${p}gh search <query>\`       — repo search\n` +
    `• \`${p}gh repo <owner>/<name>\`  — repo details + stats\n` +
    `• \`${p}gh user <username>\`      — user / org profile\n` +
    `• \`${p}gh trending [lang]\`      — trending this week\n` +
    `• \`${p}gh issues <owner>/<name>\`— open issues\n` +
    `• \`${p}gh code <query>\`         — code search (auth required)\n\n` +
    `*Aliases:* \`${p}github\`, \`${p}git\`\n\n` +
    (GH_PAT
      ? `✅ _Authenticated — 5000 req/hr_`
      : `⚠️ _Unauthenticated — 60 req/hr_\nSet GITHUB_PERSONAL_ACCESS_TOKEN for higher limits.`);

  return sendInteractive(sock, jid, {
    header:       '🐙 GitHub',
    contextImage: getRandomHeroImage('ai'),
    body,
    footer:  `🌸 ${config.botName}`,
    buttons: [
      quickReply('📈 Trending', 'gh trending'),
      ctaUrl('🔗 GitHub', 'https://github.com'),
      quickReply('🔍 Search Repos', 'gh search'),
    ],
  }, rawMessage);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { args, command } = ctx;
  const sub = args[0]?.toLowerCase();

  // Direct alias routing: .github / .git without subcommand → show help
  if (!sub) return sendHelpCard(ctx);
  if (sub === 'help') return sendHelpCard(ctx);

  const rest = args.slice(1).join(' ').trim();

  try { await ctx.react('🐙'); } catch {}
  try { await ctx.sock.sendPresenceUpdate('composing', ctx.chat); } catch {}

  try {
    switch (sub) {
      case 'search':
      case 's': {
        if (!rest) return ctx.reply(`🔍 Usage: \`${config.prefix}gh search <query>\``);
        await searchRepos(ctx, rest);
        break;
      }

      case 'repo':
      case 'r': {
        const target = rest || args[1];
        if (!target || !target.includes('/')) {
          return ctx.reply(`📦 Usage: \`${config.prefix}gh repo <owner>/<repo>\`\nExample: \`${config.prefix}gh repo microsoft/vscode\``);
        }
        await repoDetails(ctx, target);
        break;
      }

      case 'user':
      case 'u':
      case 'profile': {
        if (!rest) return ctx.reply(`👤 Usage: \`${config.prefix}gh user <username>\``);
        await userProfile(ctx, rest);
        break;
      }

      case 'trending':
      case 'trend':
      case 'hot': {
        await trendingRepos(ctx, rest || null);
        break;
      }

      case 'issues':
      case 'issue':
      case 'bugs': {
        if (!rest || !rest.includes('/')) {
          return ctx.reply(`🐛 Usage: \`${config.prefix}gh issues <owner>/<repo>\``);
        }
        await repoIssues(ctx, rest);
        break;
      }

      case 'code':
      case 'codesearch': {
        if (!rest) return ctx.reply(`💻 Usage: \`${config.prefix}gh code <query>\``);
        await codeSearch(ctx, rest);
        break;
      }

      default:
        // If sub looks like owner/repo — treat as implicit repo lookup
        if (sub.includes('/')) {
          await repoDetails(ctx, args.join(' ').trim());
        } else {
          // Otherwise treat whole thing as a repo search
          await searchRepos(ctx, args.join(' ').trim());
        }
    }
  } catch (err) {
    log.error(`[github] ${sub} failed: ${err.message}`);
    try { await ctx.react('❌'); } catch {}
    return ctx.reply(`⚠️ GitHub: ${err.message}`);
  }

  try { await ctx.sock.sendPresenceUpdate('paused', ctx.chat); } catch {}
}
