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
  console.log('🧪 Append import tests (same-batch deps, external deps, unknown keys, multi-destination batches)...\n');

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
    // Letters climb through the file (A, then B C, then E F G): one below the
    // project's high-water mark that no card holds is retired and refused
    const result1 = db.appendCards(mainId, {
      add_to_phase: db.getProject(mainId).phases[0].id,
      add_to_subphase: mainSubphase.id,
      new_cards: [
        { session_letter: 'B', title: 'Session B', depends_on_cards: [] },
        { session_letter: 'C', title: 'Session C', depends_on_cards: ['B'] },
      ],
    });
    check('Append batch inserts both cards', result1.cardsAdded === 2);

    const afterAppend = db.getProject(mainId).phases[0].subphases[0].cards;
    const cardB = afterAppend.find(c => c.session_letter === 'B');
    const cardC = afterAppend.find(c => c.session_letter === 'C');

    check(
      'Same-batch depends_on_cards reference survives import',
      cardC && JSON.stringify(cardC.depends_on_cards) === '["B"]',
      `got ${cardC && JSON.stringify(cardC.depends_on_cards)}`
    );

    let workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('C is blocked while same-batch dep B is not done', !workable.includes('C'));
    check('B itself is workable', workable.includes('B'));

    db.updateCardStatus(cardB.id, 'Done');
    workable = db.getWorkableCards(mainId).map(c => c.session_letter);
    check('Completing B releases C', workable.includes('C'));

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

    // ------------------------------------------------------------------
    // MULTI-DESTINATION: a `batches` array, one placement per batch
    // ------------------------------------------------------------------
    const multiProject = {
      name: 'Multi Project',
      slug: 'multi-project',
      phases: [
        {
          name: 'Phase 1',
          subphases: [
            { name: 'Subphase 1.1', cards: [{ session_letter: 'A', title: 'Session A', status: 'Done', depends_on_cards: [] }] },
            { name: 'Subphase 1.2', cards: [] },
          ],
        },
      ],
    };

    const multiId = db.createProject(multiProject);
    const multiPhase = db.getProject(multiId).phases[0];
    const sub11 = multiPhase.subphases[0];
    const sub12 = multiPhase.subphases[1];

    // Two batches into two different existing subphases
    const multi1 = db.appendCards(multiId, {
      batches: [
        {
          add_to_phase: multiPhase.id,
          add_to_subphase: sub11.id,
          new_cards: [{ session_letter: 'B', title: 'Into 1.1', depends_on_cards: [] }],
        },
        {
          add_to_phase: multiPhase.id,
          add_to_subphase: sub12.id,
          new_cards: [
            { session_letter: 'C', title: 'Into 1.2', depends_on_cards: [] },
            { session_letter: 'D', title: 'Also into 1.2', depends_on_cards: ['B'] },
          ],
        },
      ],
      dependency_updates: [{ card: 'C', add_dependencies: ['D'] }],
    });

    check('Two batches insert every card', multi1.cardsAdded === 3, `got ${multi1.cardsAdded}`);

    let multiState = db.getProject(multiId).phases[0];
    const letters = sub => multiState.subphases.find(s => s.id === sub).cards.map(c => c.session_letter).sort();
    check('Batch 1 cards land in subphase 1.1', JSON.stringify(letters(sub11.id)) === '["A","B"]', JSON.stringify(letters(sub11.id)));
    check('Batch 2 cards land in subphase 1.2', JSON.stringify(letters(sub12.id)) === '["C","D"]', JSON.stringify(letters(sub12.id)));
    check(
      'dependency_updates applies to a letter added by another batch',
      multi1.dependenciesUpdated === 1 &&
        JSON.stringify(multiState.subphases.find(s => s.id === sub12.id).cards.find(c => c.session_letter === 'C').depends_on_cards) === '["D"]'
    );

    // One batch creating a new phase, another targeting an existing subphase
    const multi2 = db.appendCards(multiId, {
      batches: [
        {
          new_phase: { name: 'Phase 2', short_name: 'P2' },
          new_subphase: { name: 'Subphase 2.1' },
          new_cards: [{ session_letter: 'E', title: 'In brand new phase', depends_on_cards: [] }],
        },
        {
          add_to_phase: multiPhase.id,
          add_to_subphase: sub11.id,
          new_cards: [{ session_letter: 'F', title: 'Into existing 1.1', depends_on_cards: [] }],
        },
        {
          add_to_phase: multiPhase.id,
          new_subphase: { name: 'Subphase 1.3' },
          new_cards: [{ session_letter: 'G', title: 'Into new subphase of phase 1', depends_on_cards: [] }],
        },
      ],
    });

    check('Mixed-placement batches insert every card', multi2.cardsAdded === 3, `got ${multi2.cardsAdded}`);
    check('createdPhases lists the one new phase', multi2.createdPhases.length === 1 && multi2.createdPhases[0].name === 'Phase 2');
    check('createdSubphases lists both new subphases', multi2.createdSubphases.length === 2);
    check('createdPhase singular set when exactly one phase created', multi2.createdPhase && multi2.createdPhase.name === 'Phase 2');
    check('createdSubphase singular null when two subphases created', multi2.createdSubphase === null);

    const multiAfter = db.getProject(multiId);
    const phase2 = multiAfter.phases.find(p => p.name === 'Phase 2');
    check(
      'New phase holds only its own batch card',
      phase2 && phase2.subphases.length === 1 && phase2.subphases[0].cards.map(c => c.session_letter).join(',') === 'E'
    );
    const sub13 = multiAfter.phases.find(p => p.id === multiPhase.id).subphases.find(s => s.name === 'Subphase 1.3');
    check('New subphase under existing phase holds its batch card', sub13 && sub13.cards.map(c => c.session_letter).join(',') === 'G');
    check(
      'Existing-subphase batch appended alongside earlier cards',
      multiAfter.phases.find(p => p.id === multiPhase.id).subphases
        .find(s => s.id === sub11.id).cards.map(c => c.session_letter).sort().join(',') === 'A,B,F'
    );

    // Letter duplicated across two batches
    let crossBatchError = null;
    try {
      db.appendCards(multiId, {
        batches: [
          { add_to_phase: multiPhase.id, add_to_subphase: sub11.id, new_cards: [{ session_letter: 'H', title: 'First H' }] },
          { add_to_phase: multiPhase.id, add_to_subphase: sub12.id, new_cards: [{ session_letter: 'J', title: 'Unique J' }] },
          { add_to_phase: multiPhase.id, add_to_subphase: sub12.id, new_cards: [{ session_letter: 'H', title: 'Second H' }] },
        ],
      });
    } catch (err) {
      crossBatchError = err.message;
    }
    check(
      'Letter reused in a later batch is rejected, naming both cards',
      crossBatchError !== null && crossBatchError.includes('First H') && crossBatchError.includes('Second H'),
      crossBatchError
    );

    // ------------------------------------------------------------------
    // Rollback: a failure in a later batch undoes earlier batches' phases,
    // subphases and cards, not just the cards
    // ------------------------------------------------------------------
    const beforePhaseCount = db.getProject(multiId).phases.length;
    const beforeSubCount = db.getProject(multiId).phases.reduce((n, p) => n + p.subphases.length, 0);
    const beforeCardCount = db.getProject(multiId).phases.reduce(
      (n, p) => n + p.subphases.reduce((m, s) => m + s.cards.length, 0), 0
    );

    let rollbackError = null;
    try {
      db.appendCards(multiId, {
        batches: [
          {
            new_phase: { name: 'Doomed Phase' },
            new_subphase: { name: 'Doomed Subphase' },
            new_cards: [{ session_letter: 'K', title: 'Doomed card' }],
          },
          {
            add_to_phase: multiPhase.id,
            new_subphase: { name: 'Doomed Subphase 2' },
            new_cards: [{ session_letter: 'L', title: 'Another doomed card' }],
          },
          {
            // Batch 3 fails: no such phase
            add_to_phase: 999999,
            add_to_subphase: 999999,
            new_cards: [{ session_letter: 'M', title: 'Never lands' }],
          },
        ],
      });
    } catch (err) {
      rollbackError = err.message;
    }

    const afterRollback = db.getProject(multiId);
    check('Failure in batch 3 throws', rollbackError !== null && rollbackError.includes('Batch 3'), rollbackError);
    check('Rollback removes phases created by batch 1', afterRollback.phases.length === beforePhaseCount);
    check(
      'Rollback removes subphases created by batches 1 and 2',
      afterRollback.phases.reduce((n, p) => n + p.subphases.length, 0) === beforeSubCount
    );
    check(
      'Rollback removes cards inserted before the failure',
      afterRollback.phases.reduce((n, p) => n + p.subphases.reduce((m, s) => m + s.cards.length, 0), 0) === beforeCardCount
    );
    check('No "Doomed Phase" survives', !afterRollback.phases.some(p => p.name === 'Doomed Phase'));

    // ------------------------------------------------------------------
    // Mixing the two file forms is rejected
    // ------------------------------------------------------------------
    let mixedError = null;
    try {
      db.appendCards(multiId, {
        add_to_phase: multiPhase.id,
        add_to_subphase: sub11.id,
        new_cards: [{ session_letter: 'N', title: 'Top-level card' }],
        batches: [
          { add_to_phase: multiPhase.id, add_to_subphase: sub12.id, new_cards: [{ session_letter: 'P', title: 'Batch card' }] },
        ],
      });
    } catch (err) {
      mixedError = err.message;
    }
    check(
      'A file mixing "batches" with top-level placement is rejected',
      mixedError !== null && mixedError.includes('batches') && mixedError.includes('new_cards'),
      mixedError
    );
    check(
      'Nothing from the mixed file was imported',
      !db.getProject(multiId).phases.some(p => p.subphases.some(s => s.cards.some(c => ['N', 'P'].includes(c.session_letter))))
    );

    // Batch-level unknown keys and card keys are reported with their batch
    const warnResult = db.appendCards(multiId, {
      batches: [
        { add_to_phase: multiPhase.id, add_to_subphase: sub11.id, new_cards: [{ session_letter: 'Q', title: 'Fine' }] },
        {
          add_to_phase: multiPhase.id,
          add_to_subphase: sub12.id,
          mystery_batch_key: true,
          new_cards: [{ session_letter: 'R', title: 'Odd fields', mystery_field: 1 }],
        },
      ],
    });
    check(
      'Batch-level unknown key warning names the batch',
      warnResult.warnings.some(w => w.includes('Batch 2') && w.includes('mystery_batch_key')),
      JSON.stringify(warnResult.warnings)
    );
    check(
      'Card-level unknown key warning names the batch and card',
      warnResult.warnings.some(w => w.includes('Batch 2') && w.includes('"R"') && w.includes('mystery_field')),
      JSON.stringify(warnResult.warnings)
    );

    // ------------------------------------------------------------------
    // Legacy single-destination file still imports exactly as before
    // ------------------------------------------------------------------
    const legacyId = db.createProject({
      name: 'Legacy Project',
      slug: 'legacy-project',
      phases: [{ name: 'Phase 1', subphases: [{ name: 'Subphase 1.1', cards: [] }] }],
    });
    const legacyPhase = db.getProject(legacyId).phases[0];
    const legacyResult = db.appendCards(legacyId, {
      add_to_phase: legacyPhase.id,
      add_to_subphase: legacyPhase.subphases[0].id,
      new_cards: [
        { session_letter: 'A', title: 'Legacy A' },
        // B must not depend on A here: the update below adds A -> B, and the
        // pair would be a cycle the importer now refuses
        { session_letter: 'B', title: 'Legacy B' },
      ],
      dependency_updates: [{ card: 'A', add_dependencies: ['B'] }],
    });
    const legacyCards = db.getProject(legacyId).phases[0].subphases[0].cards;
    check('Legacy file inserts its cards', legacyResult.cardsAdded === 2 && legacyCards.length === 2);
    check('Legacy file applies dependency updates', legacyResult.dependenciesUpdated === 1);
    check('Legacy file reports no created phase/subphase', legacyResult.createdPhase === null && legacyResult.createdSubphase === null);
    check(
      'Legacy file returns empty created arrays',
      Array.isArray(legacyResult.createdPhases) && legacyResult.createdPhases.length === 0 &&
        Array.isArray(legacyResult.createdSubphases) && legacyResult.createdSubphases.length === 0
    );

    const legacyNewPhase = db.appendCards(legacyId, {
      new_phase: { name: 'Legacy Phase 2' },
      new_subphase: { name: 'Legacy Subphase 2.1' },
      new_cards: [{ session_letter: 'C', title: 'Legacy C' }],
    });
    check(
      'Legacy new_phase form still populates the singular fields',
      legacyNewPhase.createdPhase.name === 'Legacy Phase 2' &&
        legacyNewPhase.createdSubphase.name === 'Legacy Subphase 2.1' &&
        legacyNewPhase.createdPhases.length === 1 && legacyNewPhase.createdSubphases.length === 1
    );

    let legacyDupError = null;
    try {
      db.appendCards(legacyId, {
        add_to_phase: legacyPhase.id,
        add_to_subphase: legacyPhase.subphases[0].id,
        new_cards: [
          { session_letter: 'D', title: 'First D' },
          { session_letter: 'D', title: 'Second D' },
        ],
      });
    } catch (err) {
      legacyDupError = err.message;
    }
    check(
      'Legacy within-file duplicate letter still rejected with both titles',
      legacyDupError !== null && legacyDupError.includes('First D') && legacyDupError.includes('Second D'),
      legacyDupError
    );

    // ------------------------------------------------------------------
    // new_cards' own depends_on_cards: self-reference, unknown letters and
    // loops, checked across the whole file before anything is inserted
    // ------------------------------------------------------------------
    const loopId = db.createProject({
      name: 'Loop Project',
      slug: 'loop-project',
      phases: [{
        name: 'Phase 1',
        subphases: [
          {
            name: 'Subphase 1.1',
            cards: [
              { session_letter: 'A', title: 'Existing A', status: 'Done', depends_on_cards: [] },
              { session_letter: 'D', title: 'Existing D', status: 'Not Started', depends_on_cards: [] },
            ],
          },
          { name: 'Subphase 1.2', cards: [] },
        ],
      }],
    });
    const loopPhase = db.getProject(loopId).phases[0];
    const [loopSub1, loopSub2] = loopPhase.subphases;
    const loopCount = () => db.getProject(loopId).phases.reduce(
      (n, ph) => n + ph.subphases.reduce((m, s) => m + s.cards.length, 0), 0
    );
    const loopErr = (data) => {
      try { db.appendCards(loopId, data); return null; } catch (e) { return e.message; }
    };
    const single = (new_cards, extra = {}) => ({
      add_to_phase: loopPhase.id, add_to_subphase: loopSub1.id, new_cards, ...extra,
    });

    // Two new cards in one batch looping
    let err = loopErr(single([
      { session_letter: 'P', title: 'New P', depends_on_cards: ['R'] },
      { session_letter: 'R', title: 'New R', depends_on_cards: ['P'] },
    ]));
    check(
      'Two new cards in one batch looping are refused, naming the path and both cards',
      err && err.includes('card "P"') && err.includes('P -> R -> P') &&
        err.includes('"New P" (new in this file)') && err.includes('"New R" (new in this file)'),
      err
    );
    check('Same-batch loop lands nothing', loopCount() === 2, `cards: ${loopCount()}`);

    // Two new cards in different batches, each fine alone, looping together
    err = loopErr({
      batches: [
        { add_to_phase: loopPhase.id, add_to_subphase: loopSub1.id,
          new_cards: [{ session_letter: 'P', title: 'New P', depends_on_cards: ['R'] }] },
        { add_to_phase: loopPhase.id, add_to_subphase: loopSub2.id,
          new_cards: [{ session_letter: 'R', title: 'New R', depends_on_cards: ['P'] }] },
      ],
    });
    check(
      'Cross-batch loop is refused, naming each card\'s batch',
      err && err.includes('Batch 1, card "P"') && err.includes('P -> R -> P') &&
        err.includes('"New P" (new, batch 1)') && err.includes('"New R" (new, batch 2)'),
      err
    );
    check('Cross-batch loop lands nothing', loopCount() === 2, `cards: ${loopCount()}`);

    // A new card depending on itself (lowercase, to prove normalisation)
    err = loopErr(single([{ session_letter: 'P', title: 'New P', depends_on_cards: ['p'] }]));
    check('A new card depending on itself is refused', err && err.includes('card "P": depends on itself'), err);

    // Composite: new E -> existing D, and dependency_updates makes D -> E
    err = loopErr(single(
      [{ session_letter: 'E', title: 'New E', depends_on_cards: ['D'] }],
      { dependency_updates: [{ card: 'D', add_dependency: 'E' }] }
    ));
    check(
      'New card plus a dependency_updates edge closing a loop is refused',
      err && err.includes('E -> D -> E') && err.includes('"Existing D" (on the board)') &&
        err.includes('Added by dependency_updates: D -> E'),
      err
    );
    check('Composite loop lands nothing, and D gains no edge',
      loopCount() === 2 && db.getProject(loopId).phases[0].subphases[0].cards
        .find(c => c.session_letter === 'D').depends_on_cards.length === 0);

    // A new card naming a letter that exists nowhere
    err = loopErr(single([{ session_letter: 'P', title: 'New P', depends_on_cards: ['Q'] }]));
    check(
      'A new card depending on a letter that exists nowhere is refused',
      err && err.includes('card "P": depends on Q, which is neither on the board nor in this file'),
      err
    );
    check('Unknown-letter file lands nothing', loopCount() === 2, `cards: ${loopCount()}`);

    // The normal case: new cards depending on each other and on the board
    const okLoop = db.appendCards(loopId, {
      batches: [
        { add_to_phase: loopPhase.id, add_to_subphase: loopSub1.id,
          new_cards: [
            { session_letter: 'P', title: 'New P', depends_on_cards: ['A'] },
            { session_letter: 'R', title: 'New R', depends_on_cards: ['p'] },
          ] },
        { add_to_phase: loopPhase.id, add_to_subphase: loopSub2.id,
          new_cards: [{ session_letter: 'S', title: 'New S', depends_on_cards: ['R', 'D'] }] },
      ],
      dependency_updates: [{ card: 'D', add_dependency: 'A' }],
    });
    const okCards = {};
    for (const s of db.getProject(loopId).phases[0].subphases) for (const c of s.cards) okCards[c.session_letter] = c;
    check(
      'A file whose new cards depend on each other (within and across batches) imports cleanly',
      okLoop.cardsAdded === 3 && okLoop.dependenciesUpdated === 1 &&
        JSON.stringify(okCards.R.depends_on_cards) === '["P"]' &&
        JSON.stringify(okCards.S.depends_on_cards) === '["R","D"]',
      JSON.stringify(okLoop)
    );

    // ------------------------------------------------------------------
    // dependency_updates: unknown dependency letters and unknown targets
    // refuse the import; Done / In Progress targets still only warn
    // ------------------------------------------------------------------
    // Board now: A (Done), D -> A, P -> A, R -> P, S -> R, D
    const countBefore = loopCount();
    const dJson = () => JSON.stringify(db.getProject(loopId).phases[0].subphases[0].cards
      .find(c => c.session_letter === 'D').depends_on_cards);
    const dBefore = dJson();

    err = loopErr(single(
      [{ session_letter: 'T', title: 'New T', depends_on_cards: [] }],
      { dependency_updates: [{ card: 'D', add_dependency: 'Q' }] }
    ));
    check(
      'A dependency_updates entry naming a letter that exists nowhere is refused',
      err && err.includes('dependency_updates, card "D": depends on Q, which is neither on the board nor in this file'),
      err
    );
    check('Unknown update dependency lands nothing (no T, D unchanged)',
      loopCount() === countBefore && dJson() === dBefore, `cards: ${loopCount()}, D: ${dJson()}`);

    err = loopErr(single(
      [{ session_letter: 'T', title: 'New T', depends_on_cards: [] }],
      { dependency_updates: [{ card: 'X', add_dependency: 'A' }] }
    ));
    check(
      'A dependency_updates entry whose target exists nowhere is refused',
      err && err.includes('dependency_updates, card "X": target card X is neither on the board nor in this file'),
      err
    );
    check('Unknown update target lands nothing', loopCount() === countBefore, `cards: ${loopCount()}`);

    // Done and In Progress targets: warnings, and the rest of the file lands.
    // A's update even names a letter that exists nowhere - the update is a
    // no-op, so nothing bad is stored and it stays a warning.
    const pCard = db.getProject(loopId).phases[0].subphases[0].cards.find(c => c.session_letter === 'P');
    db.updateCardStatus(pCard.id, 'In Progress');
    const warnRun = db.appendCards(loopId, single(
      [{ session_letter: 'T', title: 'New T', depends_on_cards: ['A'] }],
      { dependency_updates: [
        { card: 'A', add_dependencies: ['T', 'Q'] },
        { card: 'P', add_dependency: 'T' },
        { card: 's', add_dependency: 't' },
      ] }
    ));
    const afterWarn = {};
    for (const s of db.getProject(loopId).phases[0].subphases) for (const c of s.cards) afterWarn[c.session_letter] = c;
    check(
      'Done and In Progress targets only warn',
      warnRun.warnings.some(w => w.includes('Card "A" is "Done"')) &&
        warnRun.warnings.some(w => w.includes('Card "P" is "In Progress"')),
      JSON.stringify(warnRun.warnings)
    );
    check(
      'The rest of that import lands: T added, lowercase S target updated, A and P untouched',
      warnRun.cardsAdded === 1 && warnRun.dependenciesUpdated === 1 && afterWarn.T &&
        JSON.stringify(afterWarn.S.depends_on_cards) === '["R","D","T"]' &&
        afterWarn.A.depends_on_cards.length === 0 &&
        JSON.stringify(afterWarn.P.depends_on_cards) === '["A"]',
      JSON.stringify(warnRun)
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
