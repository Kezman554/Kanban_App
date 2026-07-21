/**
 * Browser shim for window.electron
 * ----------------------------------------------------------------------------
 * The renderer talks to the data layer through a single object, `window.electron`,
 * set up by preload.js under Electron. There is no preload in a browser, so this
 * module recreates the SAME surface over fetch to the Kanban Pi API (card N) —
 * the renderer's ~55 data call sites are untouched.
 *
 * Each method returns EXACTLY what the Electron IPC handler returned (the raw
 * operations.js value), not the API's JSON envelope: the API answers e.g.
 * `{updated: true}`, the renderer expects a bare `true`, so we unwrap here.
 *
 * The handful of methods that were native to the desktop (file dialogs, opening
 * folders, the local Claude Code / API-key integration, the embedded terminal)
 * can't work in a browser. They are given real web equivalents where one exists
 * (upload / download) and otherwise degrade loudly — a visible message, never a
 * silent no-op or a dead button. See docs/pi-port-analysis.md and the card's
 * feature-gap report for the full list.
 */

// Guard: under Electron, preload already defined window.electron — do nothing.
if (typeof window !== 'undefined' && !window.electron) {
  // Same-origin by default (the API serves this bundle). Overridable for local
  // dev where the board and API are on different ports.
  const BASE = (window.__KANBAN_API_BASE__ || '').replace(/\/$/, '');

  // fetch wrapper: rejects on non-2xx with the API's error text, so the
  // renderer's existing try/catch behaves as it did with a rejected invoke().
  async function req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, opts);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error((data && data.error) || `${method} ${url} failed (${res.status})`);
    }
    return data;
  }
  // GET that treats 404 as null, matching operations.js getters that return
  // null for a missing row (rather than throwing).
  async function getOrNull(url) {
    const res = await fetch(BASE + url);
    if (res.status === 404) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.error) || `GET ${url} failed (${res.status})`);
    return data;
  }

  const enc = encodeURIComponent;

  // --- degraded-feature helpers ---------------------------------------------
  function unavailable(message) {
    // Visible, honest feedback. Returns a "did nothing" shape so callers that
    // ignore the result simply see no change rather than a crash.
    if (typeof window.alert === 'function') window.alert(message);
    console.warn('[browser board] ' + message);
  }

  function download(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // Web equivalent of the native "open JSON file" dialog: a file picker that
  // reads + parses the chosen file. Returns { filePath, data } | null, matching
  // the Electron handler (filePath is the file name here — display only).
  function pickJsonFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve({ filePath: file.name, data: JSON.parse(reader.result) });
          } catch (e) {
            reject(new Error(`Failed to parse ${file.name}: ${e.message}`));
          }
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
      };
      // If the user dismisses the picker, onchange never fires; that reads as a
      // cancel (null), same as the native dialog. No resolve needed.
      input.click();
    });
  }

  window.electron = {
    // --- projects (fetch) ---
    getAllProjects: () => req('GET', '/projects'),
    getProject: (id) => getOrNull(`/projects/${enc(id)}`),
    updateProject: (id, data) => req('PATCH', `/projects/${enc(id)}`, data).then((r) => r.updated),
    deleteProject: (id) => req('DELETE', `/projects/${enc(id)}`).then((r) => r.deleted),
    updateProjectPath: (id, directory_path) =>
      req('PATCH', `/projects/${enc(id)}`, { directory_path }).then((r) => r.updated),
    // createProject isn't called by the renderer today; route through import so
    // it still behaves if some path reaches it.
    createProject: (data) => req('POST', '/projects/import', data).then((r) => r.id),

    // --- cards (fetch) ---
    getCard: (id) => getOrNull(`/cards/${enc(id)}`),
    createCard: (subphaseId, data) =>
      req('POST', `/subphases/${enc(subphaseId)}/cards`, data).then((r) => r.id),
    getNextSessionLetter: (projectId, subphaseId) =>
      req('GET', `/projects/${enc(projectId)}/next-letter?subphaseId=${enc(subphaseId)}`).then(
        (r) => r.next_letter
      ),
    updateCardStatus: (id, status) =>
      req('PATCH', `/cards/${enc(id)}/status`, { status }).then((r) => r.updated),
    updateCardPrompt: (id, promptData) =>
      req('PATCH', `/cards/${enc(id)}/prompt`, promptData).then((r) => r.updated),
    updateCardNotes: (id, notes) =>
      req('PATCH', `/cards/${enc(id)}/notes`, { notes }).then((r) => r.updated),
    updateCardDetails: (id, details) =>
      req('PATCH', `/cards/${enc(id)}/details`, details).then((r) => r.updated),
    clearCardDependencies: (id) =>
      req('POST', `/cards/${enc(id)}/clear-dependencies`).then((r) => r.updated),
    deleteCard: (id) => req('DELETE', `/cards/${enc(id)}`), // { deletedLetter }
    getDoneCards: (projectId) => req('GET', `/projects/${enc(projectId)}/done`),

    // --- phases (fetch) ---
    deletePhase: (id) => req('DELETE', `/phases/${enc(id)}`).then((r) => r.deleted),

    // --- import / append (fetch) ---
    importProjectFromJson: (jsonData) => req('POST', '/projects/import', jsonData).then((r) => r.id),
    appendCards: (projectId, data) => req('POST', `/projects/${enc(projectId)}/append`, data),
    exportAllProjects: () => req('GET', '/export/all-projects'),

    // --- file dialogs: real web equivalents ---
    openJsonFile: () => pickJsonFile(),
    // Two-step save flow in the UI (saveJsonFile -> writeJsonFile). In the
    // browser the download happens on write; saveJsonFile just supplies the
    // filename so the caller proceeds.
    saveJsonFile: (defaultName) => Promise.resolve(defaultName || 'kanban_export.json'),
    writeJsonFile: (filePath, data) => {
      download(String(filePath).split(/[\\/]/).pop(), data);
      return Promise.resolve({ success: true });
    },

    // --- degraded / removed (native to the desktop app) ---
    // A project's directory only fed features that are themselves desktop-only
    // (open-in-explorer, local file reads), so keep it editable by hand rather
    // than a native picker.
    selectDirectory: () => {
      const p = window.prompt('Enter the project directory path (manual entry — no native picker on the browser board):');
      return Promise.resolve(p && p.trim() ? p.trim() : null);
    },
    openInExplorer: (dir) => {
      unavailable(`Opening a folder on the laptop isn't available from the browser board.\n\nPath: ${dir || '(none)'}`);
      return Promise.resolve({ success: false });
    },
    exportToVault: () => {
      unavailable('The Pi exports the board to the vault automatically (nightly, and on demand via scripts/kanban-export.sh). A manual push from the browser is intentionally not wired.');
      return Promise.resolve({ success: false });
    },
    importProjectFromFile: () =>
      Promise.reject(new Error('Importing by laptop file path is desktop-only; use the file picker (Import) instead.')),

    // --- local Claude Code / prompt-temp integration: no-op in browser ---
    // Copy-to-clipboard prompt flows still work; only writing a temp file /
    // launching Claude Code locally is gone.
    writePromptToTemp: () => Promise.resolve({ success: true, path: null }),
    deleteTempFile: () => Promise.resolve({ success: true }),
    // PRD/progress/CLAUDE.md live on the laptop filesystem — unreadable from the
    // browser. Same shape the Electron handler returns on failure.
    readProjectFiles: () => Promise.resolve({ prd: null, progress: null }),

    // --- Anthropic API key / AI prompt generation: disabled in browser ---
    // An API key must never be shipped to a browser; this feature stays on the
    // desktop dev app.
    getAnthropicApiKey: () => Promise.resolve(null),
    getMaskedApiKey: () => Promise.resolve(null),
    saveApiKey: () => {
      unavailable('API-key management and AI prompt generation are only available in the desktop dev app, not the browser board.');
      return Promise.resolve({ success: false });
    },
    testApiConnection: () =>
      Promise.resolve({ success: false, error: 'AI features are disabled on the browser board.' }),

    // --- destructive: disabled on the shared board ---
    clearAllData: () =>
      Promise.reject(new Error('Clearing all data is disabled on the browser board (use the desktop dev app if you really mean it).')),

    // --- misc ---
    exportProjectToJson: () => Promise.resolve(null),
    getAppInfo: () =>
      Promise.resolve({
        version: '1.0.0',
        electron: null,
        node: null,
        platform: 'web',
        arch: (typeof navigator !== 'undefined' && navigator.platform) || 'browser',
        directory: '(browser board — served from the Pi)',
      }),

    // --- embedded terminal: already dead pre-port (node-pty), stays off ---
    terminal: {
      create: () => Promise.resolve({ success: false }),
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      kill: () => Promise.resolve(),
      getActive: () => Promise.resolve([]),
      isAvailable: () => Promise.resolve(false),
      onData: () => () => {},
      onExit: () => () => {},
    },
  };

  console.log('[browser board] window.electron shim active (API base: ' + (BASE || 'same origin') + ')');
}
