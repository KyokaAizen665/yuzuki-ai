# ── Yuzuki AI — Production Dockerfile ────────────────────────────────────────
#
# Targets: VPS (docker run / docker-compose), Pterodactyl (custom egg)
#
# Build:
#   docker build -t yuzuki-ai .
#
# Run (VPS):
#   docker-compose up -d          ← recommended (see docker-compose.yml)
#
# Run (bare):
#   docker run -d \
#     --name yuzuki-ai \
#     -e OWNER_NUMBER=233533416608 \
#     -e PORT=3000 \
#     -v yuzuki-session:/app/session \
#     -v yuzuki-db:/app/database.sqlite \
#     -p 3000:3000 \
#     yuzuki-ai
#
# IMPORTANT — persistent volumes:
#   Mount /app/session and /app/database.sqlite to a named volume or host path.
#   Without persistence, every restart triggers a fresh pairing round.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:24-alpine

# System deps for sharp (image processing) and native addons
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    libc6-compat

WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
# Copy manifests first so Docker caches the npm install layer.
# If only source code changes, the install layer is reused.
COPY package.json package-lock.json* ./

# Install ALL dependencies including GitHub-sourced baileys.
# --omit=dev excluded because baileys is in "dependencies" not "devDependencies".
RUN npm install --prefer-offline --no-audit --no-fund 2>&1 || \
    npm install --no-audit --no-fund

# ── Source ────────────────────────────────────────────────────────────────────
COPY . .

# Pre-create runtime directories so they exist even before volumes mount
RUN mkdir -p session temp logs

# ── Runtime config ────────────────────────────────────────────────────────────
# PORT — health server port; override with -e PORT=xxxx
ENV PORT=3000
# NODE_ENV — set to production to suppress dev warnings
ENV NODE_ENV=production

EXPOSE ${PORT}

# Graceful shutdown: Docker sends SIGTERM → index.js handles it
STOPSIGNAL SIGTERM

# node:sqlite is experimental in Node 22; stable in Node 23+.
# We use Node 24 so the flag is a no-op safety net.
CMD ["node", "--experimental-sqlite", "index.js"]
