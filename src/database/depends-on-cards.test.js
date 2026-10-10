const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\depends-on-cards.test.js

const testDbPath = path.join(__dirname, '../../test-depends-on-cards.db');

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
            { session_letter: 'C', title: 'Session C', status: 'Not Started', depends_on_cards: [] },
            { session_letter: 'D', title: 'Session D', status: 'Not Started', depends_on_cards: ['C'] },
            // F carries a dangling letter from an old import
            { session_letter: 'F', title: 'Session F', status: 'Not Started', depends_on_cards: ['Q', 'B'] },
          ],
        },
      ],
    },
  ],
};

// A second project with the same letters, to prove resolution is project-scoped
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
            { session_letter: 'B', title: 'Other B', status: 'Not Started', depends_on_cards: ['C'] },
            { session_letter: 'C', title: 'Other C', status: 'Not Started', depends_on_cards: [] },
            { session_letter: 'Z', title: 'Other Z', status: 'Not Started', depends_on_cards: [] },
          ],
        },
      ],
    },
  ],
};

function runTests() {
  console.log('🧪 Same-board dependency editing tests (add, remove, self-reference, cycles, importer)...\n');

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
  const db = new KanbanDatabase(testDbPath);

  try {
    const mainId = db.createProject(mainProject);
    db.createProject(otherProject);
    const cardsOf = () => {
      const map = {};
      for (const c of db.getProject(mainId).phases[0].subphases[0].cards) map[c.session_letter] = c;
      return map;
    };
    const workable = () => db.getWorkableCards(mainId).map(c => c.session_letter);
    const { B, C, D, F } = cardsOf();

    // ------------------------------------------------------------------
    // ADD - blocks the card and removes it from the workable list
    // ------------------------------------------------------------------
    check('C starts workable', workable().includes('C'));
    db.updateCardDependsOnCards(C.id, [' b ']);
    check('Added letter is stored trimmed and uppercased', JSON.stringify(db.getCard(C.id).depends_on_cards) === '["B"]',
      JSON.stringify(db.getCard(C.id).depends_on_cards));
    check('C is blocked after adding B', db.getBlockedReason(C.id) === 'Waiting on card: B', db.getBlockedReason(C.id));
    check('C leaves the workable list', !workable().includes('C'));

    // ------------------------------------------------------------------
    // REMOVE - single write, card returns to the workable list
    // ------------------------------------------------------------------
    db.updateCardDependsOnCards(C.id, []);
    check('Removing leaves an empty array', db.getCard(C.id).depends_on_cards.length === 0);
    check('C returns to the workable list', workable().includes('C'));

    // A dependency on a Done card is legal and satisfied immediately
    db.updateCardDependsOnCards(C.id, ['A']);
    check('Depending on Done card A is accepted and leaves C workable', workable().includes('C') && db.getBlockedReason(C.id) === null);
    db.updateCardDependsOnCards(C.id, []);

    // ------------------------------------------------------------------
    // SELF-REFERENCE and UNKNOWN LETTERS
    // ------------------------------------------------------------------
    const selfErr = errorOf(() => db.updateCardDependsOnCards(B.id, ['b']));
    check('Self-reference is refused', selfErr && selfErr.includes('cannot depend on itself'), selfErr);
    const unknownErr = errorOf(() => db.updateCardDependsOnCards(B.id, ['Q']));
    check('A letter absent from the project is refused', unknownErr && unknownErr.includes('no card Q'), unknownErr);
    const otherErr = errorOf(() => db.updateCardDependsOnCards(B.id, ['Z']));
    check('A letter that only exists in another project is refused', otherErr && otherErr.includes('no card Z'), otherErr);
    check('Refused updates leave B unchanged', db.getCard(B.id).depends_on_cards.length === 0);

    // ------------------------------------------------------------------
    // CYCLES
    // ------------------------------------------------------------------
    // D -> C already. C -> D would close a two-card loop.
    const twoErr = errorOf(() => db.updateCardDependsOnCards(C.id, ['D']));
    check('Two-card cycle is refused, naming the loop', twoErr && twoErr.includes('C -> D -> C'), twoErr);
    check('C is unchanged after the refused cycle', db.getCard(C.id).depends_on_cards.length === 0);

    // C -> B is fine; then B -> D closes B -> D -> C -> B
    db.updateCardDependsOnCards(C.id, ['B']);
    const threeErr = errorOf(() => db.updateCardDependsOnCards(B.id, ['D']));
    check('Three-card cycle is refused, naming the full path', threeErr && threeErr.includes('B -> D -> C -> B'), threeErr);

    // Other project has B -> C. Here B has no dependencies, so C -> B only
    // looks like a loop if the other project's edges leaked into the graph.
    db.updateCardDependsOnCards(C.id, []);
    check(
      'Letters resolve project-scoped (other project\'s B -> C does not block C -> B here)',
      errorOf(() => db.updateCardDependsOnCards(C.id, ['B'])) === null
    );
    db.updateCardDependsOnCards(C.id, []);

    // ------------------------------------------------------------------
    // Legacy dangling letter: keep it while removing another entry
    // ------------------------------------------------------------------
    const keepErr = errorOf(() => db.updateCardDependsOnCards(F.id, ['Q']));
    check('An existing dangling letter can be kept while removing B', keepErr === null, keepErr);
    db.updateCardDependsOnCards(F.id, []);
    check('The dangling letter can then be removed', db.getCard(F.id).depends_on_cards.length === 0);

    // clearCardDependencies is untouched and still wipes everything
    db.updateCardDependsOnCards(F.id, ['B', 'C']);
    db.clearCardDependencies(F.id);
    check('clearCardDependencies still wipes the whole array', db.getCard(F.id).depends_on_cards.length === 0);

    // ------------------------------------------------------------------
    // IMPORTER - dependency_updates gets the same checks
    // ------------------------------------------------------------------
    const subphase = db.getProject(mainId).phases[0].subphases[0];
    const phaseId = db.getProject(mainId).phases[0].id;

    const importSelf = errorOf(() => db.appendCards(mainId, {
      add_to_phase: phaseId,
      add_to_subphase: subphase.id,
      new_cards: [],
      dependency_updates: [{ card: 'B', add_dependency: 'b' }],
    }));
    check('Importer refuses a self-reference', importSelf && importSelf.includes('cannot depend on itself'), importSelf);

    const importCycle = errorOf(() => db.appendCards(mainId, {
      add_to_phase: phaseId,
      add_to_subphase: subphase.id,
      new_cards: [{ session_letter: 'G', title: 'Session G', depends_on_cards: [] }],
      dependency_updates: [{ card: 'C', add_dependencies: ['D'] }],
    }));
    check('Importer refuses a cycle with an existing edge', importCycle && importCycle.includes('C -> D -> C'), importCycle);
    check('A refused import lands nothing', !cardsOf().G);

    // Two updates in one file that only cycle together
    const importPair = errorOf(() => db.appendCards(mainId, {
      add_to_phase: phaseId,
      add_to_subphase: subphase.id,
      new_cards: [],
      dependency_updates: [
        { card: 'B', add_dependencies: ['F'] },
        { card: 'F', add_dependencies: ['B'] },
      ],
    }));
    check('Importer refuses a cycle formed by two updates in one file', importPair && importPair.includes('F -> B -> F'), importPair);
    check('Neither half of the refused pair landed', db.getCard(B.id).depends_on_cards.length === 0);

    // A legal update still applies
    const ok = db.appendCards(mainId, {
      add_to_phase: phaseId,
      add_to_subphase: subphase.id,
      new_cards: [],
      dependency_updates: [{ card: 'B', add_dependencies: ['c'] }],
    });
    check('A legal dependency update still applies', ok.dependenciesUpdated === 1 &&
      JSON.stringify(db.getCard(B.id).depends_on_cards) === '["C"]');
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
