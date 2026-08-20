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
            // E's cross-project link is already SATISFIED (Z is Done), so E is
            // workable - the case where the link used to vanish from the export
            {
              session_letter: 'E',
              title: 'Session E',
              status: 'Not Started',
              depends_on_cards: [],
              external_dependencies: [
                { project_slug: 'other-project', card_letter: 'Z', description: 'needed Z' },
              ],
            },
            // G is DONE and carries external links - one satisfied (Z), one
            // still open (X). Guards the trap that done cards come from a
            // different source and could carry a raw JSON string.
            {
              session_letter: 'G',
              title: 'Session G',
              status: 'Done',
              depends_on_cards: [],
              external_dependencies: [
                { project_slug: 'other-project', card_letter: 'Z', description: 'used Z' },
                { project_slug: 'other-project', card_letter: 'X', description: 'also wanted X' },
              ],
            },
            // F carries a still-live link while In Progress
            {
              session_letter: 'F',
              title: 'Session F',
              status: 'In Progress',
              depends_on_cards: [],
              external_dependencies: [
                { project_slug: 'other-project', card_letter: 'X', description: 'still needs X' },
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
            { session_letter: 'Z', title: 'Session Z', status: 'Done', depends_on_cards: [] },
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
    // external_dependencies on EVERY exported card, not just blocked ones
    // ------------------------------------------------------------------
    const allExported = [
      ...main.unblocked_cards,
      ...main.in_progress_cards,
      ...main.blocked_cards,
    ];
    check(
      'Every exported card carries an external_dependencies array',
      allExported.length > 0 && allExported.every(c => Array.isArray(c.external_dependencies)),
      allExported.map(c => `${c.session_letter}:${typeof c.external_dependencies}`).join(' ')
    );

    const cardsWithout = allExported.filter(c => c.external_dependencies.length === 0);
    check(
      'Cards with no external deps default to an empty array',
      cardsWithout.length > 0 && cardsWithout.every(c => JSON.stringify(c.external_dependencies) === '[]')
    );

    // The regression itself: a SATISFIED link must survive into unblocked_cards
    const cardE = main.unblocked_cards.find(c => c.session_letter === 'E');
    check('Card with a satisfied external dep is unblocked', !!cardE);
    check(
      'Satisfied cross-project link is still present in the export',
      cardE && cardE.external_dependencies.length === 1,
      cardE && JSON.stringify(cardE.external_dependencies)
    );
    check(
      'Satisfied link keeps resolved true and status Done',
      cardE && cardE.external_dependencies[0].resolved === true &&
        cardE.external_dependencies[0].status === 'Done',
      cardE && JSON.stringify(cardE.external_dependencies[0])
    );
    check(
      'Satisfied link keeps its identifying fields',
      cardE && cardE.external_dependencies[0].card_letter === 'Z' &&
        cardE.external_dependencies[0].project_slug === 'other-project' &&
        cardE.external_dependencies[0].project_name === 'Other Project' &&
        cardE.external_dependencies[0].description === 'needed Z',
      cardE && JSON.stringify(cardE.external_dependencies[0])
    );

    // In-progress cards come from a raw SELECT, so they need resolving too
    const cardF = main.in_progress_cards.find(c => c.session_letter === 'F');
    check('In-progress card is exported', !!cardF);
    check(
      'In-progress card carries its external dep, resolved false while X is open',
      cardF && cardF.external_dependencies.length === 1 &&
        cardF.external_dependencies[0].resolved === false &&
        cardF.external_dependencies[0].status === 'Not Started',
      cardF && JSON.stringify(cardF.external_dependencies)
    );

    // blocked_by stays a blocked-card-only summary
    check(
      'blocked_by is NOT added to unblocked or in-progress cards',
      [...main.unblocked_cards, ...main.in_progress_cards].every(c => !('blocked_by' in c)),
      [...main.unblocked_cards, ...main.in_progress_cards]
        .filter(c => 'blocked_by' in c).map(c => c.session_letter).join(',')
    );
    check(
      'blocked_by still present on every blocked card',
      main.blocked_cards.every(c => typeof c.blocked_by === 'string' && c.blocked_by.length > 0)
    );

    // ------------------------------------------------------------------
    // Board-reconstruction fields: roadmap ids, done_cards, last_session_letter
    // ------------------------------------------------------------------
    const mainFull = db.getProject(mainId);

    // Phase ids must be the real primary keys - the ones "Export for Claude"
    // lists and an append import targets with add_to_phase
    const exportedPhaseIds = main.roadmap.map(r => r.id);
    const actualPhaseIds = mainFull.phases.map(p => p.id);
    check(
      'roadmap carries real phase ids',
      JSON.stringify(exportedPhaseIds) === JSON.stringify(actualPhaseIds),
      `export ${JSON.stringify(exportedPhaseIds)} vs db ${JSON.stringify(actualPhaseIds)}`
    );

    const exportedSubIds = main.roadmap.flatMap(r => r.subphases.map(s2 => s2.id));
    const actualSubIds = mainFull.phases.flatMap(p => (p.subphases || []).map(s2 => s2.id));
    check(
      'roadmap carries real subphase ids',
      JSON.stringify(exportedSubIds) === JSON.stringify(actualSubIds),
      `export ${JSON.stringify(exportedSubIds)} vs db ${JSON.stringify(actualSubIds)}`
    );
    check(
      'phase and subphase ids are integers',
      exportedPhaseIds.every(Number.isInteger) && exportedSubIds.every(Number.isInteger)
    );

    // Existing roadmap keys untouched - an external reader breaks on renames
    check(
      'roadmap keeps its existing keys',
      main.roadmap.every(r => 'phase' in r && 'short_name' in r && 'subphases' in r) &&
        main.roadmap.every(r => r.subphases.every(s2 =>
          'name' in s2 && 'short_name' in s2 &&
          'not_started' in s2 && 'in_progress' in s2 && 'done' in s2))
    );

    // done_cards
    check('Export has done_cards array', Array.isArray(main.done_cards));
    const doneLetters = main.done_cards.map(c => c.session_letter).sort();
    check(
      'done_cards contains exactly the Done cards (A, G)',
      JSON.stringify(doneLetters) === '["A","G"]',
      `got ${JSON.stringify(doneLetters)}`
    );
    const doneA = main.done_cards.find(c => c.session_letter === 'A');
    check(
      'done card uses the same shape as other exported cards',
      doneA && doneA.title === 'Session A' && doneA.phase === 'Phase 1' &&
        doneA.subphase === 'Subphase 1.1' && Array.isArray(doneA.depends_on_cards) &&
        'description' in doneA && 'success_criteria' in doneA &&
        Array.isArray(doneA.external_dependencies),
      doneA && JSON.stringify(Object.keys(doneA))
    );
    check('done card carries completed_at', doneA && 'completed_at' in doneA);

    // done_cards must go through the same shapeCard/externalDepsFor path as the
    // other three arrays - a raw JSON string here would look right until read
    const doneG = main.done_cards.find(c => c.session_letter === 'G');
    check('Done card with external links is exported', !!doneG);
    check(
      'done card external_dependencies is an ARRAY, not a raw JSON string',
      doneG && Array.isArray(doneG.external_dependencies) &&
        typeof doneG.external_dependencies !== 'string',
      doneG && `${typeof doneG.external_dependencies}: ${JSON.stringify(doneG.external_dependencies)}`
    );
    check(
      'done card external entries are resolved objects with the enriched fields',
      doneG && doneG.external_dependencies.length === 2 &&
        doneG.external_dependencies.every(d =>
          typeof d === 'object' && d !== null &&
          'resolved' in d && 'status' in d && 'project_name' in d &&
          'project_slug' in d && 'card_letter' in d && 'description' in d),
      doneG && JSON.stringify(doneG.external_dependencies)
    );
    const doneZ = doneG && doneG.external_dependencies.find(d => d.card_letter === 'Z');
    const doneX = doneG && doneG.external_dependencies.find(d => d.card_letter === 'X');
    check(
      'done card satisfied link resolved true / status Done',
      doneZ && doneZ.resolved === true && doneZ.status === 'Done' &&
        doneZ.project_name === 'Other Project',
      JSON.stringify(doneZ)
    );
    check(
      'done card still-open link resolved false / status Not Started',
      doneX && doneX.resolved === false && doneX.status === 'Not Started',
      JSON.stringify(doneX)
    );

    // completed_at is populated once a card is marked Done through the app
    const cardB = mainFull.phases[0].subphases[0].cards.find(c => c.session_letter === 'B');
    db.updateCardStatus(cardB.id, 'Done');
    const afterDone = db.exportForVault().projects.find(p => p.slug === 'main-project');
    const newlyDone = afterDone.done_cards.find(c => c.session_letter === 'B');
    check(
      'newly completed card appears in done_cards with a completed_at timestamp',
      newlyDone && typeof newlyDone.completed_at === 'string' && newlyDone.completed_at.length > 0,
      newlyDone && JSON.stringify(newlyDone.completed_at)
    );
    check(
      'newly completed card left unblocked_cards',
      !afterDone.unblocked_cards.some(c => c.session_letter === 'B')
    );

    // last_session_letter - the value getNextSessionLetter continues from
    check(
      'last_session_letter is the highest letter on the board',
      main.last_session_letter === 'G',
      `got ${JSON.stringify(main.last_session_letter)}`
    );
    check(
      'getLastSessionLetter matches the exported value',
      db.getLastSessionLetter(mainId) === main.last_session_letter
    );

    // Ordering must match getNextSessionLetter: C < C2, and A < AA
    const orderProbe = db.createProject({
      name: 'Order Probe', slug: 'order-probe',
      phases: [{ name: 'P', subphases: [{ name: 'S', cards: [
        { session_letter: 'A', title: 'a' },
        { session_letter: 'C', title: 'c' },
        { session_letter: 'C2', title: 'c2' },
      ] }] }],
    });
    check(
      'last_session_letter orders numeric suffixes after the bare letter',
      db.getLastSessionLetter(orderProbe) === 'C2',
      `got ${db.getLastSessionLetter(orderProbe)}`
    );

    const emptyProbe = db.createProject({ name: 'Empty Probe', slug: 'empty-probe', phases: [] });
    check(
      'last_session_letter is null for a project with no cards',
      db.getLastSessionLetter(emptyProbe) === null
    );

    // ------------------------------------------------------------------
    // updateCardExternalDependencies: add / amend / remove on an existing card
    // ------------------------------------------------------------------
    const liveMain = db.getProject(mainId);
    const targetCard = liveMain.phases[0].subphases[0].cards.find(c => c.session_letter === 'C');

    check('Card C starts with no external dependencies', targetCard.external_dependencies.length === 0);

    // ADD - lowercase letter to prove normalizeExternalDependencies is reused
    db.updateCardExternalDependencies(targetCard.id, [
      { project_slug: 'other-project', card_letter: 'x', description: 'added from the card detail' },
    ]);
    let reread = db.getCard(targetCard.id);
    check(
      'Added link is stored and read back resolved',
      reread.external_dependencies.length === 1 &&
        reread.external_dependencies[0].card_letter === 'X' &&
        reread.external_dependencies[0].project_name === 'Other Project' &&
        reread.external_dependencies[0].resolved === false &&
        reread.external_dependencies[0].status === 'Not Started',
      JSON.stringify(reread.external_dependencies)
    );

    // The link must actually gate the card
    check(
      'Card C is now blocked by the added external link',
      !db.getWorkableCards(mainId).some(c => c.session_letter === 'C')
    );
    const blockedNow = db.exportForVault().projects
      .find(p => p.slug === 'main-project').blocked_cards.find(c => c.session_letter === 'C');
    check(
      'blocked_by names the external blocker',
      blockedNow && blockedNow.blocked_by.includes('Other Project X'),
      blockedNow && blockedNow.blocked_by
    );

    // AMEND - repoint at a different card and reword
    db.updateCardExternalDependencies(targetCard.id, [
      { project_slug: 'other-project', card_letter: 'Z', description: 'repointed at Z' },
    ]);
    reread = db.getCard(targetCard.id);
    check(
      'Amended link repoints and resolves against the Done card Z',
      reread.external_dependencies.length === 1 &&
        reread.external_dependencies[0].card_letter === 'Z' &&
        reread.external_dependencies[0].description === 'repointed at Z' &&
        reread.external_dependencies[0].resolved === true,
      JSON.stringify(reread.external_dependencies)
    );

    // REMOVE - empty array clears the links
    db.updateCardExternalDependencies(targetCard.id, []);
    reread = db.getCard(targetCard.id);
    check('Removing leaves an empty array', reread.external_dependencies.length === 0);
    check(
      'Card C is workable again once the link is removed',
      db.getWorkableCards(mainId).some(c => c.session_letter === 'C') ||
        // C also depends on B internally; only assert the external gate is gone
        !db.getBlockedReason(targetCard.id).includes('Other Project')
    );

    // Validation comes from the shared normaliser, not a new code path
    let extThrew = null;
    try {
      db.updateCardExternalDependencies(targetCard.id, [{ project_slug: '', card_letter: 'A' }]);
    } catch (e) {
      extThrew = e.message;
    }
    check('Empty project_slug is rejected by the shared validator', extThrew !== null, 'no error');
    let letterThrew = null;
    try {
      db.updateCardExternalDependencies(targetCard.id, [{ project_slug: 'other-project', card_letter: '  ' }]);
    } catch (e) {
      letterThrew = e.message;
    }
    check('Empty card_letter is rejected by the shared validator', letterThrew !== null, 'no error');
    check(
      'A rejected update leaves the card unchanged',
      db.getCard(targetCard.id).external_dependencies.length === 0
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
