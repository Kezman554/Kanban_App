/**
 * Quick script to check card statuses in the database
 */

const KanbanDatabase = require('../src/database/operations');

const db = new KanbanDatabase();

try {
  const project = db.getProject(1); // LOTR project

  console.log('\n=== LOTR YouTube Channel Project ===');
  console.log(`Project: ${project.name}`);
  console.log(`Total Phases: ${project.phases.length}`);

  let totalCards = 0;
  let statusCounts = { 'Not Started': 0, 'In Progress': 0, 'Done': 0 };

  console.log('\n=== Card Overview ===');
  project.phases.forEach(phase => {
    phase.subphases.forEach(subphase => {
      subphase.cards.forEach(card => {
        totalCards++;
        statusCounts[card.status]++;

        // Show first 5 cards as examples
        if (totalCards <= 5) {
          console.log(`\nCard ${card.session_letter}: ${card.title}`);
          console.log(`  Status: ${card.status}`);
          console.log(`  Subphase: ${subphase.short_name} - ${subphase.name}`);
          console.log(`  Dependencies: ${card.depends_on_cards.join(', ') || 'None'}`);
        }
      });
    });
  });

  console.log('\n=== Status Summary ===');
  console.log(`Total Cards: ${totalCards}`);
  console.log(`Not Started: ${statusCounts['Not Started']}`);
  console.log(`In Progress: ${statusCounts['In Progress']}`);
  console.log(`Done: ${statusCounts['Done']}`);

  console.log('\n=== Cards with Dependencies ===');
  project.phases.forEach(phase => {
    phase.subphases.forEach(subphase => {
      subphase.cards.forEach(card => {
        if (card.depends_on_cards.length > 0) {
          console.log(`Card ${card.session_letter} depends on: ${card.depends_on_cards.join(', ')}`);
        }
      });
    });
  });

  db.close();
} catch (error) {
  console.error('Error:', error);
  db.close();
}
