const { initDb } = require('./schema');

/**
 * Database operations wrapper with error handling and transactions
 */
class KanbanDatabase {
  constructor(dbPath = null) {
    this.db = initDb(dbPath);
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }

  // ============================================================================
  // PROJECT OPERATIONS
  // ============================================================================

  /**
   * Create a new project with phases, subphases, and cards
   * @param {Object} data - Project data including phases array
   * @returns {number} - The new project ID
   */
  createProject(data) {
    const transaction = this.db.transaction((projectData) => {
      // Insert project
      const insertProject = this.db.prepare(`
        INSERT INTO projects (name, slug, description, prd_path, github_repo, columns)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const columns = projectData.columns || ['Not Started', 'In Progress', 'Done'];
      const result = insertProject.run(
        projectData.name,
        projectData.slug,
        projectData.description || null,
        projectData.prd_path || null,
        projectData.github_repo || null,
        JSON.stringify(columns)
      );

      const projectId = result.lastInsertRowid;

      // Insert phases if provided
      if (projectData.phases && Array.isArray(projectData.phases)) {
        const insertPhase = this.db.prepare(`
          INSERT INTO phases (project_id, name, short_name, description, display_order)
          VALUES (?, ?, ?, ?, ?)
        `);

        const insertSubphase = this.db.prepare(`
          INSERT INTO subphases (phase_id, name, short_name, description, display_order)
          VALUES (?, ?, ?, ?, ?)
        `);

        const insertCard = this.db.prepare(`
          INSERT INTO cards (
            subphase_id, session_letter, title, description, success_criteria,
            resource, status, depends_on_cards, is_placeholder, complexity,
            likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
            parent_card_id, is_expanded
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        projectData.phases.forEach((phase, phaseIndex) => {
          const phaseResult = insertPhase.run(
            projectId,
            phase.name,
            phase.short_name || null,
            phase.description || null,
            phase.display_order !== undefined ? phase.display_order : phaseIndex
          );

          const phaseId = phaseResult.lastInsertRowid;

          // Insert subphases
          if (phase.subphases && Array.isArray(phase.subphases)) {
            phase.subphases.forEach((subphase, subphaseIndex) => {
              const subphaseResult = insertSubphase.run(
                phaseId,
                subphase.name,
                subphase.short_name || null,
                subphase.description || null,
                subphase.display_order !== undefined ? subphase.display_order : subphaseIndex
              );

              const subphaseId = subphaseResult.lastInsertRowid;

              // Insert cards
              if (subphase.cards && Array.isArray(subphase.cards)) {
                subphase.cards.forEach((card) => {
                  insertCard.run(
                    subphaseId,
                    card.session_letter,
                    card.title,
                    card.description || null,
                    card.success_criteria || null,
                    card.resource || 'claude_sub',
                    card.status || 'Not Started',
                    JSON.stringify(card.depends_on_cards || []),
                    card.is_placeholder ? 1 : 0,
                    card.complexity || 'medium',
                    card.likely_needs_expansion ? 1 : 0,
                    card.prompt_guide || null,
                    card.checkpoint || null,
                    card.git_commit_message || null,
                    card.parent_card_id || null,
                    card.is_expanded ? 1 : 0
                  );
                });
              }
            });
          }
        });
      }

      return projectId;
    });

    try {
      return transaction(data);
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * Get a project with all its phases, subphases, and cards
   * @param {number} id - Project ID
   * @returns {Object|null} - Project object with nested data
   */
  getProject(id) {
    try {
      // Get project
      const project = this.db.prepare(`
        SELECT * FROM projects WHERE id = ?
      `).get(id);

      if (!project) {
        return null;
      }

      // Parse JSON columns
      project.columns = JSON.parse(project.columns);

      // Get phases
      const phases = this.db.prepare(`
        SELECT * FROM phases WHERE project_id = ? ORDER BY display_order
      `).all(id);

      // Get all subphases for this project
      const subphases = this.db.prepare(`
        SELECT s.* FROM subphases s
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ?
        ORDER BY s.display_order
      `).all(id);

      // Get all cards for this project
      const cards = this.db.prepare(`
        SELECT c.* FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ?
      `).all(id);

      // Parse JSON fields in cards
      cards.forEach(card => {
        card.depends_on_cards = JSON.parse(card.depends_on_cards);
        card.is_placeholder = Boolean(card.is_placeholder);
        card.likely_needs_expansion = Boolean(card.likely_needs_expansion);
        card.is_expanded = Boolean(card.is_expanded);
      });

      // Build nested structure
      project.phases = phases.map(phase => {
        const phaseSubphases = subphases.filter(s => s.phase_id === phase.id);

        phase.subphases = phaseSubphases.map(subphase => {
          subphase.cards = cards.filter(c => c.subphase_id === subphase.id);
          return subphase;
        });

        return phase;
      });

      return project;
    } catch (error) {
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  /**
   * Get all projects with summary statistics
   * @returns {Array} - Array of projects with stats
   */
  getAllProjects() {
    try {
      const projects = this.db.prepare(`
        SELECT * FROM projects ORDER BY created_at DESC
      `).all();

      // Parse JSON and add stats for each project
      return projects.map(project => {
        project.columns = JSON.parse(project.columns);

        // Get card counts
        const stats = this.db.prepare(`
          SELECT
            COUNT(*) as total_cards,
            SUM(CASE WHEN c.status = 'Done' THEN 1 ELSE 0 END) as completed_cards,
            SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_cards,
            SUM(CASE WHEN c.status = 'Not Started' THEN 1 ELSE 0 END) as not_started_cards
          FROM cards c
          JOIN subphases s ON c.subphase_id = s.id
          JOIN phases p ON s.phase_id = p.id
          WHERE p.project_id = ?
        `).get(project.id);

        project.stats = {
          total_cards: stats.total_cards || 0,
          completed_cards: stats.completed_cards || 0,
          in_progress_cards: stats.in_progress_cards || 0,
          not_started_cards: stats.not_started_cards || 0,
          completion_percentage: stats.total_cards > 0
            ? Math.round((stats.completed_cards / stats.total_cards) * 100)
            : 0
        };

        return project;
      });
    } catch (error) {
      throw new Error(`Failed to get all projects: ${error.message}`);
    }
  }

  /**
   * Update a project
   * @param {number} id - Project ID
   * @param {Object} data - Fields to update
   * @returns {boolean} - Success status
   */
  updateProject(id, data) {
    try {
      const allowedFields = ['name', 'slug', 'description', 'prd_path', 'github_repo', 'columns'];
      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = ?`);
          values.push(key === 'columns' ? JSON.stringify(value) : value);
        }
      }

      if (updates.length === 0) {
        return false;
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
      const result = this.db.prepare(sql).run(...values);

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  /**
   * Delete a project (cascades to phases, subphases, cards)
   * @param {number} id - Project ID
   * @returns {boolean} - Success status
   */
  deleteProject(id) {
    try {
      const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  // ============================================================================
  // CARD OPERATIONS
  // ============================================================================

  /**
   * Get a card with full details
   * @param {number} id - Card ID
   * @returns {Object|null} - Card object with parsed JSON fields
   */
  getCard(id) {
    try {
      const card = this.db.prepare(`
        SELECT c.*, s.name as subphase_name, p.name as phase_name, pr.name as project_name
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        JOIN projects pr ON p.project_id = pr.id
        WHERE c.id = ?
      `).get(id);

      if (!card) {
        return null;
      }

      // Parse JSON fields
      card.depends_on_cards = JSON.parse(card.depends_on_cards);
      card.is_placeholder = Boolean(card.is_placeholder);
      card.likely_needs_expansion = Boolean(card.likely_needs_expansion);
      card.is_expanded = Boolean(card.is_expanded);

      return card;
    } catch (error) {
      throw new Error(`Failed to get card: ${error.message}`);
    }
  }

  /**
   * Update card status and set completed_at if status is 'Done'
   * @param {number} id - Card ID
   * @param {string} status - New status ('Not Started', 'In Progress', 'Done')
   * @returns {boolean} - Success status
   */
  updateCardStatus(id, status) {
    const validStatuses = ['Not Started', 'In Progress', 'Done'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      const sql = status === 'Done'
        ? `UPDATE cards SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE cards SET status = ?, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

      const result = this.db.prepare(sql).run(status, id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update card status: ${error.message}`);
    }
  }

  /**
   * Update card prompt-related data
   * @param {number} id - Card ID
   * @param {Object} promptData - Object with prompt_guide, checkpoint, git_commit_message
   * @returns {boolean} - Success status
   */
  updateCardPrompt(id, promptData) {
    try {
      const updates = [];
      const values = [];

      if (promptData.prompt_guide !== undefined) {
        updates.push('prompt_guide = ?');
        values.push(promptData.prompt_guide);
      }
      if (promptData.checkpoint !== undefined) {
        updates.push('checkpoint = ?');
        values.push(promptData.checkpoint);
      }
      if (promptData.git_commit_message !== undefined) {
        updates.push('git_commit_message = ?');
        values.push(promptData.git_commit_message);
      }

      if (updates.length === 0) {
        return false;
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE cards SET ${updates.join(', ')} WHERE id = ?`;
      const result = this.db.prepare(sql).run(...values);

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update card prompt: ${error.message}`);
    }
  }

  /**
   * Get workable cards for a project (not blocked by dependencies)
   * @param {number} projectId - Project ID
   * @returns {Array} - Array of workable cards
   */
  getWorkableCards(projectId) {
    try {
      // Get all cards for the project
      const cards = this.db.prepare(`
        SELECT c.*, s.name as subphase_name, p.name as phase_name
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ? AND c.status = 'Not Started'
        ORDER BY p.display_order, s.display_order
      `).all(projectId);

      // Parse JSON and filter workable cards
      const workableCards = [];

      for (const card of cards) {
        card.depends_on_cards = JSON.parse(card.depends_on_cards);
        card.is_placeholder = Boolean(card.is_placeholder);
        card.likely_needs_expansion = Boolean(card.likely_needs_expansion);
        card.is_expanded = Boolean(card.is_expanded);

        const blockedReason = this.getBlockedReason(card.id);
        if (!blockedReason) {
          workableCards.push(card);
        }
      }

      return workableCards;
    } catch (error) {
      throw new Error(`Failed to get workable cards: ${error.message}`);
    }
  }

  /**
   * Get the reason why a card is blocked, or null if not blocked
   * @param {number} cardId - Card ID
   * @returns {string|null} - Blocked reason or null
   */
  getBlockedReason(cardId) {
    try {
      const card = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);

      if (!card) {
        throw new Error('Card not found');
      }

      const dependsOnCards = JSON.parse(card.depends_on_cards);

      // Check if depends on specific cards
      if (dependsOnCards.length > 0) {
        // Get all cards in the same project to check dependencies
        const projectCards = this.db.prepare(`
          SELECT c.session_letter, c.status
          FROM cards c
          JOIN subphases s ON c.subphase_id = s.id
          JOIN phases p ON s.phase_id = p.id
          WHERE p.project_id = (
            SELECT p2.project_id
            FROM cards c2
            JOIN subphases s2 ON c2.subphase_id = s2.id
            JOIN phases p2 ON s2.phase_id = p2.id
            WHERE c2.id = ?
          )
        `).all(cardId);

        const cardsByLetter = {};
        projectCards.forEach(c => {
          cardsByLetter[c.session_letter] = c.status;
        });

        const incompleteCards = [];
        for (const letter of dependsOnCards) {
          if (!cardsByLetter[letter] || cardsByLetter[letter] !== 'Done') {
            incompleteCards.push(letter);
          }
        }

        if (incompleteCards.length > 0) {
          return `Waiting on card${incompleteCards.length > 1 ? 's' : ''}: ${incompleteCards.join(', ')}`;
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to get blocked reason: ${error.message}`);
    }
  }

  // ============================================================================
  // IMPORT/EXPORT OPERATIONS
  // ============================================================================

  /**
   * Import a project from JSON data
   * @param {Object} jsonData - Project data in JSON format
   * @returns {number} - The new project ID
   */
  importProjectFromJson(jsonData) {
    try {
      // Handle nested 'project' key structure
      // JSON can be either { name, slug, phases, ... } or { project: { name, slug, ... }, phases, ... }
      let projectData;
      if (jsonData.project) {
        // Merge project metadata with root-level arrays (phases, etc.)
        const { project, ...rest } = jsonData;
        projectData = { ...project, ...rest };
      } else {
        projectData = jsonData;
      }

      // Validate required fields
      if (!projectData.name || !projectData.slug) {
        throw new Error('Project must have name and slug');
      }

      return this.createProject(projectData);
    } catch (error) {
      throw new Error(`Failed to import project: ${error.message}`);
    }
  }

  /**
   * Export a project to JSON format
   * @param {number} projectId - Project ID
   * @returns {Object} - Project data in JSON format
   */
  exportProjectToJson(projectId) {
    try {
      const project = this.getProject(projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      // Remove database-specific fields
      const cleanProject = (obj) => {
        const { id, created_at, updated_at, ...rest } = obj;
        return rest;
      };

      const exportData = cleanProject(project);

      if (exportData.phases) {
        exportData.phases = exportData.phases.map(phase => {
          const cleanPhase = cleanProject(phase);
          if (cleanPhase.subphases) {
            cleanPhase.subphases = cleanPhase.subphases.map(subphase => {
              const cleanSubphase = cleanProject(subphase);
              if (cleanSubphase.cards) {
                cleanSubphase.cards = cleanSubphase.cards.map(card => {
                  const cleanCard = cleanProject(card);
                  // Remove subphase_id as it's relative to this structure
                  delete cleanCard.subphase_id;
                  delete cleanCard.parent_card_id;
                  return cleanCard;
                });
              }
              return cleanSubphase;
            });
          }
          return cleanPhase;
        });
      }

      return exportData;
    } catch (error) {
      throw new Error(`Failed to export project: ${error.message}`);
    }
  }
}

module.exports = KanbanDatabase;
