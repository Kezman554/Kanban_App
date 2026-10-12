const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\create-card-at.test.js

const testDbPath = path.join(__dirname, '../../test-create-card-at.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// Two phases; letters A B D (C retired - a gap below the high-water mark D)
const baseProject = {
  name: 'Placement Project',
  slug: 'placement-project',
  phases: [
    {
      name: 'Phase 1',
      subphases: [
        { name: 'Sub 1.1', cards: [
          { session_letter: 'A', title: 'Session A', status: 'Done' },
          { session_letter: 'B', title: 'Session B', status: 'Done' },
        ] },
        { name: 'Sub 1.2', cards: [{ session_letter: 'D', title: 'Session D', status: 'Done' }] },
      ],
    },
    {
      name: 'Phase 2',
      subphases: [{ name: 'Sub 2.1', cards: [] }],
    },
  ],
};

function runTests() {
  console.log('🧪 createCardAt tests (Add Card dialog placements, one transaction)...\n');

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
  const errorOf = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

  cleanup();
  const db = new KanbanDatabase(testDbPath);

  try {
    const projectId = db.createProject(baseProject);
    const project = () => db.getProject(projectId);
    const phase1 = project().phases[0];
    const sub11 = phase1.subphases[0];
    const counts = () => {
      const p = project();
      return {
        phases: p.phases.length,
        subphases: p.phases.reduce((n, ph) => n + ph.subphases.length, 0),
        cards: p.phases.reduce((n, ph) => n + ph.subphases.reduce((m, s) => m + s.cards.length, 0), 0),
      };
    };
    const mark = () => db.db.prepare('SELECT session_letter_high_water AS m FROM projects WHERE id = ?').get(projectId).m;

    // A subphase still to be created allocates like an empty one: the
    // high-water mark plus one, never the C gap
    const suggested = db.getNextSessionLetter(projectId, null);
    check('getNextSessionLetter(project, null) suggests high-water + 1 (E, not the C gap)', suggested === 'E', `got ${suggested}`);

    // ------------------------------------------------------------------
    // Existing subphase
    // ------------------------------------------------------------------
    const existing = db.createCardAt(projectId,
      { add_to_phase: phase1.id, add_to_subphase: sub11.id },
      { session_letter: 'E', title: 'Session E: existing subphase' });
    check('Existing subphase: card lands there, nothing created',
      existing.subphaseId === sub11.id && existing.createdPhase === null && existing.createdSubphase === null &&
        project().phases[0].subphases[0].cards.some(c => c.session_letter === 'E'));

    // ------------------------------------------------------------------
    // New subphase under an existing phase
    // ------------------------------------------------------------------
    const letterF = db.getNextSessionLetter(projectId, null);
    const newSub = db.createCardAt(projectId,
      { add_to_phase: phase1.id, new_subphase: { name: 'Sub 1.3', short_name: '1.3', description: null } },
      { session_letter: letterF, title: 'Session F: new subphase' });
    const ph1 = project().phases.find(p => p.id === phase1.id);
    const lastSub = ph1.subphases[ph1.subphases.length - 1];
    check('New subphase: suggested letter was F', letterF === 'F', `got ${letterF}`);
    check('New subphase: created, and lands last in its phase',
      newSub.createdSubphase && lastSub.id === newSub.subphaseId && lastSub.name === 'Sub 1.3',
      JSON.stringify(ph1.subphases.map(s => [s.name, s.display_order])));
    check('New subphase: card is in it with letter F, Not Started',
      lastSub.cards.length === 1 && lastSub.cards[0].session_letter === 'F' && lastSub.cards[0].status === 'Not Started');
    check('New subphase: short_name stored, description null', lastSub.short_name === '1.3' && lastSub.description === null);

    // ------------------------------------------------------------------
    // New phase (+ its first subphase)
    // ------------------------------------------------------------------
    const newPhase = db.createCardAt(projectId,
      { new_phase: { name: 'Phase 3' }, new_subphase: { name: 'Sub 3.1' } },
      { session_letter: 'G', title: 'Session G: new phase' });
    const phases = project().phases;
    const lastPhase = phases[phases.length - 1];
    check('New phase: created and lands last in the project',
      newPhase.createdPhase && lastPhase.id === newPhase.createdPhase.id && lastPhase.name === 'Phase 3',
      JSON.stringify(phases.map(p => [p.name, p.display_order])));
    check('New phase: its subphase holds the card',
      lastPhase.subphases.length === 1 && lastPhase.subphases[0].name === 'Sub 3.1' &&
        lastPhase.subphases[0].cards.map(c => c.session_letter).join() === 'G');
    check('High-water mark advanced to G', mark() === 'G', `got ${mark()}`);

    // ------------------------------------------------------------------
    // Rollback: a refused card leaves no phase or subphase behind
    // ------------------------------------------------------------------
    let before = counts();
    const dupPhase = errorOf(() => db.createCardAt(projectId,
      { new_phase: { name: 'Orphan phase?' }, new_subphase: { name: 'Orphan sub?' } },
      { session_letter: 'A', title: 'Duplicate letter' }));
    check('New phase + duplicate letter is refused', dupPhase && dupPhase.includes('already used'), dupPhase);
    check('...and leaves no phase, subphase or card behind', JSON.stringify(counts()) === JSON.stringify(before),
      `${JSON.stringify(before)} -> ${JSON.stringify(counts())}`);

    const retiredSub = errorOf(() => db.createCardAt(projectId,
      { add_to_phase: phase1.id, new_subphase: { name: 'Orphan sub?' } },
      { session_letter: 'C', title: 'Retired letter' }));
    check('New subphase + retired letter is refused, naming it', retiredSub && retiredSub.includes('"C" is retired'), retiredSub);
    check('...and leaves no subphase behind', JSON.stringify(counts()) === JSON.stringify(before));
    check('...and the high-water mark is unchanged', mark() === 'G', `got ${mark()}`);
    check('No orphan names anywhere',
      !project().phases.some(p => p.name.startsWith('Orphan') || p.subphases.some(s => s.name.startsWith('Orphan'))));

    // ------------------------------------------------------------------
    // Placement and name validation (the resolver's rules, unchanged)
    // ------------------------------------------------------------------
    before = counts();
    const childless = errorOf(() => db.createCardAt(projectId, { new_phase: { name: 'Lonely' } }, { session_letter: 'H', title: 'x' }));
    check('New phase without a subphase is refused (resolver rule)', childless && childless.includes('new_phase requires new_subphase'), childless);
    const noPlacement = errorOf(() => db.createCardAt(projectId, {}, { session_letter: 'H', title: 'x' }));
    check('No destination at all is refused', noPlacement && noPlacement.includes('Must provide'), noPlacement);
    const blankSub = errorOf(() => db.createCardAt(projectId, { add_to_phase: phase1.id, new_subphase: { name: '   ' } }, { session_letter: 'H', title: 'x' }));
    check('Blank new subphase name is refused', blankSub && blankSub.includes('New subphase name is required'), blankSub);
    const blankPhase = errorOf(() => db.createCardAt(projectId, { new_phase: { name: '' }, new_subphase: { name: 'S' } }, { session_letter: 'H', title: 'x' }));
    check('Blank new phase name is refused', blankPhase && blankPhase.includes('New phase name is required'), blankPhase);
    const otherProject = db.createProject({ name: 'Other', slug: 'other', phases: [{ name: 'P', subphases: [{ name: 'S', cards: [] }] }] });
    const foreignPhase = db.getProject(otherProject).phases[0];
    const foreign = errorOf(() => db.createCardAt(projectId, { add_to_phase: foreignPhase.id, new_subphase: { name: 'S2' } }, { session_letter: 'H', title: 'x' }));
    check("Another project's phase is refused", foreign && foreign.includes('not found in project'), foreign);
    check('Refused placements leave nothing behind', JSON.stringify(counts()) === JSON.stringify(before));

    // ------------------------------------------------------------------
    // A project with no phases at all: "+ New phase" is the only way in
    // ------------------------------------------------------------------
    const empty = db.createProject({ name: 'Empty', slug: 'empty', phases: [] });
    check('Empty project suggests A', db.getNextSessionLetter(empty, null) === 'A');
    const first = db.createCardAt(empty, { new_phase: { name: 'Phase 1' }, new_subphase: { name: 'Sub 1' } },
      { session_letter: 'A', title: 'Session A: first card' });
    const emptyNow = db.getProject(empty);
    check('Empty project: first phase, subphase and card created',
      first.createdPhase && emptyNow.phases.length === 1 && emptyNow.phases[0].subphases[0].cards[0].session_letter === 'A');
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
