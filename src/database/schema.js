const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Initialize the SQLite database and create all tables with indexes
 * @param {string} dbPath - Optional custom database path (defaults to data/kanban.db)
 * @returns {Database} - The initialized database instance
 */
function initDb(dbPath = null) {
  // Use provided path or default to data/kanban.db
  const finalPath = dbPath || path.join(process.cwd(), 'data', 'kanban.db');

  // Ensure the directory exists
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create database connection
  const db = new Database(finalPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      prd_path TEXT,
      github_repo TEXT,
      columns TEXT DEFAULT '["Not Started", "In Progress", "Done"]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create phases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create subphases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subphases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE CASCADE
    )
  `);

  // Create cards table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subphase_id INTEGER NOT NULL,
      session_letter TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      success_criteria TEXT,
      resource TEXT DEFAULT 'claude_sub' CHECK(resource IN ('claude_sub', 'anthropic_api', 'none', 'tbc')),
      status TEXT DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Done')),
      depends_on_cards TEXT DEFAULT '[]',
      is_placeholder INTEGER DEFAULT 0,
      complexity TEXT DEFAULT 'medium' CHECK(complexity IN ('low', 'medium', 'high')),
      likely_needs_expansion INTEGER DEFAULT 0,
      prompt_guide TEXT,
      checkpoint TEXT,
      git_commit_message TEXT,
      parent_card_id INTEGER,
      is_expanded INTEGER DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subphase_id) REFERENCES subphases(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_card_id) REFERENCES cards(id) ON DELETE SET NULL
    )
  `);

  // Create resources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes on foreign keys for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_phases_project_id
    ON phases(project_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subphases_phase_id
    ON subphases(phase_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_subphase_id
    ON cards(subphase_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_parent_card_id
    ON cards(parent_card_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_status
    ON cards(status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_resource
    ON cards(resource)
  `);

  // Insert default resources if table is empty
  const resourceCount = db.prepare('SELECT COUNT(*) as count FROM resources').get();
  if (resourceCount.count === 0) {
    const insertResource = db.prepare(`
      INSERT INTO resources (slug, name, is_available)
      VALUES (?, ?, ?)
    `);

    insertResource.run('claude_sub', 'Claude Subscription', 1);
    insertResource.run('anthropic_api', 'Anthropic API', 1);
    insertResource.run('none', 'No AI Required', 1);
    insertResource.run('tbc', 'To Be Confirmed', 1);
  }

  return db;
}

/**
 * Get table information for a specific table
 * @param {Database} db - Database instance
 * @param {string} tableName - Name of the table
 * @returns {Array} - Array of column information
 */
function getTableInfo(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

/**
 * Get all index information for a specific table
 * @param {Database} db - Database instance
 * @param {string} tableName - Name of the table
 * @returns {Array} - Array of index information
 */
function getIndexInfo(db, tableName) {
  return db.prepare(`PRAGMA index_list(${tableName})`).all();
}

module.exports = {
  initDb,
  getTableInfo,
  getIndexInfo
};
