const KanbanDatabase = require('./operations');
const { buildSummaryMarkdown } = require('../main/vaultSummary');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\vault-export.test.js

const testDbPath = path.join(__dirname, '../../test-vault-export.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

const mainProject = {
  name: 'Main Project',
  slug: 'main-project',
  phases: [
    {
      name: 'Phase 1',
      subphases: [
        {
          name: 'Subphase 1.1',
          cards: [
            { session_letter: 'A', title: 'Session A', status: 'Done', depends_on_cards: [] },
            { session_letter: 'B', title: 'Session B', status: 'Not Started', depends_on_cards: [] },
            { session_letter: 'C', title: 'Session C', status: 'Not Started', depends_on_cards: ['B'] },
            {
              session_letter: 'D',
              title: 'Session D',
              status: 'Not Started',
              depends_on_cards: [],
              external_dependencies: [
                { project_slug: 'other-project', card_letter: 'X', description: 'needs X' },
                { project_slug: 'other-project', card_letter: 'Y', description: 'needs Y' },
              ],
            },
          ],
        },
      ],
    },
    // Empty phase for deletePhase tests
    {
      name: 'Empty Phase',
      subphases: [{ name: 'Empty Subphase', cards: [] }],
    },
  ],
};

const otherProject = {
  name: 'Other Project',
  slug: 'other-project',
  phases: [
    {
      name: 'Phase 1',
      subphases: [
        {
          name: 'Subphase 1.1',
          cards: [
            { session_letter: 'X', title: 'Session X', status: 'Not Started', depends_on_cards: [] },
            { session_letter: 'Y', title: 'Session Y', status: 'Not Started', depends_on_cards: [] },
          ],
        },
      ],
    },
  ],
};

function runTests() {
  console.log('🧪 Vault export blocked_cards + deletePhase tests...\n');

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

  cleanup();
  const db = new KanbanDatabase(testDbPath);

  try {
    const mainId = db.createProject(mainProject);
    db.createProject(otherProject);

    // ------------------------------------------------------------------
    // blocked_cards in exportForVault
    // ------------------------------------------------------------------
    const data = db.exportForVault();
    const main = data.projects.find(p => p.slug === 'main-project');

    check('Export has blocked_cards array', Array.isArray(main.blocked_cards));

    const letters = main.blocked_cards.map(c => c.session_letter).sort();
    check(
      'Internally (C) and externally (D) blocked cards listed, unblocked B is not',
      JSON.stringify(letters) === '["C","D"]',
      `got ${JSON.stringify(letters)}`
    );

    const cardC = main.blocked_cards.find(c => c.session_letter === 'C');
    const cardD = main.blocked_cards.find(c => c.session_letter === 'D');

    check('Internal blocked_by label', cardC.blocked_by === 'card B', `got "${cardC.blocked_by}"`);
    check(
      'External blocked_by label uses project name and groups letters',
      cardD.blocked_by === 'Other Project X, Y',
      `got "${cardD.blocked_by}"`
    );
    check(
      'Blocked card carries external_dependencies with descriptions',
      cardD.external_dependencies.length === 2 &&
        cardD.external_dependencies[0].description === 'needs X' &&
        cardD.external_dependencies.every(d => d.resolved === false)
    );
    check(
      'Blocked card has same base fields as unblocked cards',
      cardC.title === 'Session C' && cardC.phase === 'Phase 1' &&
        cardC.subphase === 'Subphase 1.1' && Array.isArray(cardC.depends_on_cards)
    );

    // ------------------------------------------------------------------
    // Summary markdown Blocked line
    // ------------------------------------------------------------------
    const summary = buildSummaryMarkdown(data);
    check(
      'Summary lists externally blocked card with blocker',
      summary.includes('D — blocked by Other Project X, Y'),
      summary.split('\n').filter(l => l.includes('Blocked')).join(' | ')
    );
    check(
      'Summary rolls internal-only blocked cards into a count',
      summary.includes('1 card blocked internally')
    );

    // ------------------------------------------------------------------
    // deletePhase: guarded to empty phases
    // ------------------------------------------------------------------
    const project = db.getProject(mainId);
    const fullPhase = project.phases.find(p => p.name === 'Phase 1');
    const emptyPhase = project.phases.find(p => p.name === 'Empty Phase');

    let threw = false;
    try {
      db.deletePhase(fullPhase.id);
    } catch (e) {
      threw = e.message.includes('still contains');
    }
    check('deletePhase refuses a phase with cards', threw);

    check('deletePhase removes an empty phase', db.deletePhase(emptyPhase.id) === true);
    const after = db.getProject(mainId);
    check('Empty phase and its subphase are gone', !after.phases.some(p => p.name === 'Empty Phase'));
    const orphanSubs = db.db.prepare('SELECT COUNT(*) AS c FROM subphases WHERE phase_id = ?').get(emptyPhase.id).c;
    check('Subphase cascade-deleted', orphanSubs === 0);
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
