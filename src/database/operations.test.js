const KanbanDatabase = require('./operations');
const fs = require('fs');
const path = require('path');

// Test database path
const testDbPath = path.join(__dirname, '../../test-operations.db');

// Clean up function
function cleanup() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// Sample project data
const sampleProject = {
  name: 'Test Kanban App',
  slug: 'test-kanban-app',
  description: 'A test project for the kanban application',
  prd_path: './docs/TEST_PRD.md',
  github_repo: 'https://github.com/test/kanban-app',
  columns: ['Not Started', 'In Progress', 'Done'],
  phases: [
    {
      name: 'Foundation',
      short_name: 'F',
      description: 'Setup and initial structure',
      display_order: 0,
      subphases: [
        {
          name: 'Project Setup',
          short_name: '1.1',
          description: 'Initialize project',
          display_order: 0,
          cards: [
            {
              session_letter: 'A',
              title: 'Session A: Initialize Repository',
              description: 'Set up project foundation',
              success_criteria: 'Repo exists on GitHub',
              resource: 'claude_sub',
              status: 'Done',
              depends_on_cards: [],
              is_placeholder: false,
              complexity: 'low',
              likely_needs_expansion: false,
              prompt_guide: 'Initialize the project...',
              checkpoint: 'Check that repo exists',
              git_commit_message: 'Initial commit'
            },
            {
              session_letter: 'B',
              title: 'Session B: Setup Database',
              description: 'Create database schema',
              success_criteria: 'Database tables created',
              resource: 'claude_sub',
              status: 'In Progress',
              depends_on_cards: ['A'],
              is_placeholder: false,
              complexity: 'medium',
              likely_needs_expansion: false
            }
          ]
        },
        {
          name: 'Core Features',
          short_name: '1.2',
          description: 'Build main features',
          display_order: 1,
          cards: [
            {
              session_letter: 'C',
              title: 'Session C: Build UI',
              description: 'Create user interface',
              success_criteria: 'UI renders correctly',
              resource: 'claude_sub',
              status: 'Not Started',
              depends_on_cards: ['A', 'B'],
              is_placeholder: false,
              complexity: 'high',
              likely_needs_expansion: true
            }
          ]
        }
      ]
    },
    {
      name: 'Polish',
      short_name: 'P',
      description: 'Final touches',
      display_order: 1,
      subphases: [
        {
          name: 'Testing',
          short_name: '2.1',
          description: 'Test everything',
          display_order: 0,
          cards: [
            {
              session_letter: 'D',
              title: 'Session D: Write Tests',
              description: 'Add comprehensive tests',
              success_criteria: 'All tests pass',
              resource: 'none',
              status: 'Not Started',
              depends_on_cards: ['C'],
              is_placeholder: false,
              complexity: 'medium',
              likely_needs_expansion: false
            }
          ]
        }
      ]
    }
  ]
};

// Test suite
function runTests() {
  console.log('🧪 Starting database operations tests...\n');

  let db;
  let passedTests = 0;
  let failedTests = 0;

  try {
    // Cleanup before tests
    cleanup();

    // Initialize database
    console.log('Setup: Initialize database');
    db = new KanbanDatabase(testDbPath);
    console.log('✅ Database initialized\n');

    // ========================================================================
    // PROJECT CRUD TESTS
    // ========================================================================

    // Test 1: Create project
    console.log('Test 1: Create project with nested structure');
    try {
      const projectId = db.createProject(sampleProject);

      if (projectId && typeof projectId === 'number') {
        console.log(`✅ PASSED: Project created with ID ${projectId}\n`);
        passedTests++;

        // Store for later tests
        global.testProjectId = projectId;
      } else {
        console.log('❌ FAILED: Project ID not returned\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 2: Get project
    console.log('Test 2: Get project with full nested structure');
    try {
      const project = db.getProject(global.testProjectId);

      if (project && project.name === sampleProject.name) {
        const hasPhases = project.phases && project.phases.length === 2;
        const hasSubphases = project.phases[0].subphases && project.phases[0].subphases.length === 2;
        const hasCards = project.phases[0].subphases[0].cards && project.phases[0].subphases[0].cards.length === 2;

        if (hasPhases && hasSubphases && hasCards) {
          console.log('✅ PASSED: Project retrieved with complete structure');
          console.log(`   Project: ${project.name}`);
          console.log(`   Phases: ${project.phases.length}`);
          console.log(`   Subphases in phase 1: ${project.phases[0].subphases.length}`);
          console.log(`   Cards in subphase 1.1: ${project.phases[0].subphases[0].cards.length}\n`);
          passedTests++;

          // Store card for later tests
          global.testCardId = project.phases[0].subphases[0].cards[0].id;
          global.testBlockedCardId = project.phases[0].subphases[1].cards[0].id;
        } else {
          console.log('❌ FAILED: Project structure incomplete\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Project not found or name mismatch\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 3: Get all projects
    console.log('Test 3: Get all projects with summary stats');
    try {
      const projects = db.getAllProjects();

      if (projects && projects.length === 1) {
        const project = projects[0];
        const hasStats = project.stats && typeof project.stats.total_cards === 'number';

        if (hasStats) {
          console.log('✅ PASSED: All projects retrieved with stats');
          console.log(`   Total cards: ${project.stats.total_cards}`);
          console.log(`   Completed: ${project.stats.completed_cards}`);
          console.log(`   In progress: ${project.stats.in_progress_cards}`);
          console.log(`   Not started: ${project.stats.not_started_cards}`);
          console.log(`   Completion: ${project.stats.completion_percentage}%\n`);
          passedTests++;
        } else {
          console.log('❌ FAILED: Stats not included\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Expected 1 project\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 4: Update project
    console.log('Test 4: Update project fields');
    try {
      const success = db.updateProject(global.testProjectId, {
        description: 'Updated description',
        github_repo: 'https://github.com/updated/repo'
      });

      if (success) {
        const project = db.getProject(global.testProjectId);
        if (project.description === 'Updated description' &&
            project.github_repo === 'https://github.com/updated/repo') {
          console.log('✅ PASSED: Project updated successfully\n');
          passedTests++;
        } else {
          console.log('❌ FAILED: Project fields not updated\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Update returned false\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // ========================================================================
    // CARD OPERATIONS TESTS
    // ========================================================================

    // Test 5: Get card
    console.log('Test 5: Get card with full details');
    try {
      const card = db.getCard(global.testCardId);

      if (card && card.session_letter === 'A') {
        const hasProjectInfo = card.project_name && card.phase_name && card.subphase_name;
        const hasParsedJson = Array.isArray(card.depends_on_cards);

        if (hasProjectInfo && hasParsedJson) {
          console.log('✅ PASSED: Card retrieved with full details');
          console.log(`   Card: ${card.title}`);
          console.log(`   Project: ${card.project_name}`);
          console.log(`   Phase: ${card.phase_name}`);
          console.log(`   Subphase: ${card.subphase_name}`);
          console.log(`   Status: ${card.status}\n`);
          passedTests++;
        } else {
          console.log('❌ FAILED: Card details incomplete\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Card not found\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 6: Update card status to Done
    console.log('Test 6: Update card status to Done');
    try {
      const success = db.updateCardStatus(global.testCardId, 'Done');

      if (success) {
        const card = db.getCard(global.testCardId);
        if (card.status === 'Done' && card.completed_at) {
          console.log('✅ PASSED: Card status updated to Done with completed_at timestamp');
          console.log(`   Completed at: ${card.completed_at}\n`);
          passedTests++;
        } else {
          console.log('❌ FAILED: Status or completed_at not set correctly\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Update returned false\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 7: Update card status back to Not Started
    console.log('Test 7: Update card status back to Not Started');
    try {
      const success = db.updateCardStatus(global.testCardId, 'Not Started');

      if (success) {
        const card = db.getCard(global.testCardId);
        if (card.status === 'Not Started' && !card.completed_at) {
          console.log('✅ PASSED: Card status updated and completed_at cleared\n');
          passedTests++;
        } else {
          console.log('❌ FAILED: Status or completed_at not updated correctly\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Update returned false\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 8: Update card prompt data
    console.log('Test 8: Update card prompt data');
    try {
      const promptData = {
        prompt_guide: 'Updated prompt guide',
        checkpoint: 'Updated checkpoint',
        git_commit_message: 'Updated commit message'
      };

      const success = db.updateCardPrompt(global.testCardId, promptData);

      if (success) {
        const card = db.getCard(global.testCardId);
        if (card.prompt_guide === promptData.prompt_guide &&
            card.checkpoint === promptData.checkpoint &&
            card.git_commit_message === promptData.git_commit_message) {
          console.log('✅ PASSED: Card prompt data updated successfully\n');
          passedTests++;
        } else {
          console.log('❌ FAILED: Prompt data not updated correctly\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Update returned false\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 9: Get blocked reason
    console.log('Test 9: Get blocked reason for card with dependencies');
    try {
      // Card C depends on A and B
      const reason = db.getBlockedReason(global.testBlockedCardId);

      if (reason && reason.includes('Waiting on card')) {
        console.log('✅ PASSED: Blocked reason returned correctly');
        console.log(`   Reason: ${reason}\n`);
        passedTests++;
      } else {
        console.log('❌ FAILED: Expected blocked reason\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 10: Get workable cards
    console.log('Test 10: Get workable cards (not blocked)');
    try {
      const workableCards = db.getWorkableCards(global.testProjectId);

      // Should only include cards with no dependencies or dependencies met
      // Card A has no dependencies (but we set it to Not Started in test 7)
      const hasCards = workableCards.length > 0;
      const allNotStarted = workableCards.every(c => c.status === 'Not Started');

      if (hasCards && allNotStarted) {
        console.log('✅ PASSED: Workable cards retrieved');
        console.log(`   Count: ${workableCards.length}`);
        workableCards.forEach(c => {
          console.log(`   - ${c.session_letter}: ${c.title}`);
        });
        console.log('');
        passedTests++;
      } else {
        console.log('❌ FAILED: Workable cards not correct\n');
        console.log(`   Found ${workableCards.length} cards\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 11: Mark dependency complete to unblock card
    console.log('Test 11: Mark dependency complete to unblock card');
    try {
      // Mark card A as Done (Card B depends on A)
      db.updateCardStatus(global.testCardId, 'Done');

      // Now check if B is still blocked
      const cardBId = db.getProject(global.testProjectId).phases[0].subphases[0].cards[1].id;
      const reason = db.getBlockedReason(cardBId);

      // Card B depends on A only, so it should not be blocked anymore
      if (!reason) {
        console.log('✅ PASSED: Card unblocked after dependency completed\n');
        passedTests++;
      } else {
        console.log(`❌ FAILED: Card still blocked: ${reason}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // ========================================================================
    // IMPORT/EXPORT TESTS
    // ========================================================================

    // Test 12: Export project to JSON
    console.log('Test 12: Export project to JSON');
    try {
      const exportedJson = db.exportProjectToJson(global.testProjectId);

      if (exportedJson && exportedJson.name === 'Test Kanban App') {
        const hasNoId = !exportedJson.id;
        const hasPhases = exportedJson.phases && exportedJson.phases.length > 0;
        const phaseHasNoId = hasPhases && !exportedJson.phases[0].id;

        if (hasNoId && hasPhases && phaseHasNoId) {
          console.log('✅ PASSED: Project exported to JSON without DB IDs');
          console.log(`   Project: ${exportedJson.name}`);
          console.log(`   Phases: ${exportedJson.phases.length}`);
          console.log(`   Subphases in first phase: ${exportedJson.phases[0].subphases.length}\n`);
          passedTests++;

          // Store for import test
          global.exportedJson = exportedJson;
        } else {
          console.log('❌ FAILED: Exported JSON structure incorrect\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Export failed or data incorrect\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 13: Import project from JSON
    console.log('Test 13: Import project from JSON');
    try {
      // Modify the exported JSON to create a new project
      const importData = {
        ...global.exportedJson,
        name: 'Imported Project',
        slug: 'imported-project'
      };

      const newProjectId = db.importProjectFromJson(importData);

      if (newProjectId && typeof newProjectId === 'number') {
        const importedProject = db.getProject(newProjectId);

        if (importedProject && importedProject.name === 'Imported Project') {
          const hasPhases = importedProject.phases && importedProject.phases.length === 2;

          if (hasPhases) {
            console.log('✅ PASSED: Project imported successfully');
            console.log(`   New project ID: ${newProjectId}`);
            console.log(`   Name: ${importedProject.name}`);
            console.log(`   Phases: ${importedProject.phases.length}\n`);
            passedTests++;

            global.importedProjectId = newProjectId;
          } else {
            console.log('❌ FAILED: Imported project structure incomplete\n');
            failedTests++;
          }
        } else {
          console.log('❌ FAILED: Imported project not found\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Import did not return project ID\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 14: Verify two projects exist
    console.log('Test 14: Verify multiple projects exist');
    try {
      const allProjects = db.getAllProjects();

      if (allProjects.length === 2) {
        console.log('✅ PASSED: Both projects exist in database');
        allProjects.forEach(p => {
          console.log(`   - ${p.name} (${p.stats.total_cards} cards, ${p.stats.completion_percentage}% complete)`);
        });
        console.log('');
        passedTests++;
      } else {
        console.log(`❌ FAILED: Expected 2 projects, found ${allProjects.length}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 15: Delete project (with cascade)
    console.log('Test 15: Delete project with cascade');
    try {
      const success = db.deleteProject(global.importedProjectId);

      if (success) {
        const deletedProject = db.getProject(global.importedProjectId);

        if (!deletedProject) {
          const allProjects = db.getAllProjects();

          if (allProjects.length === 1) {
            console.log('✅ PASSED: Project deleted with cascade');
            console.log(`   Remaining projects: ${allProjects.length}\n`);
            passedTests++;
          } else {
            console.log('❌ FAILED: Expected 1 remaining project\n');
            failedTests++;
          }
        } else {
          console.log('❌ FAILED: Project still exists after delete\n');
          failedTests++;
        }
      } else {
        console.log('❌ FAILED: Delete returned false\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 16: Error handling - invalid status
    console.log('Test 16: Error handling - invalid status');
    try {
      db.updateCardStatus(global.testCardId, 'Invalid Status');
      console.log('❌ FAILED: Should have thrown error for invalid status\n');
      failedTests++;
    } catch (error) {
      if (error.message.includes('Invalid status')) {
        console.log('✅ PASSED: Invalid status rejected with error\n');
        passedTests++;
      } else {
        console.log(`❌ FAILED: Wrong error message: ${error.message}\n`);
        failedTests++;
      }
    }

    // Test 17: Error handling - non-existent project
    console.log('Test 17: Error handling - non-existent project');
    try {
      const project = db.getProject(99999);

      if (project === null) {
        console.log('✅ PASSED: Non-existent project returns null\n');
        passedTests++;
      } else {
        console.log('❌ FAILED: Should return null for non-existent project\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
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
