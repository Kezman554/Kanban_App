'use strict';

/**
 * Kanban Pi API
 * ----------------------------------------------------------------------------
 * A thin HTTP front door over the Kanban data layer so LAN clients (the
 * DailySync kanban tile, and later a browser-tab board) can read and write the
 * board without the Electron app. It *wraps* src/database/operations.js — that
 * file is never modified here; the Electron app and this server share it.
 *
 * No board UI is served: the Electron desktop app remains the board's only UI
 * until the separate UI-port card. On the Pi this runs against a COPY of the
 * board DB; the laptop app stays authoritative until that card repoints it.
 *
 * Endpoints are grouped read / write below. Errors from operations.js surface
 * as: null return -> 404, a thrown "... not found ..." -> 404, other throws ->
 * 400 (they are almost all input/validation errors — bad status, duplicate
 * letter, malformed dependency), with 500 reserved for the unexpected.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// Wrapped, never modified. Resolves both in the repo (pi-server -> ../src) and
// in the container (/app/pi-server -> /app/src).
const KanbanDatabase = require('../src/database/operations');
const { buildSummaryMarkdown } = require('../src/main/vaultSummary');

const PORT = parseInt(process.env.KANBAN_API_PORT || '8300', 10);
// The built React board, served as static files from the same origin as the
// API so the browser board needs no CORS and no separate host. In the
// container the multi-stage build drops it at /app/web; unset/absent just means
// "API only" (e.g. local dev), which is fine.
const WEB_DIR = process.env.KANBAN_WEB_DIR || path.join(__dirname, '..', 'web');
// Explicit path to the DB copy. In the container this is the bind-mounted
// volume (see docker-compose); unset falls back to operations.js's own default
// (<cwd>/data/kanban.db), which is what local runs use.
const DB_PATH = process.env.KANBAN_DB_PATH || null;

const db = new KanbanDatabase(DB_PATH);
const app = express();
app.use(express.json({ limit: '2mb' }));

// --- helpers ----------------------------------------------------------------

// Wrap an async-ish handler so any throw becomes a classified JSON error
// instead of an unhandled crash. Handlers stay small and just return data.
function h(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const status = /not found/i.test(msg) ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  };
}

// Parse a :param as a positive integer id, or throw (-> 400 via h()).
function intParam(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

// --- reads ------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Aggregate counts — backs the smoke check and the migration-integrity test.
// Summed from per-project stats so it can never disagree with /projects.
app.get('/stats', h((_req, res) => {
  const projects = db.getAllProjects();
  const totals = projects.reduce(
    (acc, p) => {
      acc.cards += p.stats.total_cards;
      acc.done += p.stats.completed_cards;
      acc.in_progress += p.stats.in_progress_cards;
      acc.not_started += p.stats.not_started_cards;
      return acc;
    },
    { cards: 0, done: 0, in_progress: 0, not_started: 0 }
  );
  res.json({ projects: projects.length, ...totals });
}));

app.get('/projects', h((_req, res) => res.json(db.getAllProjects())));

app.get('/projects/:id', h((req, res) => {
  const project = db.getProject(intParam(req.params.id, 'project id'));
  if (!project) return res.status(404).json({ error: 'project not found' });
  res.json(project);
}));

app.get('/projects/:id/workable', h((req, res) => {
  res.json(db.getWorkableCards(intParam(req.params.id, 'project id')));
}));

app.get('/projects/:id/done', h((req, res) => {
  res.json(db.getDoneCardsForProject(intParam(req.params.id, 'project id')));
}));

app.get('/projects/:id/next-letter', h((req, res) => {
  const projectId = intParam(req.params.id, 'project id');
  const subphaseId = intParam(req.query.subphaseId, 'subphaseId query param');
  res.json({ next_letter: db.getNextSessionLetter(projectId, subphaseId) });
}));

app.get('/cards/:id', h((req, res) => {
  const card = db.getCard(intParam(req.params.id, 'card id'));
  if (!card) return res.status(404).json({ error: 'card not found' });
  res.json(card);
}));

app.get('/cards/:id/blocked', h((req, res) => {
  const reason = db.getBlockedReason(intParam(req.params.id, 'card id'));
  res.json({ blocked: reason !== null, reason });
}));

// --- writes -----------------------------------------------------------------

// The tile's main write path: add card(s) to a project, optionally creating a
// phase/subphase, carrying depends_on_cards + external_dependencies. Wraps
// appendCards, whose own validation drives the 400s (duplicate letter,
// bad targeting).
app.post('/projects/:id/append', h((req, res) => {
  const result = db.appendCards(intParam(req.params.id, 'project id'), req.body || {});
  res.status(201).json(result);
}));

app.post('/projects/import', h((req, res) => {
  const id = db.importProjectFromJson(req.body || {});
  res.status(201).json({ id });
}));

app.post('/subphases/:subphaseId/cards', h((req, res) => {
  const id = db.createCard(intParam(req.params.subphaseId, 'subphase id'), req.body || {});
  res.status(201).json({ id });
}));

app.patch('/projects/:id', h((req, res) => {
  res.json({ updated: db.updateProject(intParam(req.params.id, 'project id'), req.body || {}) });
}));

app.delete('/projects/:id', h((req, res) => {
  res.json({ deleted: db.deleteProject(intParam(req.params.id, 'project id')) });
}));

app.patch('/cards/:id/status', h((req, res) => {
  const status = req.body && req.body.status;
  if (typeof status !== 'string') throw new Error('body.status (string) is required');
  res.json({ updated: db.updateCardStatus(intParam(req.params.id, 'card id'), status) });
}));

app.patch('/cards/:id/details', h((req, res) => {
  res.json({ updated: db.updateCardDetails(intParam(req.params.id, 'card id'), req.body || {}) });
}));

app.patch('/cards/:id/notes', h((req, res) => {
  const notes = req.body && req.body.notes;
  if (typeof notes !== 'string') throw new Error('body.notes (string) is required');
  res.json({ updated: db.updateCardNotes(intParam(req.params.id, 'card id'), notes) });
}));

app.patch('/cards/:id/prompt', h((req, res) => {
  res.json({ updated: db.updateCardPrompt(intParam(req.params.id, 'card id'), req.body || {}) });
}));

app.post('/cards/:id/clear-dependencies', h((req, res) => {
  res.json({ updated: db.clearCardDependencies(intParam(req.params.id, 'card id')) });
}));

app.delete('/cards/:id', h((req, res) => {
  res.json(db.deleteCard(intParam(req.params.id, 'card id')));
}));

app.delete('/phases/:id', h((req, res) => {
  res.json({ deleted: db.deletePhase(intParam(req.params.id, 'phase id')) });
}));

// --- export (backs the Pi-side vault export script) -------------------------
//
// The JSON and the human summary are exactly what the Electron app writes to
// the vault today; the Pi-side script (scripts/kanban-export.sh) curls these
// and commits them into the vault. Kept as reads so the script owns the git
// side and this container needs no vault access.

app.get('/export/json', h((_req, res) => res.json(db.exportForVault())));

app.get('/export/summary', h((_req, res) => {
  res.type('text/markdown').send(buildSummaryMarkdown(db.exportForVault()));
}));

// Every project as importable JSON (backs the board's "export all" download).
app.get('/export/all-projects', h((_req, res) => {
  res.json(db.getAllProjects().map((p) => db.exportProjectToJson(p.id)));
}));

// --- static board (served last so API routes above always win) --------------

if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  console.log(`serving board UI from ${WEB_DIR}`);
} else {
  console.log(`no web build at ${WEB_DIR} — running API only`);
}

// --- boot -------------------------------------------------------------------

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`kanban-pi-api listening on 0.0.0.0:${PORT} (db: ${DB_PATH || '<cwd>/data/kanban.db'})`);
});

// Close the DB cleanly so SQLite finalises its journal on container stop.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
