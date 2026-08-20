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

    // ------------------------------------------------------------------
    // Normalisation on write: letters STORED uppercase, references too
    // ------------------------------------------------------------------
    // createCard with a lowercase, padded letter
    const lowerId = db.createCard(subphase11.id, {
      session_letter: '  g  ',
      title: 'Session G: Lowercase On Write',
      depends_on_cards: [],
    });
    const storedG = db.getCard(lowerId);
    check(
      'createCard stores a lowercase letter uppercased and trimmed',
      storedG.session_letter === 'G',
      `stored ${JSON.stringify(storedG.session_letter)}`
    );

    // A lowercase dependency reference must resolve against the uppercase card
    const depId = db.createCard(subphase11.id, {
      session_letter: 'h',
      title: 'Session H: Depends On Lowercase g',
      depends_on_cards: ['g'],
    });
    const storedH = db.getCard(depId);
    check(
      'depends_on_cards letters are stored uppercased',
      JSON.stringify(storedH.depends_on_cards) === '["G"]',
      `stored ${JSON.stringify(storedH.depends_on_cards)}`
    );

    // The real payoff: blocking has to actually see the reference
    let workableNow = db.getWorkableCards(projectId).map(c => c.session_letter);
    check(
      'H is blocked by its lowercase-written dependency on G',
      !workableNow.includes('H'),
      `workable: ${workableNow.join(',')}`
    );
    check('G itself is workable', workableNow.includes('G'), `workable: ${workableNow.join(',')}`);

    db.updateCardStatus(storedG.id, 'Done');
    workableNow = db.getWorkableCards(projectId).map(c => c.session_letter);
    check(
      'Completing G releases H (lowercase reference resolved)',
      workableNow.includes('H'),
      `workable: ${workableNow.join(',')}`
    );

    // Append import written entirely in lowercase
    const lowerAppend = db.appendCards(projectId, {
      add_to_phase: phase1.id,
      add_to_subphase: subphase11.id,
      new_cards: [
        { session_letter: 'i', title: 'Session I: lower', depends_on_cards: [] },
        { session_letter: 'j', title: 'Session J: lower', depends_on_cards: ['i'] },
      ],
    });
    check('Lowercase append batch inserts', lowerAppend.cardsAdded === 2);

    const afterLower = db.getProject(projectId).phases[0].subphases[0].cards;
    const cardI = afterLower.find(c => c.session_letter === 'I');
    const cardJ = afterLower.find(c => c.session_letter === 'J');
    check('Appended lowercase letters stored uppercase', !!cardI && !!cardJ);
    check(
      'Appended lowercase depends_on_cards stored uppercase',
      cardJ && JSON.stringify(cardJ.depends_on_cards) === '["I"]',
      cardJ && JSON.stringify(cardJ.depends_on_cards)
    );

    let workableLower = db.getWorkableCards(projectId).map(c => c.session_letter);
    check('J blocked by same-batch lowercase dep on I', !workableLower.includes('J'));
    db.updateCardStatus(cardI.id, 'Done');
    workableLower = db.getWorkableCards(projectId).map(c => c.session_letter);
    check('Completing I releases J', workableLower.includes('J'));

    // A lowercase letter must still collide with the uppercase card it becomes
    const lowerClash = throws(() =>
      db.createCard(subphase11.id, { session_letter: 'g', title: 'Second G' })
    );
    check('Lowercase letter still rejected as a duplicate after normalisation', lowerClash !== null);

    // external_dependencies.card_letter normalised the same way
    const extProjectId = db.importProjectFromJson({
      name: 'Ext Target',
      slug: 'ext-target',
      phases: [
        { name: 'P1', subphases: [{ name: 'S1', cards: [{ session_letter: 'q', title: 'Ext Q' }] }] },
      ],
    });
    const extCard = db.getProject(extProjectId).phases[0].subphases[0].cards[0];
    check('Project import stores lowercase letter uppercased', extCard.session_letter === 'Q');

    const refId = db.createCard(subphase11.id, {
      session_letter: 'k',
      title: 'Refs ext lowercase',
      depends_on_cards: [],
      external_dependencies: [
        { project_slug: 'ext-target', card_letter: 'q', description: 'needs Q' },
      ],
    });
    const refCard = db.getCard(refId);
    check(
      'external_dependencies.card_letter stored uppercased',
      refCard.external_dependencies[0].card_letter === 'Q',
      JSON.stringify(refCard.external_dependencies[0])
    );
    check(
      'Lowercase external reference RESOLVES against the uppercase card',
      refCard.external_dependencies[0].project_name === 'Ext Target' &&
        refCard.external_dependencies[0].status === 'Not Started',
      JSON.stringify(refCard.external_dependencies[0])
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
