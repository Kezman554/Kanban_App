const { initDb, getTableInfo, getIndexInfo } = require('./schema');
const fs = require('fs');
const path = require('path');

// Test database path
const testDbPath = path.join(__dirname, '../../test-kanban.db');

// Clean up function
function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// Test suite
function runTests() {
  console.log('🧪 Starting database schema tests...\n');

  let db;
  let passedTests = 0;
  let failedTests = 0;

  try {
    // Cleanup before tests
    cleanup();

    // Test 1: Database initialization
    console.log('Test 1: Initialize database');
    try {
      db = initDb(testDbPath);
      if (db && fs.existsSync(testDbPath)) {
        console.log('✅ PASSED: Database file created\n');
        passedTests++;
      } else {
        console.log('❌ FAILED: Database file not created\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 2: Projects table structure
    console.log('Test 2: Verify projects table structure');
    try {
      const projectsInfo = getTableInfo(db, 'projects');
      const expectedColumns = ['id', 'name', 'slug', 'description', 'prd_path', 'github_repo', 'columns', 'created_at', 'updated_at'];
      const actualColumns = projectsInfo.map(col => col.name);

      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✅ PASSED: Projects table has all expected columns');
        console.log(`   Columns: ${actualColumns.join(', ')}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Projects table missing columns');
        console.log(`   Expected: ${expectedColumns.join(', ')}`);
        console.log(`   Actual: ${actualColumns.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 3: Phases table structure
    console.log('Test 3: Verify phases table structure');
    try {
      const phasesInfo = getTableInfo(db, 'phases');
      const expectedColumns = ['id', 'project_id', 'name', 'short_name', 'description', 'display_order', 'created_at', 'updated_at'];
      const actualColumns = phasesInfo.map(col => col.name);

      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✅ PASSED: Phases table has all expected columns');
        console.log(`   Columns: ${actualColumns.join(', ')}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Phases table missing columns');
        console.log(`   Expected: ${expectedColumns.join(', ')}`);
        console.log(`   Actual: ${actualColumns.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 4: Subphases table structure
    console.log('Test 4: Verify subphases table structure');
    try {
      const subphasesInfo = getTableInfo(db, 'subphases');
      const expectedColumns = ['id', 'phase_id', 'name', 'short_name', 'description', 'display_order', 'created_at', 'updated_at'];
      const actualColumns = subphasesInfo.map(col => col.name);

      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✅ PASSED: Subphases table has all expected columns');
        console.log(`   Columns: ${actualColumns.join(', ')}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Subphases table missing columns');
        console.log(`   Expected: ${expectedColumns.join(', ')}`);
        console.log(`   Actual: ${actualColumns.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 5: Cards table structure
    console.log('Test 5: Verify cards table structure');
    try {
      const cardsInfo = getTableInfo(db, 'cards');
      const expectedColumns = [
        'id', 'subphase_id', 'session_letter', 'title', 'description', 'success_criteria',
        'resource', 'status', 'depends_on_cards', 'is_placeholder', 'complexity',
        'likely_needs_expansion', 'prompt_guide', 'checkpoint', 'git_commit_message',
        'parent_card_id', 'is_expanded', 'completed_at', 'created_at', 'updated_at'
      ];
      const actualColumns = cardsInfo.map(col => col.name);

      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✅ PASSED: Cards table has all expected columns');
        console.log(`   Columns: ${actualColumns.join(', ')}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Cards table missing columns');
        console.log(`   Expected: ${expectedColumns.join(', ')}`);
        console.log(`   Actual: ${actualColumns.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 6: Resources table structure
    console.log('Test 6: Verify resources table structure');
    try {
      const resourcesInfo = getTableInfo(db, 'resources');
      const expectedColumns = ['id', 'slug', 'name', 'is_available', 'created_at', 'updated_at'];
      const actualColumns = resourcesInfo.map(col => col.name);

      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✅ PASSED: Resources table has all expected columns');
        console.log(`   Columns: ${actualColumns.join(', ')}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Resources table missing columns');
        console.log(`   Expected: ${expectedColumns.join(', ')}`);
        console.log(`   Actual: ${actualColumns.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 7: Foreign key indexes
    console.log('Test 7: Verify foreign key indexes exist');
    try {
      const phasesIndexes = getIndexInfo(db, 'phases');
      const subphasesIndexes = getIndexInfo(db, 'subphases');
      const cardsIndexes = getIndexInfo(db, 'cards');

      const hasPhasesIndex = phasesIndexes.some(idx => idx.name === 'idx_phases_project_id');
      const hasSubphasesIndex = subphasesIndexes.some(idx => idx.name === 'idx_subphases_phase_id');
      const hasCardsSubphaseIndex = cardsIndexes.some(idx => idx.name === 'idx_cards_subphase_id');
      const hasCardsParentIndex = cardsIndexes.some(idx => idx.name === 'idx_cards_parent_card_id');

      if (hasPhasesIndex && hasSubphasesIndex && hasCardsSubphaseIndex && hasCardsParentIndex) {
        console.log('✅ PASSED: All foreign key indexes created');
        console.log('   - idx_phases_project_id');
        console.log('   - idx_subphases_phase_id');
        console.log('   - idx_cards_subphase_id');
        console.log('   - idx_cards_parent_card_id\n');
        passedTests++;
      } else {
        console.log('❌ FAILED: Some foreign key indexes missing');
        console.log(`   idx_phases_project_id: ${hasPhasesIndex}`);
        console.log(`   idx_subphases_phase_id: ${hasSubphasesIndex}`);
        console.log(`   idx_cards_subphase_id: ${hasCardsSubphaseIndex}`);
        console.log(`   idx_cards_parent_card_id: ${hasCardsParentIndex}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 8: Additional card indexes
    console.log('Test 8: Verify additional card indexes');
    try {
      const cardsIndexes = getIndexInfo(db, 'cards');
      const hasStatusIndex = cardsIndexes.some(idx => idx.name === 'idx_cards_status');
      const hasResourceIndex = cardsIndexes.some(idx => idx.name === 'idx_cards_resource');

      if (hasStatusIndex && hasResourceIndex) {
        console.log('✅ PASSED: Additional card indexes created');
        console.log('   - idx_cards_status');
        console.log('   - idx_cards_resource\n');
        passedTests++;
      } else {
        console.log('❌ FAILED: Some card indexes missing');
        console.log(`   idx_cards_status: ${hasStatusIndex}`);
        console.log(`   idx_cards_resource: ${hasResourceIndex}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 9: Default resources inserted
    console.log('Test 9: Verify default resources inserted');
    try {
      const resources = db.prepare('SELECT * FROM resources ORDER BY id').all();
      const expectedResources = ['claude_sub', 'anthropic_api', 'none', 'tbc'];
      const actualSlugs = resources.map(r => r.slug);

      if (resources.length === 4 && expectedResources.every(slug => actualSlugs.includes(slug))) {
        console.log('✅ PASSED: Default resources inserted');
        resources.forEach(r => {
          console.log(`   - ${r.slug}: ${r.name} (available: ${r.is_available})`);
        });
        console.log('');
        passedTests++;
      } else {
        console.log('❌ FAILED: Default resources not correct');
        console.log(`   Expected: ${expectedResources.join(', ')}`);
        console.log(`   Actual: ${actualSlugs.join(', ')}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 10: Foreign key constraints enabled
    console.log('Test 10: Verify foreign key constraints are enabled');
    try {
      const foreignKeysEnabled = db.pragma('foreign_keys', { simple: true });
      if (foreignKeysEnabled === 1) {
        console.log('✅ PASSED: Foreign key constraints enabled\n');
        passedTests++;
      } else {
        console.log('❌ FAILED: Foreign key constraints not enabled\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 11: Insert and relationship test
    console.log('Test 11: Test data insertion and relationships');
    try {
      // Insert project
      const insertProject = db.prepare(`
        INSERT INTO projects (name, slug, description)
        VALUES (?, ?, ?)
      `);
      const projectResult = insertProject.run('Test Project', 'test-project', 'A test project');
      const projectId = projectResult.lastInsertRowid;

      // Insert phase
      const insertPhase = db.prepare(`
        INSERT INTO phases (project_id, name, short_name, display_order)
        VALUES (?, ?, ?, ?)
      `);
      const phaseResult = insertPhase.run(projectId, 'Foundation', 'F', 1);
      const phaseId = phaseResult.lastInsertRowid;

      // Insert subphase
      const insertSubphase = db.prepare(`
        INSERT INTO subphases (phase_id, name, short_name, display_order)
        VALUES (?, ?, ?, ?)
      `);
      const subphaseResult = insertSubphase.run(phaseId, 'Setup', '1.1', 1);
      const subphaseId = subphaseResult.lastInsertRowid;

      // Insert card
      const insertCard = db.prepare(`
        INSERT INTO cards (subphase_id, session_letter, title, description, resource, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const cardResult = insertCard.run(subphaseId, 'A', 'Test Card', 'Test description', 'claude_sub', 'Not Started');

      // Verify data was inserted
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId);
      const subphase = db.prepare('SELECT * FROM subphases WHERE id = ?').get(subphaseId);
      const card = db.prepare('SELECT * FROM cards WHERE subphase_id = ?').get(subphaseId);

      if (project && phase && subphase && card) {
        console.log('✅ PASSED: Data insertion and relationships work correctly');
        console.log(`   Project: ${project.name}`);
        console.log(`   Phase: ${phase.name}`);
        console.log(`   Subphase: ${subphase.name}`);
        console.log(`   Card: ${card.title}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Data insertion or relationships failed\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    failedTests++;
  } finally {
    // Close database connection
    if (db) {
      db.close();
    }

    // Cleanup after tests
    cleanup();

    // Print summary
    console.log('═══════════════════════════════════════');
    console.log('Test Summary:');
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📊 Total: ${passedTests + failedTests}`);
    console.log('═══════════════════════════════════════');

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
