# Yuzuki AI

Production-grade WhatsApp Multi-Device Bot — Node.js 22+, Baileys, SQLite, Groq AI.

## Features
- Pairing code auth (no QR scan)
- Buffer-safe SQLite session persistence
- Exponential backoff reconnection
- Groq AI integration (Phase 4)
- Hot-loadable plugin system (Phase 3)

## Quick Start
```bash
npm install && cp .env.example .env
npm start
```

## Architecture
src/core/ — socket, connection, pairing
src/database/ — auth adapter + data store
src/utils/ — logger, buffer fix, jid utils
src/config/ — configuration
