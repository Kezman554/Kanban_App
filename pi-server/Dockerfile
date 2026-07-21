# Kanban Pi service: the board's data API + the browser board UI, one container.
# Built on the Raspberry Pi (ARM64) by docker compose from the AlfredHomeHub
# stack, with THIS repo's root as the build context (it needs src/ + the vite
# configs). node:22-bookworm-slim is multi-arch.
#
#   docker build -f pi-server/Dockerfile -t kanban-api .   # context = repo root

# --- Stage 1: build the browser board (static React) ------------------------
# Uses a lean dep set (web-build.package.json) with NO electron / node-pty /
# better-sqlite3 — none are needed for the static UI, so the image build stays
# fast and free of native compiles. The window.electron bridge is provided at
# runtime by src/renderer/electron-web-shim.js.
FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY pi-server/web-build.package.json ./package.json
COPY pi-server/web-build.package-lock.json ./package-lock.json
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY vite.web.config.js postcss.config.js tailwind.config.js ./
RUN npx vite build --config vite.web.config.js
# -> /build/dist-web

# --- Stage 2: the API server + the built board -----------------------------
FROM node:22-bookworm-slim

# python3/make/g++: from-source fallback for better-sqlite3 (rebuilt here for the
#   container's Node ABI; the repo's copy is Electron-ABI).
# git/openssh-client: the /export/run endpoint commits + pushes the vault export
#   over SSH (the "Sync to Vault" button and the nightly cron). util-linux
#   (flock) is already present in the base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ git openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Server deps first (express + better-sqlite3 only), so a code or UI change
# doesn't re-resolve/rebuild native modules. Installed at /app root so
# require('better-sqlite3') resolves for src/database/schema.js.
COPY pi-server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# The wrapped data layer, copied unmodified from the repo.
COPY src/database/schema.js src/database/operations.js ./src/database/
COPY src/main/vaultSummary.js ./src/main/
COPY pi-server/server.js pi-server/vaultExport.js pi-server/vault-commit.sh ./pi-server/

# The built board from stage 1 — served as static files by server.js at /app/web.
COPY --from=web /build/dist-web ./web

# Run as the image's `node` user (UID 1000 = kezman554 on the Pi): the
# bind-mounted DB dir and vault (both owned by 1000) are writable, and the ro
# ~/.ssh mount lands at /home/node/.ssh where git finds the deploy key. Using
# the NAME (not the bare UID) so HOME=/home/node is set from /etc/passwd.
USER node

EXPOSE 8300

# DB path + port come from the environment (docker-compose). The DB lives on a
# bind-mounted volume so it survives container rebuilds.
CMD ["node", "pi-server/server.js"]
