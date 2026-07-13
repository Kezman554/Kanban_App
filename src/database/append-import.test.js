const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\append-import.test.js

const testDbPath = path.join(__dirname, '../../test-append-import.db');

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
          ],
        },
      ],
    },
  ],
};

const externalProject = {
  name: 'External Project',
  slug: 'ext-project',
  phases: [
    {
      name: 'Phase 1',
      subphases: [
        {
          name: 'Subphase 1.1',
          cards: [
            { session_letter: 'X', title: 'Session X', status: 'Not Started', depends_on_cards: [] },
          ],
        },
      ],
    },
  ],
};

function runTests() {
  console.log('🧪 Append import tests (same-batch deps, external deps, unknown keys)...\n');

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
    const extId = db.createProject(externalProject);
    const mainSubphase = db.getProject(mainId).phases[0].subphases[0];

    // ------------------------------------------------------------------
    // BUG 2: same-batch internal dependency resolution
    // ------------------------------------------------------------------
    const result1 = db.appendCards(mainId, {
      add_to_phase: db.getProject(mainId).phases[0].id,
      add_to_subphase: mainSubphase.id,
      new_cards: [
        { session_letter: 'Y', title: 'Session Y', depends_on_cards: [] },
        { session_letter: 'Z', title: 'Session Z', depends_on_cards: ['Y'] },
      ],
    });
    check('Append batch inserts both cards', result1.cardsAdded === 2);

    const afterAppend = db.getProject(mainId).phases[0].subphases[0].cards;
    const cardY = afterAppend.find(c => c.session_letter === 'Y');
    const cardZ = afterAppend.find(c => c.session_letter === 'Z');

    check(
      'Same-batch depends_on_cards reference survives import',
      cardZ && JSON.stringify(cardZ.depends_on_cards) === '["Y"]',
      `got ${cardZ && JSON.stringify(cardZ.depends_on_cards)}`
    );

    let workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('Z is blocked while same-batch dep Y is not done', !workable.includes('Z'));
    check('Y itself is workable', workable.includes('Y'));

    db.updateCardStatus(cardY.id, 'Done');
    workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('Completing Y releases Z', workable.includes('Z'));

    // ------------------------------------------------------------------
    // FEATURE: external_dependencies import + gating
    // ------------------------------------------------------------------
    const result2 = db.appendCards(mainId, {
      add_to_phase: db.getProject(mainId).phases[0].id,
      add_to_subphase: mainSubphase.id,
      new_cards: [
        {
          session_letter: 'E',
          title: 'Needs external card',
          depends_on_cards: [],
          external_dependencies: [
            { project_slug: 'ext-project', card_letter: 'X', description: 'X must be done first' },
          ],
        },
        {
          session_letter: 'F',
          title: 'References missing project',
          depends_on_cards: [],
          external_dependencies: [
            { project_slug: 'no-such-project', card_letter: 'Q', description: 'dangling ref' },
          ],
        },
      ],
    });
    check('External-dep cards import', result2.cardsAdded === 2);

    const cards2 = db.getProject(mainId).phases[0].subphases[0].cards;
    const cardE = cards2.find(c => c.session_letter === 'E');
    const cardF = cards2.find(c => c.session_letter === 'F');

    check(
      'Stored external dep is resolved with project name and status',
      cardE.external_dependencies.length === 1 &&
        cardE.external_dependencies[0].project_name === 'External Project' &&
        cardE.external_dependencies[0].status === 'Not Started' &&
        cardE.external_dependencies[0].resolved === false
    );

    workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('E blocked while ext-project/X is not done', !workable.includes('E'));
    check('F blocked when referenced project does not exist (never silently unblock)', !workable.includes('F'));
    check(
      'Blocked reason names the external dependency',
      (db.getBlockedReason(cardE.id) || '').includes('ext-project/X')
    );
    check(
      'Missing-project dep is flagged unresolved with no project_name',
      cardF.external_dependencies[0].resolved === false && cardF.external_dependencies[0].project_name === null
    );

    // Complete the external card -> E should unblock, F stays blocked
    const extCardX = db.getProject(extId).phases[0].subphases[0].cards[0];
    db.updateCardStatus(extCardX.id, 'Done');
    workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('Completing ext-project/X releases E', workable.includes('E'));
    check('F remains blocked (dangling ref)', !workable.includes('F'));

    // ------------------------------------------------------------------
    // Unknown-key reporting (never silently drop fields)
    // ------------------------------------------------------------------
    const result3 = db.appendCards(mainId, {
      add_to_phase: db.getProject(mainId).phases[0].id,
      add_to_subphase: mainSubphase.id,
      totally_unknown_top_key: true,
      new_cards: [
        { session_letter: 'G', title: 'Has unknown field', mystery_field: 42, notes: 'imported note' },
      ],
    });
    check(
      'Unknown top-level key is reported',
      result3.warnings.some(w => w.includes('totally_unknown_top_key'))
    );
    check(
      'Unknown card key is reported with card letter',
      result3.warnings.some(w => w.includes('"G"') && w.includes('mystery_field'))
    );
    const cardG = db.getProject(mainId).phases[0].subphases[0].cards.find(c => c.session_letter === 'G');
    check('notes field survives append import', cardG.notes === 'imported note');

    // ------------------------------------------------------------------
    // Export: canonical external_dependencies schema
    // ------------------------------------------------------------------
    const exported = db.exportProjectToJson(mainId);
    const exportedE = exported.phases[0].subphases[0].cards.find(c => c.session_letter === 'E');
    check(
      'Export serialises external_dependencies with canonical fields only',
      JSON.stringify(exportedE.external_dependencies) ===
        JSON.stringify([{ project_slug: 'ext-project', card_letter: 'X', description: 'X must be done first' }])
    );
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
