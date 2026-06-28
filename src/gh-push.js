/**
 * gh-push.js
 *
 * Push one or more local workspace files to GitHub via the Contents API.
 * Handles creates and updates (fetches current SHA automatically).
 *
 * Usage:
 *   node scripts/src/gh-push.js [--repo owner/repo] [--root artifacts/yuzuki-bot] \
 *        [--message "commit msg"] file1 file2 ...
 *
 *   Or via npm script:
 *   pnpm --filter @workspace/scripts run gh-push -- --root artifacts/yuzuki-bot \
 *        artifacts/yuzuki-bot/src/commands/weather.js
 *
 * Environment:
 *   GITHUB_PERSONAL_ACCESS_TOKEN  — required
 */

import fs   from 'fs';
import path from 'path';
import { parseArgs } from 'util';

// ── Config ────────────────────────────────────────────────────────────────────

const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!TOKEN) { console.error('❌  GITHUB_PERSONAL_ACCESS_TOKEN is not set'); process.exit(1); }

const { values, positionals } = parseArgs({
  args:    process.argv.slice(2),
  options: {
    repo:    { type: 'string', default: 'KyokaAizen665/Yuzuki-ai' },
    root:    { type: 'string', default: 'artifacts/yuzuki-bot' },
    branch:  { type: 'string', default: 'main' },
    message: { type: 'string', default: 'chore: sync bot files from Replit' },
  },
  allowPositionals: true,
});

const REPO   = values.repo;
const ROOT   = values.root;
const BRANCH = values.branch;
const MSG    = values.message;
const FILES  = positionals;

if (!FILES.length) {
  console.error('❌  No files specified. Pass workspace-relative file paths as positional args.');
  process.exit(1);
}

const API = `https://api.github.com/repos/${REPO}/contents`;

const headers = {
  Authorization:  `Bearer ${TOKEN}`,
  Accept:         'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent':   'Yuzuki-AI-Replit-Pusher/1.0',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentSha(repoPath) {
  const url = `${API}/${repoPath}?ref=${BRANCH}`;
  const r   = await fetch(url, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${repoPath} → HTTP ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.sha ?? null;
}

async function pushFile(localPath, commitMessage) {
  // Map local path → repo path by stripping the local root prefix
  const abs      = path.resolve(localPath);
  const rootAbs  = path.resolve(ROOT);
  if (!abs.startsWith(rootAbs)) {
    throw new Error(`File ${localPath} is not under --root ${ROOT}`);
  }
  const repoPath = abs.slice(rootAbs.length).replace(/^\//, '');

  const content  = fs.readFileSync(abs, 'utf8');
  const encoded  = Buffer.from(content).toString('base64');
  const sha      = await getCurrentSha(repoPath);

  const body = {
    message: commitMessage,
    content: encoded,
    branch:  BRANCH,
    ...(sha ? { sha } : {}),
  };

  const r = await fetch(`${API}/${repoPath}`, {
    method:  'PUT',
    headers,
    body:    JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`PUT ${repoPath} → HTTP ${r.status}: ${txt}`);
  }

  const d      = await r.json();
  const action = sha ? 'updated' : 'created';
  console.log(`  ✓ ${action}: ${repoPath}  (${d.commit?.sha?.slice(0,7) ?? '?'})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n📤 Pushing ${FILES.length} file(s) to ${REPO} @ ${BRANCH}\n`);

let ok = 0, fail = 0;
for (const f of FILES) {
  try {
    await pushFile(f, MSG);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${f}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} pushed, ${fail} failed.\n`);
if (fail) process.exit(1);
