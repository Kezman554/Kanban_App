# Kanban Pi API. Built on the Raspberry Pi (ARM64) by docker compose from the
# AlfredHomeHub stack, with THIS repo's root as the build context (it needs
# src/database + src/main). node:22-bookworm-slim is multi-arch.
#
#   docker build -f pi-server/Dockerfile -t kanban-api .   # context = repo root
#
# better-sqlite3 is (re)built here for the container's Node ABI — the version
# vendored in the repo's node_modules is compiled against Electron's ABI and
# would not load under plain Node. `npm install` fetches an arm64 prebuild when
# one exists; the build toolchain below is the from-source fallback.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps first, so a server-code change doesn't re-resolve/rebuild native modules.
# package.json lists only express + better-sqlite3 — NOT the Electron app's deps.
# Installing at /app root means require('better-sqlite3') resolves for
# src/database/schema.js (Node walks up to /app/node_modules).
COPY pi-server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# The wrapped data layer, copied unmodified from the repo. operations.js and
# schema.js are the whole DB layer; vaultSummary.js backs /export/summary.
COPY src/database/schema.js src/database/operations.js ./src/database/
COPY src/main/vaultSummary.js ./src/main/
COPY pi-server/server.js ./pi-server/

# Run as UID 1000 (kezman554 on the Pi) so the bind-mounted DB dir — owned by
# that user — is writable without ownership tricks, same as vault-api.
USER 1000

EXPOSE 8300

# DB path + port come from the environment (set in docker-compose). The DB
# lives on a bind-mounted volume so it survives container rebuilds.
CMD ["node", "pi-server/server.js"]
