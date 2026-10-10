const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\settings.test.js

const testDbPath = path.join(__dirname, '../../test-settings.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

function runTests() {
  console.log('🧪 App settings tests (getSetting / setSetting)...\n');

  let passed = 0;
  let failed = 0;
  const check = (name, condition, detail) => {
    if (condition) {
      console.log(`✅ PASSED: ${name}`);
      passed++;
    } else {
      console.log(`❌ FAILED: ${name}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  };
  const errorOf = (fn) => {
    try { fn(); return null; } catch (e) { return e.message; }
  };

  cleanup();
  let db = new KanbanDatabase(testDbPath);

  try {
    // Nothing is seeded
    check('An unset key reads back null', db.getSetting('repo_path_laptop') === null);
    check('Both repo settings start unset',
      db.getSetting('repo_path_laptop') === null && db.getSetting('repo_path_pi') === null);

    // Set, trimmed
    const stored = db.setSetting('repo_path_laptop', '  C:\\Users\\someone\\Kanban  ');
    check('setSetting returns the trimmed stored value', stored === 'C:\\Users\\someone\\Kanban', stored);
    check('getSetting reads it back', db.getSetting('repo_path_laptop') === 'C:\\Users\\someone\\Kanban');

    // Keys are independent
    db.setSetting('repo_path_pi', '~/projects/Kanban_App');
    check('Two keys hold separate values',
      db.getSetting('repo_path_laptop') === 'C:\\Users\\someone\\Kanban' &&
        db.getSetting('repo_path_pi') === '~/projects/Kanban_App');

    // Overwrite
    db.setSetting('repo_path_pi', '/srv/kanban');
    check('Setting again overwrites', db.getSetting('repo_path_pi') === '/srv/kanban');

    // Survives closing and reopening the database (a container restart)
    db.close();
    db = new KanbanDatabase(testDbPath);
    check('Values survive reopening the database',
      db.getSetting('repo_path_laptop') === 'C:\\Users\\someone\\Kanban' &&
        db.getSetting('repo_path_pi') === '/srv/kanban');

    // Clearing: empty, whitespace or null all return to "not set", not ""
    check('Saving an empty value clears to null', db.setSetting('repo_path_pi', '') === null &&
      db.getSetting('repo_path_pi') === null);
    db.setSetting('repo_path_pi', 'x');
    db.setSetting('repo_path_pi', '   ');
    check('Saving whitespace clears to null', db.getSetting('repo_path_pi') === null);
    db.setSetting('repo_path_pi', 'x');
    db.setSetting('repo_path_pi', null);
    check('Saving null clears to null', db.getSetting('repo_path_pi') === null);
    check('Clearing one key leaves the other', db.getSetting('repo_path_laptop') === 'C:\\Users\\someone\\Kanban');

    // Validation
    check('An empty key is rejected', errorOf(() => db.setSetting('', 'x')) !== null);
    check('A non-string value is rejected', errorOf(() => db.setSetting('k', 42)) !== null);
    check('getSetting rejects an empty key', errorOf(() => db.getSetting('  ')) !== null);
  } catch (error) {
    console.log(`❌ FAILED: unexpected error — ${error.stack}`);
    failed++;
  } finally {
    db.close();
    cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
