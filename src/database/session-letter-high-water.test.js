const KanbanDatabase = require('./operations');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\session-letter-high-water.test.js

const testDbPath = path.join(__dirname, '../../test-session-letter-high-water.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// One phase, one populated subphase plus an EMPTY one - the empty subphase is
// what drives getNextSessionLetter down its project-wide (base letter) path
function project(slug, letters) {
  return {
    name: slug,
    slug,
    phases: [
      {
        name: 'Phase 1',
        subphases: [
          {
            name: 'Populated',
            cards: letters.map(l => ({ session_letter: l, title: `Session ${l}`, status: 'Not Started' })),
          },
          { name: 'Empty', cards: [] },
        ],
      },
    ],
  };
}

function runTests() {
  console.log('🧪 Session letter high-water tests (retired letters are never reissued)...\n');

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
  let db = new KanbanDatabase(testDbPath);

  const setup = (slug, letters) => {
    const id = db.createProject(project(slug, letters));
    const p = db.getProject(id);
    const [populated, empty] = p.phases[0].subphases;
    const cardId = (letter) => populated.cards.find(c => c.session_letter === letter).id;
    return { id, populatedId: populated.id, emptyId: empty.id, phaseId: p.phases[0].id, cardId };
  };
  const countCards = (id) => db.getProject(id).phases
    .reduce((n, ph) => n + ph.subphases.reduce((m, s) => m + s.cards.length, 0), 0);
  const mark = (id) => db.db.prepare('SELECT session_letter_high_water AS m FROM projects WHERE id = ?').get(id).m;

  try {
    // ------------------------------------------------------------------
    // 1. Deleting the highest card does not hand its letter back out
    // ------------------------------------------------------------------
    const del = setup('delete-highest', ['A', 'B', 'C']);
    check('createProject sets the high-water mark', mark(del.id) === 'C', `got ${mark(del.id)}`);
    db.deleteCard(del.cardId('C'));
    check('deleteCard leaves the high-water mark untouched', mark(del.id) === 'C', `got ${mark(del.id)}`);
    const afterDelete = db.getNextSessionLetter(del.id, del.emptyId);
    check('Next letter after deleting the highest card is D, not C', afterDelete === 'D', `got ${afterDelete}`);
    check('getLastSessionLetter still reports C', db.getLastSessionLetter(del.id) === 'C');

    const createdD = db.createCard(del.emptyId, { session_letter: 'D', title: 'Session D' });
    check('createCard advances the mark', typeof createdD === 'number' && mark(del.id) === 'D', `got ${mark(del.id)}`);

    // Deleting EVERY card still does not restart at A
    for (const c of db.getProject(del.id).phases[0].subphases.flatMap(s => s.cards)) db.deleteCard(c.id);
    const afterEmptied = db.getNextSessionLetter(del.id, del.emptyId);
    check('A project emptied of cards continues after its mark (E)', afterEmptied === 'E', `got ${afterEmptied}`);

    // ------------------------------------------------------------------
    // 2. An interior gap is never filled (the live Hub's O / Vault's C, E)
    // ------------------------------------------------------------------
    const gap = setup('interior-gap', ['A', 'B', 'D', 'E']);
    const gapNext = db.getNextSessionLetter(gap.id, gap.emptyId);
    check('Interior gap C is not filled; next is F', gapNext === 'F', `got ${gapNext}`);

    // Mirrors Alfred Home Hub: high-water AK with O missing
    const hubLetters = [];
    for (let i = 0; i < 26; i++) hubLetters.push(String.fromCharCode(65 + i));
    for (let j = 0; j < 11; j++) hubLetters.push('A' + String.fromCharCode(65 + j)); // AA..AK
    const hub = setup('hub-shape', hubLetters.filter(l => l !== 'O'));
    const hubNext = db.getNextSessionLetter(hub.id, hub.emptyId);
    check('Hub-shaped board (AK, gap O) suggests AL', hubNext === 'AL', `got ${hubNext}`);

    // Mirrors Obsidian Vault Setup: high-water U with C and E missing
    const vaultLetters = 'ABCDEFGHIJKLMNOPQRSTU'.split('').filter(l => l !== 'C' && l !== 'E');
    const vault = setup('vault-shape', vaultLetters);
    const vaultNext = db.getNextSessionLetter(vault.id, vault.emptyId);
    check('Vault-shaped board (U, gaps C E) suggests V', vaultNext === 'V', `got ${vaultNext}`);

    // ------------------------------------------------------------------
    // 3. A retired base letter is refused - append import and createCard
    // ------------------------------------------------------------------
    const appendFile = (letters, batched = false) => {
      const cards = letters.map(l => ({ session_letter: l, title: `Session ${l}: appended` }));
      return batched
        ? { batches: [
            { add_to_phase: gap.phaseId, add_to_subphase: gap.emptyId, new_cards: [{ session_letter: 'G', title: 'Fine' }] },
            { add_to_phase: gap.phaseId, add_to_subphase: gap.emptyId, new_cards: cards },
          ] }
        : { add_to_phase: gap.phaseId, add_to_subphase: gap.emptyId, new_cards: cards };
    };
    const cardsBefore = countCards(gap.id);

    const retired = errorOf(() => db.appendCards(gap.id, appendFile(['F', 'C'])));
    check('Append claiming retired C is refused', retired !== null, 'no error thrown');
    check('Append error names the retired letter', retired && retired.includes('"C"'), retired);
    check('Append error names the card title', retired && retired.includes('Session C: appended'), retired);
    check(
      'Whole import cancelled: F did not land',
      countCards(gap.id) === cardsBefore && mark(gap.id) === 'E'
    );

    const batchedErr = errorOf(() => db.appendCards(gap.id, appendFile(['c'], true)));
    check('Batched append names the batch (lowercase c still refused)', batchedErr && batchedErr.includes('Batch 2'), batchedErr);

    const suffixOk = db.appendCards(gap.id, appendFile(['D2', 'F']));
    check('A suffix of a live base letter (D2) is still accepted', suffixOk.cardsAdded === 2);
    check('appendCards advances the mark to F', mark(gap.id) === 'F', `got ${mark(gap.id)}`);

    const createRetired = errorOf(() => db.createCard(gap.emptyId, { session_letter: 'C', title: 'Typed by hand' }));
    check('createCard refuses retired C too (dialog + Pi POST /cards)', createRetired && createRetired.includes('retired'), createRetired);

    // ------------------------------------------------------------------
    // 4. A null or corrupted counter degrades to the board itself
    // ------------------------------------------------------------------
    const nul = setup('null-counter', ['A', 'B', 'C']);
    db.db.prepare('UPDATE projects SET session_letter_high_water = NULL WHERE id = ?').run(nul.id);
    const nulNext = db.getNextSessionLetter(nul.id, nul.emptyId);
    check('NULL counter: next letter is D, as today', nulNext === 'D', `got ${nulNext}`);
    check('NULL counter: last_session_letter is C, as today', db.getLastSessionLetter(nul.id) === 'C');

    db.db.prepare("UPDATE projects SET session_letter_high_water = 'A' WHERE id = ?").run(nul.id);
    const staleNext = db.getNextSessionLetter(nul.id, nul.emptyId);
    check('Stale-low counter (A) never suggests a live letter', staleNext === 'D', `got ${staleNext}`);

    db.db.prepare("UPDATE projects SET session_letter_high_water = '3!' WHERE id = ?").run(nul.id);
    const corruptNext = db.getNextSessionLetter(nul.id, nul.emptyId);
    check('Corrupted counter is ignored', corruptNext === 'D' && db.getLastSessionLetter(nul.id) === 'C', `got ${corruptNext}`);

    db.createCard(nul.emptyId, { session_letter: 'D', title: 'Session D' });
    check('The next insert repairs a corrupted counter', mark(nul.id) === 'D', `got ${mark(nul.id)}`);

    // ------------------------------------------------------------------
    // 5. No gaps: allocation exactly as before
    // ------------------------------------------------------------------
    const fresh = db.createProject({ name: 'Fresh', slug: 'fresh', phases: [{ name: 'P', subphases: [{ name: 'S', cards: [] }] }] });
    const freshSub = db.getProject(fresh).phases[0].subphases[0].id;
    check('Brand-new project: mark stays NULL with no cards', mark(fresh) === null);
    check('Brand-new project suggests A', db.getNextSessionLetter(fresh, freshSub) === 'A');
    check('Brand-new project last_session_letter is null', db.getLastSessionLetter(fresh) === null);

    const ok = setup('no-gaps', ['A', 'B', 'C', 'C2', 'C3']);
    check('No-gap project: empty subphase gets D', db.getNextSessionLetter(ok.id, ok.emptyId) === 'D');
    check('No-gap project: populated subphase still bumps the suffix (C4)', db.getNextSessionLetter(ok.id, ok.populatedId) === 'C4');
    check('No-gap project: last_session_letter is C3', db.getLastSessionLetter(ok.id) === 'C3');
    check('Mark stores the base letter only', mark(ok.id) === 'C', `got ${mark(ok.id)}`);

    // Suffixes stay derived and recyclable (explicitly out of scope)
    db.deleteCard(ok.cardId('C3'));
    check('A deleted suffix (C3) can come back', db.getNextSessionLetter(ok.id, ok.populatedId) === 'C3');

    const zz = setup('crosses-z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    check('Z rolls over to AA', db.getNextSessionLetter(zz.id, zz.emptyId) === 'AA');

    // last_session_letter in the vault export follows the mark
    const exported = db.exportForVault().projects.find(p => p.slug === 'delete-highest');
    check('exportForVault last_session_letter reflects the mark (D, board empty)', exported.last_session_letter === 'D', `got ${exported.last_session_letter}`);

    // ------------------------------------------------------------------
    // 6. The backfill is re-runnable and never moves a set counter
    // ------------------------------------------------------------------
    db.close();
    const raw = new Database(testDbPath);
    // Simulate a pre-migration database: counters unset
    raw.prepare('UPDATE projects SET session_letter_high_water = NULL').run();
    // ...except one, deliberately ahead of its board
    raw.prepare("UPDATE projects SET session_letter_high_water = 'Q' WHERE slug = 'no-gaps'").run();
    raw.close();

    db = new KanbanDatabase(testDbPath);
    const bySlug = (slug) => db.db.prepare('SELECT session_letter_high_water AS m FROM projects WHERE slug = ?').get(slug).m;
    check('Backfill sets the derived maximum (hub-shape -> AK)', bySlug('hub-shape') === 'AK', `got ${bySlug('hub-shape')}`);
    check('Backfill sets the derived maximum (vault-shape -> U)', bySlug('vault-shape') === 'U', `got ${bySlug('vault-shape')}`);
    check('Backfill takes the base letter (interior-gap D2 on the board -> F)', bySlug('interior-gap') === 'F', `got ${bySlug('interior-gap')}`);
    check('Backfill does not move an already-set counter', bySlug('no-gaps') === 'Q', `got ${bySlug('no-gaps')}`);
    check('Backfill leaves a project with no cards NULL', bySlug('delete-highest') === null && bySlug('fresh') === null);
    db.close();

    db = new KanbanDatabase(testDbPath);
    check(
      'Re-running the backfill changes nothing',
      bySlug('hub-shape') === 'AK' && bySlug('no-gaps') === 'Q' && bySlug('delete-highest') === null
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
