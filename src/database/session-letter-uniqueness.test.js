const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\session-letter-uniqueness.test.js

const testDbPath = path.join(__dirname, '../../test-session-letters.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// Two phases, so the cross-phase case is a real one: B lives in a different
// phase from the subphase the appends target.
const baseProject = {
  name: 'Letters Project',
  slug: 'letters-project',
  phases: [
    {
      name: 'Phase 1',
      subphases: [
        {
          name: 'Subphase 1.1',
          cards: [
            { session_letter: 'A', title: 'Session A: Setup', status: 'Not Started', depends_on_cards: [] },
          ],
        },
      ],
    },
    {
      name: 'Phase 2',
      subphases: [
        {
          name: 'Subphase 2.1',
          cards: [
            { session_letter: 'B', title: 'Session B: Second Phase Work', status: 'Not Started', depends_on_cards: [] },
          ],
        },
      ],
    },
  ],
};

function runTests() {
  console.log('🧪 Session letter uniqueness tests (createCard, append import, project import)...\n');

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

  // Runs fn, returns the thrown message (or null if it didn't throw)
  const throws = (fn) => {
    try {
      fn();
      return null;
    } catch (error) {
      return error.message;
    }
  };

  cleanup();
  const db = new KanbanDatabase(testDbPath);

  try {
    const projectId = db.createProject(baseProject);
    const project = db.getProject(projectId);
    const phase1 = project.phases[0];
    const subphase11 = phase1.subphases[0];

    const cardCount = () => {
      const p = db.getProject(projectId);
      return p.phases.reduce(
        (n, ph) => n + ph.subphases.reduce((m, s) => m + s.cards.length, 0),
        0
      );
    };

    check('Baseline project has 2 cards', cardCount() === 2, `got ${cardCount()}`);

    // ------------------------------------------------------------------
    // createCard: the dialog's backstop + the Pi's HTTP POST
    // ------------------------------------------------------------------
    const okId = db.createCard(subphase11.id, { session_letter: 'C', title: 'Session C: New' });
    check('createCard accepts an unused letter', typeof okId === 'number' && cardCount() === 3);

    const dupSameSubphase = throws(() =>
      db.createCard(subphase11.id, { session_letter: 'A', title: 'Clashes with A' })
    );
    check(
      'createCard rejects a letter used in the same subphase',
      dupSameSubphase !== null,
      'no error thrown'
    );
    check(
      'createCard error names the conflicting card',
      dupSameSubphase && dupSameSubphase.includes('Session A: Setup'),
      dupSameSubphase
    );

    // The point of project-scoping: B is in Phase 2, the new card targets Phase 1
    const dupOtherPhase = throws(() =>
      db.createCard(subphase11.id, { session_letter: 'B', title: 'Clashes across phases' })
    );
    check(
      'createCard rejects a letter used in a DIFFERENT phase (project-scoped)',
      dupOtherPhase !== null && dupOtherPhase.includes('Session B: Second Phase Work'),
      dupOtherPhase
    );

    const dupLowercase = throws(() =>
      db.createCard(subphase11.id, { session_letter: 'b', title: 'Lowercase clash' })
    );
    check(
      'createCard rejects a case-different duplicate ("b" vs "B")',
      dupLowercase !== null,
      'no error thrown'
    );

    const dupPadded = throws(() =>
      db.createCard(subphase11.id, { session_letter: '  A  ', title: 'Padded clash' })
    );
    check('createCard rejects a whitespace-padded duplicate', dupPadded !== null, 'no error thrown');

    const emptyLetter = throws(() =>
      db.createCard(subphase11.id, { session_letter: '   ', title: 'No letter' })
    );
    check('createCard rejects an empty session_letter', emptyLetter !== null, 'no error thrown');

    check('No rejected card was written', cardCount() === 3, `got ${cardCount()}`);

    // ------------------------------------------------------------------
    // Append import: the path the append skill actually uses
    // ------------------------------------------------------------------
    const appendOk = db.appendCards(projectId, {
      add_to_phase: phase1.id,
      add_to_subphase: subphase11.id,
      new_cards: [{ session_letter: 'D', title: 'Session D: Fine' }],
    });
    check('Append accepts unused letters', appendOk.cardsAdded === 1 && cardCount() === 4);

    const appendDup = throws(() =>
      db.appendCards(projectId, {
        add_to_phase: phase1.id,
        add_to_subphase: subphase11.id,
        new_cards: [{ session_letter: 'B', title: 'Append clash' }],
      })
    );
    check('Append rejects a letter already on the board', appendDup !== null, 'no error thrown');
    check(
      'Append error names the conflicting card',
      appendDup && appendDup.includes('Session B: Second Phase Work'),
      appendDup
    );

    // A stale export is the realistic source: the generator saw the board
    // before C was added, so it hands out C again.
    const appendStale = throws(() =>
      db.appendCards(projectId, {
        add_to_phase: phase1.id,
        add_to_subphase: subphase11.id,
        new_cards: [
          { session_letter: 'E', title: 'Session E: Fine' },
          { session_letter: 'C', title: 'Stale generator reused C' },
        ],
      })
    );
    check('Append rejects a stale-export duplicate mid-batch', appendStale !== null, 'no error thrown');
    check(
      'Rejected append batch is rolled back entirely (E did not land)',
      cardCount() === 4,
      `got ${cardCount()} cards`
    );

    const appendSelfDup = throws(() =>
      db.appendCards(projectId, {
        add_to_phase: phase1.id,
        add_to_subphase: subphase11.id,
        new_cards: [
          { session_letter: 'F', title: 'First F' },
          { session_letter: 'F', title: 'Second F' },
        ],
      })
    );
    check(
      'Append rejects the same letter twice within one batch',
      appendSelfDup !== null && appendSelfDup.includes('Second F'),
      appendSelfDup
    );
    check('Self-duplicate batch is rolled back', cardCount() === 4, `got ${cardCount()}`);

    // ------------------------------------------------------------------
    // Project import: one payload carrying the same letter twice
    // ------------------------------------------------------------------
    const importDup = throws(() =>
      db.importProjectFromJson({
        name: 'Dup Project',
        slug: 'dup-project',
        phases: [
          {
            name: 'P1',
            subphases: [
              {
                name: 'S1',
                cards: [
                  { session_letter: 'A', title: 'First A' },
                  { session_letter: 'A', title: 'Second A' },
                ],
              },
            ],
          },
        ],
      })
    );
    check('Project import rejects a duplicate letter in one payload', importDup !== null, 'no error thrown');
    check(
      'Project import error names both clashing cards',
      importDup && importDup.includes('First A') && importDup.includes('Second A'),
      importDup
    );
    check(
      'Rejected project import left no project behind',
      !db.getAllProjects().some(p => p.slug === 'dup-project')
    );

    // Same letter in a DIFFERENT project is fine - letters are project-scoped
    const otherId = db.importProjectFromJson({
      name: 'Other Project',
      slug: 'other-project',
      phases: [
        { name: 'P1', subphases: [{ name: 'S1', cards: [{ session_letter: 'A', title: 'Other A' }] }] },
      ],
    });
    check('Same letter in another project is allowed', typeof otherId === 'number');
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
