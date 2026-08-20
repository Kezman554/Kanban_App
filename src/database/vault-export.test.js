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
