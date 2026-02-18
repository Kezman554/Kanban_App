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
        INSERT INTO projects (name, slug, description, prd_path, github_repo, directory_path, columns)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const columns = projectData.columns || ['Not Started', 'In Progress', 'Done'];
      const result = insertProject.run(
        projectData.name,
        projectData.slug,
        projectData.description || null,
        projectData.prd_path || null,
        projectData.github_repo || null,
        projectData.directory_path || null,
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
      const allowedFields = ['name', 'slug', 'description', 'prd_path', 'github_repo', 'directory_path', 'columns'];
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

  /**
   * Update a project's directory path
   * @param {number} id - Project ID
   * @param {string} directoryPath - The filesystem path to the project directory
   * @returns {boolean} - Success status
   */
  updateProjectPath(id, directoryPath) {
    try {
      const sql = `UPDATE projects SET directory_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = this.db.prepare(sql).run(directoryPath, id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update project path: ${error.message}`);
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
   * Create a new card in a subphase
   * @param {number} subphaseId - Subphase ID
   * @param {Object} cardData - Card data
   * @returns {number} - The new card ID
   */
  createCard(subphaseId, cardData) {
    try {
      const sql = `
        INSERT INTO cards (
          subphase_id, session_letter, title, description, success_criteria,
          resource, status, depends_on_cards, is_placeholder, complexity,
          likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
          notes, parent_card_id, is_expanded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = this.db.prepare(sql).run(
        subphaseId,
        cardData.session_letter,
        cardData.title,
        cardData.description || null,
        cardData.success_criteria || null,
        cardData.resource || 'claude_sub',
        'Not Started',
        JSON.stringify(cardData.depends_on_cards || []),
        cardData.is_placeholder ? 1 : 0,
        cardData.complexity || 'medium',
        cardData.likely_needs_expansion ? 1 : 0,
        cardData.prompt_guide || null,
        cardData.checkpoint || null,
        cardData.git_commit_message || null,
        cardData.notes || null,
        cardData.parent_card_id || null,
        0
      );

      return result.lastInsertRowid;
    } catch (error) {
      throw new Error(`Failed to create card: ${error.message}`);
    }
  }

  /**
   * Get the next available session letter for a subphase
   * @param {number} projectId - Project ID
   * @param {number} subphaseId - Subphase ID
   * @returns {string} - Next available session letter
   *
   * Logic:
   * - If subphase has cards: increment from the last card's letter (C → C2, C2 → C3)
   * - If subphase is empty: find next unused base letter in project
   */
  getNextSessionLetter(projectId, subphaseId) {
    try {
      // Get cards in this specific subphase
      const subphaseCards = this.db.prepare(`
        SELECT session_letter FROM cards WHERE subphase_id = ?
      `).all(subphaseId).map(row => row.session_letter);

      if (subphaseCards.length > 0) {
        // Subphase has cards - increment from the last one
        // Sort to find the "last" card (highest letter/number)
        const sorted = subphaseCards.sort((a, b) => {
          const aBase = this._getBaseLetter(a);
          const bBase = this._getBaseLetter(b);
          const aNum = this._getSuffix(a);
          const bNum = this._getSuffix(b);

          // First compare base letters
          if (aBase !== bBase) {
            if (aBase.length !== bBase.length) return aBase.length - bBase.length;
            return aBase.localeCompare(bBase);
          }
          // Then compare suffix numbers
          return aNum - bNum;
        });

        const lastLetter = sorted[sorted.length - 1];
        const baseLetter = this._getBaseLetter(lastLetter);
        const currentSuffix = this._getSuffix(lastLetter);

        // If no suffix (just "C"), return "C2", otherwise increment suffix
        if (currentSuffix === 1) {
          return baseLetter + '2';
        } else {
          return baseLetter + (currentSuffix + 1);
        }
      }

      // Subphase is empty - find next unused base letter
      const allProjectLetters = this.db.prepare(`
        SELECT c.session_letter
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ?
      `).all(projectId).map(row => row.session_letter);

      if (allProjectLetters.length === 0) {
        return 'A';
      }

      // Extract all base letters used in the project
      const usedBaseLetters = new Set(
        allProjectLetters.map(letter => this._getBaseLetter(letter))
      );

      // Find next available base letter
      return this._getNextUnusedBaseLetter(usedBaseLetters);
    } catch (error) {
      throw new Error(`Failed to get next session letter: ${error.message}`);
    }
  }

  /**
   * Extract base letter from a session letter (C2 → C, AA3 → AA, M → M)
   * @private
   */
  _getBaseLetter(letter) {
    // Remove trailing digits to get base letter
    return letter.replace(/\d+$/, '');
  }

  /**
   * Extract numeric suffix from session letter (C2 → 2, C → 1, AA3 → 3)
   * @private
   */
  _getSuffix(letter) {
    const match = letter.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Find next unused base letter (A, B, C, ... Z, AA, AB, etc.)
   * @private
   */
  _getNextUnusedBaseLetter(usedBaseLetters) {
    // Try single letters first (A-Z)
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i); // A=65
      if (!usedBaseLetters.has(letter)) {
        return letter;
      }
    }

    // Try double letters (AA-ZZ)
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const letter = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
        if (!usedBaseLetters.has(letter)) {
          return letter;
        }
      }
    }

    // Fallback (shouldn't happen with 702 possible combinations)
    return 'AAA';
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
   * Update card notes
   * @param {number} id - Card ID
   * @param {string} notes - Notes text
   * @returns {boolean} - Success status
   */
  updateCardNotes(id, notes) {
    try {
      const sql = `UPDATE cards SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = this.db.prepare(sql).run(notes, id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update card notes: ${error.message}`);
    }
  }

  /**
   * Clear all dependencies for a card (unlock it)
   * @param {number} id - Card ID
   * @returns {boolean} - Success status
   */
  clearCardDependencies(id) {
    try {
      const sql = `UPDATE cards SET depends_on_cards = '[]', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = this.db.prepare(sql).run(id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to clear card dependencies: ${error.message}`);
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

  /**
   * Get all Done cards for a project with their notes
   * @param {number} projectId - Project ID
   * @returns {Array} - Array of done cards with session_letter, title, success_criteria, notes
   */
  getDoneCardsForProject(projectId) {
    try {
      const cards = this.db.prepare(`
        SELECT c.session_letter, c.title, c.success_criteria, c.notes
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ? AND c.status = 'Done'
        ORDER BY p.display_order, s.display_order, c.session_letter
      `).all(projectId);

      return cards;
    } catch (error) {
      throw new Error(`Failed to get done cards: ${error.message}`);
    }
  }

  // ============================================================================
  // APPEND CARDS OPERATIONS
  // ============================================================================

  /**
   * Append new cards to an existing project from JSON data
   * @param {number} projectId - Project ID to append to
   * @param {Object} data - { add_to_phase, add_to_subphase, new_cards, dependency_updates }
   * @returns {Object} - { cardsAdded, dependenciesUpdated, warnings }
   */
  appendCards(projectId, data) {
    const transaction = this.db.transaction((projectId, data) => {
      const warnings = [];
      let cardsAdded = 0;
      let dependenciesUpdated = 0;

      // Validate phase exists in this project
      const phase = this.db.prepare(`
        SELECT id FROM phases WHERE id = ? AND project_id = ?
      `).get(data.add_to_phase, projectId);

      if (!phase) {
        throw new Error(`Phase ${data.add_to_phase} not found in project ${projectId}`);
      }

      // Validate subphase exists in that phase
      const subphase = this.db.prepare(`
        SELECT id FROM subphases WHERE id = ? AND phase_id = ?
      `).get(data.add_to_subphase, data.add_to_phase);

      if (!subphase) {
        throw new Error(`Subphase ${data.add_to_subphase} not found in phase ${data.add_to_phase}`);
      }

      // Get all existing session letters in the project
      const existingLetters = this.db.prepare(`
        SELECT c.session_letter
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ?
      `).all(projectId).map(row => row.session_letter);

      const existingLetterSet = new Set(existingLetters);

      // Check for duplicate session letters
      if (data.new_cards && Array.isArray(data.new_cards)) {
        for (const card of data.new_cards) {
          if (existingLetterSet.has(card.session_letter)) {
            throw new Error(`Duplicate session letter "${card.session_letter}" already exists in project`);
          }
        }
      }

      // Insert new cards
      const insertCard = this.db.prepare(`
        INSERT INTO cards (
          subphase_id, session_letter, title, description, success_criteria,
          resource, status, depends_on_cards, is_placeholder, complexity,
          likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
          parent_card_id, is_expanded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (data.new_cards && Array.isArray(data.new_cards)) {
        for (const card of data.new_cards) {
          insertCard.run(
            data.add_to_subphase,
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
          cardsAdded++;
        }
      }

      // Process dependency updates
      if (data.dependency_updates && Array.isArray(data.dependency_updates)) {
        for (const update of data.dependency_updates) {
          // Find the card by session_letter in this project
          const targetCard = this.db.prepare(`
            SELECT c.id, c.session_letter, c.status, c.depends_on_cards
            FROM cards c
            JOIN subphases s ON c.subphase_id = s.id
            JOIN phases p ON s.phase_id = p.id
            WHERE p.project_id = ? AND c.session_letter = ?
          `).get(projectId, update.session_letter);

          if (!targetCard) {
            warnings.push(`Card "${update.session_letter}" not found, skipping dependency update`);
            continue;
          }

          if (targetCard.status !== 'Not Started') {
            warnings.push(`Card "${update.session_letter}" is "${targetCard.status}", skipping dependency update`);
            continue;
          }

          // Append new dependencies to existing ones
          const currentDeps = JSON.parse(targetCard.depends_on_cards);
          const newDeps = update.add_dependencies || [];
          const mergedDeps = [...new Set([...currentDeps, ...newDeps])];

          this.db.prepare(`
            UPDATE cards SET depends_on_cards = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(JSON.stringify(mergedDeps), targetCard.id);

          dependenciesUpdated++;
        }
      }

      return { cardsAdded, dependenciesUpdated, warnings };
    });

    try {
      return transaction(projectId, data);
    } catch (error) {
      throw new Error(`Failed to append cards: ${error.message}`);
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
