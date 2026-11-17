const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Run with Electron's Node (better-sqlite3 is built against the Electron ABI):
//   $env:ELECTRON_RUN_AS_NODE=1; & .\node_modules\.bin\electron.cmd src\database\unblock-override.test.js
//
// The board's lock button ("Unlock card") calls clearCardDependencies. A card
// blocked only by another project's unfinished card must become workable,
// as a recorded override that keeps the cross-project link, survives a
// reload and shows in the vault export. Mirrors Dash R -> Hub Q.

const testDbPath = path.join(__dirname, '../../test-unblock-override.db');

function cleanup() {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
}

const hub = {
  name: 'Home Hub',
  slug: 'home-hub',
  phases: [{
    name: 'Phase 1',
    subphases: [{
      name: 'Sub 1',
      cards: [
        { session_letter: 'Q', title: 'Hub Q', status: 'Not Started', depends_on_cards: [] },
      ],
    }],
  }],
};

const dash = {
  name: 'Dashboard',
  slug: 'dashboard',
  phases: [{
    name: 'Phase 1',
    subphases: [{
      name: 'Sub 1',
      cards: [
        { session_letter: 'P', title: 'Dash P', status: 'Done', depends_on_cards: [] },
        { session_letter: 'N', title: 'Dash N', status: 'Not Started', depends_on_cards: [] },
        // R: internal dep already Done, external dep on an unstarted card
        {
          session_letter: 'R', title: 'Kitchen kiosk', status: 'Not Started', depends_on_cards: ['P'],
          external_dependencies: [{ project_slug: 'home-hub', card_letter: 'Q', description: 'needs Q' }],
        },
        // S: blocked internally only
        { session_letter: 'S', title: 'Dash S', status: 'Not Started', depends_on_cards: ['N'] },
        // T: blocked both ways
        {
          session_letter: 'T', title: 'Dash T', status: 'Not Started', depends_on_cards: ['N'],
          external_dependencies: [{ project_slug: 'home-hub', card_letter: 'Q' }],
        },
      ],
    }],
  }],
};

function runTests() {
  console.log('🧪 Unblock override tests (external dependency override, persistence, export, re-block)...\n');

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
  let db = new KanbanDatabase(testDbPath);

  try {
    db.createProject(hub);
    const dashId = db.createProject(dash);
    const cards = () => {
      const map = {};
      for (const c of db.getProject(dashId).phases[0].subphases[0].cards) map[c.session_letter] = c;
      return map;
    };
    const workable = () => db.getWorkableCards(dashId).map(c => c.session_letter);
    const exported = (letter) => {
      const p = db.exportForVault().projects.find(pr => pr.slug === 'dashboard');
      return [...p.unblocked_cards, ...p.blocked_cards].find(c => c.session_letter === letter);
    };
    const { R, S, T } = cards();

    // --------------------------------------------------------------
    // External-only block: the reported bug
    // --------------------------------------------------------------
    check('R starts blocked by home-hub/Q only', db.getBlockedReason(R.id) === 'Waiting on external: home-hub/Q',
      db.getBlockedReason(R.id));

    db.clearCardDependencies(R.id);

    check('Unblocking R makes it workable', workable().includes('R'), db.getBlockedReason(R.id));
    check('R has no blocked reason after unblocking', db.getBlockedReason(R.id) === null, db.getBlockedReason(R.id));

    const rDep = cards().R.external_dependencies;
    check('The link to home-hub/Q survives the override',
      rDep.length === 1 && rDep[0].project_slug === 'home-hub' && rDep[0].card_letter === 'Q' &&
        rDep[0].description === 'needs Q',
      JSON.stringify(rDep));
    check('The link is recorded as overridden and reads as resolved',
      rDep[0] && rDep[0].overridden === true && rDep[0].resolved === true, JSON.stringify(rDep));
    check('The real status of Q is still reported', rDep[0] && rDep[0].status === 'Not Started', JSON.stringify(rDep));

    const rExport = exported('R');
    check('Vault export lists R as unblocked',
      db.exportForVault().projects.find(pr => pr.slug === 'dashboard').unblocked_cards.some(c => c.session_letter === 'R'));
    check('Vault export shows the override on the link',
      rExport && rExport.external_dependencies.length === 1 &&
        rExport.external_dependencies[0].overridden === true &&
        rExport.external_dependencies[0].resolved === true &&
        rExport.external_dependencies[0].status === 'Not Started',
      rExport && JSON.stringify(rExport.external_dependencies));

    // Persistence across a reopen of the database (a reload of the board)
    db.close();
    db = new KanbanDatabase(testDbPath);
    check('Override persists after reopening the database', workable().includes('R') &&
      cards().R.external_dependencies[0].overridden === true);

    // The project JSON export keeps the override so a re-import round-trips it
    const projExport = db.exportProjectToJson(dashId);
    const rProj = projExport.phases[0].subphases[0].cards.find(c => c.session_letter === 'R');
    check('Project JSON export keeps overridden and drops computed fields',
      JSON.stringify(rProj.external_dependencies) ===
        JSON.stringify([{ project_slug: 'home-hub', card_letter: 'Q', description: 'needs Q', overridden: true }]),
      JSON.stringify(rProj.external_dependencies));

    // --------------------------------------------------------------
    // Re-block: restoring the dependency blocks R again
    // --------------------------------------------------------------
    db.restoreExternalDependency(R.id, 'home-hub', 'Q');
    check('Restoring the link blocks R again', db.getBlockedReason(R.id) === 'Waiting on external: home-hub/Q',
      db.getBlockedReason(R.id));
    check('Restored link has no overridden flag', cards().R.external_dependencies[0].overridden !== true);

    // --------------------------------------------------------------
    // Internal-only block keeps working
    // --------------------------------------------------------------
    check('S starts blocked by N', db.getBlockedReason(S.id) === 'Waiting on card: N', db.getBlockedReason(S.id));
    db.clearCardDependencies(S.id);
    check('Unblocking S clears its internal dependency', workable().includes('S') &&
      cards().S.depends_on_cards.length === 0);
    check('S gains no external entries', cards().S.external_dependencies.length === 0);

    // --------------------------------------------------------------
    // Both kinds
    // --------------------------------------------------------------
    check('T starts blocked both ways',
      db.getBlockedReason(T.id) === 'Waiting on card: N; Waiting on external: home-hub/Q', db.getBlockedReason(T.id));
    db.clearCardDependencies(T.id);
    check('Unblocking T makes it workable', workable().includes('T'), db.getBlockedReason(T.id));
    check('T keeps its overridden external link',
      cards().T.external_dependencies.length === 1 && cards().T.external_dependencies[0].overridden === true);

    // --------------------------------------------------------------
    // Saving the dependency editor keeps an override it is given, and a
    // link that genuinely completes reads as Done-resolved
    // --------------------------------------------------------------
    db.updateCardExternalDependencies(T.id, [{ project_slug: 'home-hub', card_letter: 'Q', description: 'x', overridden: true }]);
    check('updateCardExternalDependencies keeps an explicit override', workable().includes('T'));
    db.updateCardExternalDependencies(T.id, [{ project_slug: 'home-hub', card_letter: 'Q', overridden: 'yes' }]);
    check('Only a literal true counts as an override', !workable().includes('T'));
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
