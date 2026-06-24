# Hero Images — Yuzuki AI

Managed asset directory for command card hero images.

## Directory structure

```
assets/hero/
  menu/        ← images used by .help / .menu card
  ai/          ← images used by AI command cards
  owner/       ← images used by .owner card
  channel/     ← images used by .channel card
  downloader/  ← images used by downloader command cards
```

## Adding images

1. Drop any `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif` file into the matching category folder.
2. Restart the bot — no code changes needed.
3. If multiple images exist in a folder, one is selected at random on each invocation.

## Resolution priority

For each category the service tries three sources in order:

| Priority | Source | Config |
|---|---|---|
| 1 | Local file | `assets/hero/<category>/<file>` |
| 2 | Env var URL | `HERO_IMAGE_<CATEGORY>_URL` in `.env` |
| 3 | Default fallback | Built-in URL, always valid |

## Env var overrides

Set these in `.env` to use a remote URL without adding local files:

```
HERO_IMAGE_MENU_URL=https://example.com/menu.jpg
HERO_IMAGE_AI_URL=https://example.com/ai.jpg
HERO_IMAGE_OWNER_URL=https://example.com/owner.jpg
HERO_IMAGE_CHANNEL_URL=https://example.com/channel.jpg
HERO_IMAGE_DOWNLOADER_URL=https://example.com/downloader.jpg
```

## Using in commands

```js
import { getRandomHeroImage } from '../services/hero-images.js';

// In your sendMessage / sock.sendMessage call:
image: getRandomHeroImage('menu')   // or 'ai', 'owner', 'channel', 'downloader'
```

The function returns `{ data: Buffer }` for local files or `{ url: string }` for URLs — both are accepted by cv3inx `sock.sendMessage({ image: ... })`.

## Diagnostic

`getHeroStats()` returns a per-category snapshot: local image count and which resolution path (`local` | `env` | `default`) would be used. Useful for admin or debug commands.
