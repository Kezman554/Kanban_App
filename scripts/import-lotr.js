/**
 * Script to import the LOTR YouTube project JSON into the database
 * Run with: node scripts/import-lotr.js
 */

const fs = require('fs');
const path = require('path');
const KanbanDatabase = require('../src/database/operations');

async function importLOTRProject() {
  console.log('Starting LOTR project import...');

  // Read the LOTR JSON file
  const jsonPath = path.join(__dirname, '../docs/lotr-youtube_kanban.json');
  console.log(`Reading JSON from: ${jsonPath}`);

  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(jsonContent);

  // Transform the JSON structure to match the database schema
  const projectData = {
    name: data.project.name,
    slug: data.project.slug,
    description: data.project.description,
    prd_path: data.project.prd_path,
    github_repo: data.project.github_repo,
    columns: ['Not Started', 'In Progress', 'Done'], // Default columns
    phases: data.phases.map((phase) => ({
      name: phase.name,
      short_name: phase.short_name,
      description: phase.description,
      display_order: phase.order,
      subphases: phase.subphases.map((subphase) => ({
        name: subphase.name,
        short_name: subphase.short_name,
        description: subphase.description,
        display_order: subphase.order,
        cards: subphase.cards.map((card) => ({
          session_letter: card.session_letter,
          title: card.title,
          description: card.description,
          success_criteria: card.success_criteria,
          resource: card.resource,
          status: card.status || 'Not Started',
          depends_on_cards: card.depends_on_cards || [],
          is_placeholder: card.is_placeholder || false,
          complexity: card.complexity || 'medium',
          likely_needs_expansion: card.likely_needs_expansion || false,
          prompt_guide: null,
          checkpoint: null,
          git_commit_message: null,
          parent_card_id: null,
          is_expanded: false
        }))
      }))
    }))
  };

  // Initialize database and import
  console.log('Initializing database...');
  const db = new KanbanDatabase();

  try {
    // Check if project already exists
    const existingProjects = db.getAllProjects();
    const existingProject = existingProjects.find(p => p.slug === projectData.slug);

    if (existingProject) {
      console.log(`Project "${projectData.name}" already exists (ID: ${existingProject.id})`);
      console.log('Delete it first if you want to re-import.');
      db.close();
      return;
    }

    console.log('Importing project...');
    const projectId = db.createProject(projectData);

    console.log(`\n✓ Successfully imported project!`);
    console.log(`  Project ID: ${projectId}`);
    console.log(`  Name: ${projectData.name}`);
    console.log(`  Slug: ${projectData.slug}`);
    console.log(`  Phases: ${projectData.phases.length}`);

    // Calculate and display statistics
    let totalSubphases = 0;
    let totalCards = 0;
    projectData.phases.forEach(phase => {
      totalSubphases += phase.subphases.length;
      phase.subphases.forEach(subphase => {
        totalCards += subphase.cards.length;
      });
    });

    console.log(`  Subphases: ${totalSubphases}`);
    console.log(`  Cards: ${totalCards}`);

    db.close();
    console.log('\nDatabase connection closed.');
  } catch (error) {
    console.error('Error importing project:', error);
    db.close();
    process.exit(1);
  }
}

// Run the import
importLOTRProject().catch(console.error);
