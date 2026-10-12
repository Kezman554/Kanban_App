const { initDb } = require('./schema');
const sessionLetters = require('./sessionLetters');

// Placement fields a batch (or a single-destination file's top level) may use
// to say where its cards land.
const APPEND_PLACEMENT_KEYS = ['add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase'];

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
  // SESSION LETTER NORMALISATION
  // ============================================================================

  /**
   * Canonical storage form for a session letter: trimmed and uppercased.
   *
   * Normalising on WRITE (rather than matching case-insensitively on read) is
   * what keeps references resolvable: depends_on_cards and
   * external_dependencies.card_letter are matched with SQL "=", which is
   * case-sensitive in SQLite, so a letter stored lowercase would never resolve
   * against an uppercase reference and its card would look like it had no
   * dependents.
   *
   * Non-strings are passed through untouched so existing validation (which
   * reports a missing or invalid letter) still sees the original value.
   *
   * @param {*} letter - Raw session letter
   * @returns {*} - Trimmed uppercase letter, or the input unchanged if not a string
   */
  normalizeSessionLetter(letter) {
    return typeof letter === 'string' ? letter.trim().toUpperCase() : letter;
  }

  /**
   * Canonical storage form for a depends_on_cards array: every letter
   * normalised, blanks dropped, duplicates collapsed.
   *
   * @param {*} deps - Raw depends_on_cards value from import JSON
   * @returns {Array} - Array of normalised session letters
   */
  normalizeDependsOnCards(deps) {
    if (!Array.isArray(deps)) return [];

    const seen = new Set();
    for (const dep of deps) {
      const letter = this.normalizeSessionLetter(dep);
      if (typeof letter === 'string' && letter !== '') seen.add(letter);
    }

    return [...seen];
  }

  // ============================================================================
  // EXTERNAL (CROSS-PROJECT) DEPENDENCY HELPERS
  // ============================================================================

  /**
   * Validate and normalize an external_dependencies array for storage.
   * Each entry references a card in another project by project slug + session letter.
   * Computed/enriched fields are stripped so only the canonical shape is persisted.
   *
   * @param {*} entries - Raw external_dependencies value from import JSON
   * @param {boolean} validate - When true, throw on malformed entries
   * @returns {Array} - Array of { project_slug, card_letter, description }
   */
  normalizeExternalDependencies(entries, validate = true) {
    if (entries === undefined || entries === null) return [];
    if (!Array.isArray(entries)) {
      if (validate) throw new Error('external_dependencies must be an array');
      return [];
    }

    return entries.map((entry, i) => {
      const slug = entry && entry.project_slug;
      const letter = entry && entry.card_letter;

      if (validate) {
        if (typeof slug !== 'string' || slug.trim() === '') {
          throw new Error(`external_dependencies[${i}].project_slug must be a non-empty string`);
        }
        if (typeof letter !== 'string' || letter.trim() === '') {
          throw new Error(`external_dependencies[${i}].card_letter must be a non-empty string`);
        }
      }

      return {
        project_slug: typeof slug === 'string' ? slug.trim() : slug,
        // Uppercased to match how session_letter is stored, so the "=" lookup
        // in resolveExternalDependencies actually finds the referenced card
        card_letter: this.normalizeSessionLetter(letter),
        description: (entry && entry.description) || '',
      };
    });
  }

  /**
   * Resolve external dependencies against the current database state.
   * An entry is resolved when the referenced card (by project slug + session letter)
   * exists and has status "Done". A missing project or card is treated as unresolved.
   * Does NOT validate at import time — the referenced project may not be imported yet.
   *
   * @param {Array} entries - Stored external_dependencies (project_slug, card_letter, description)
   * @returns {Array} - Entries enriched with { resolved, status, project_name }
   */
  resolveExternalDependencies(entries) {
    if (!Array.isArray(entries)) return [];

    return entries.map(entry => {
      const resolved = {
        project_slug: entry.project_slug,
        card_letter: entry.card_letter,
        description: entry.description || '',
        resolved: false,
        status: null,
        project_name: null,
      };

      if (!entry.project_slug || !entry.card_letter) return resolved;

      const project = this.db.prepare(
        'SELECT id, name FROM projects WHERE slug = ?'
      ).get(entry.project_slug);

      if (!project) return resolved; // project not imported yet -> unresolved
      resolved.project_name = project.name;

      const refCard = this.db.prepare(`
        SELECT c.status
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE p.project_id = ? AND c.session_letter = ?
      `).get(project.id, entry.card_letter);

      if (!refCard) return resolved; // referenced card doesn't exist yet -> unresolved
      resolved.status = refCard.status;
      resolved.resolved = refCard.status === 'Done';
      return resolved;
    });
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
        INSERT INTO projects (name, slug, short_name, description, prd_path, github_repo, directory_path, columns)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const columns = projectData.columns || ['Not Started', 'In Progress', 'Done'];
      const shortName = typeof projectData.short_name === 'string' ? projectData.short_name.trim() : null;
      const result = insertProject.run(
        projectData.name,
        projectData.slug,
        shortName || null,
        projectData.description || null,
        projectData.prd_path || null,
        projectData.github_repo || null,
        projectData.directory_path || null,
        JSON.stringify(columns)
      );

      const projectId = result.lastInsertRowid;

      // The project is new, so nothing can clash with the existing board -
      // but one payload can still carry the same letter twice, which would
      // make every dependency on it ambiguous. Checked up front so the
      // transaction rolls back before any phase is written.
      const seenLetters = new Map();
      for (const phase of projectData.phases || []) {
        for (const subphase of phase.subphases || []) {
          for (const card of subphase.cards || []) {
            if (typeof card.session_letter !== 'string' || card.session_letter.trim() === '') {
              throw new Error(`Card "${card.title || 'untitled'}" is missing a session_letter`);
            }

            const normalized = card.session_letter.trim().toUpperCase();
            if (seenLetters.has(normalized)) {
              throw new Error(
                `Session letter "${card.session_letter}" is used twice in this project ` +
                `("${seenLetters.get(normalized)}" and "${card.title}")`
              );
            }
            seenLetters.set(normalized, card.title);
          }
        }
      }

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
            resource, status, depends_on_cards, external_dependencies, is_placeholder, complexity,
            likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
            parent_card_id, is_expanded
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    this.normalizeSessionLetter(card.session_letter),
                    card.title,
                    card.description || null,
                    card.success_criteria || null,
                    card.resource || 'claude_sub',
                    card.status || 'Not Started',
                    JSON.stringify(this.normalizeDependsOnCards(card.depends_on_cards)),
                    JSON.stringify(this.normalizeExternalDependencies(card.external_dependencies)),
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

      this._advanceSessionLetterHighWater(projectId);
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
        card.external_dependencies = this.resolveExternalDependencies(
          JSON.parse(card.external_dependencies || '[]')
        );
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
      const allowedFields = ['name', 'slug', 'short_name', 'description', 'prd_path', 'github_repo', 'directory_path', 'columns'];
      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = ?`);
          let stored = value;
          if (key === 'columns') {
            stored = JSON.stringify(value);
          } else if (key === 'short_name') {
            const trimmed = typeof value === 'string' ? value.trim() : value;
            stored = trimmed ? trimmed : null;
          }
          values.push(stored);
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

  /**
   * Delete a phase, but only if it contains no cards. Empty phases don't
   * render on the board, so they can strand invisibly (e.g. leftovers from
   * import testing) — this gives the Roadmap view a way to remove them.
   * Subphases are removed by the ON DELETE CASCADE foreign key.
   *
   * @param {number} phaseId - Phase ID
   * @returns {boolean} - Success status
   * @throws {Error} - If the phase doesn't exist or still contains cards
   */
  deletePhase(phaseId) {
    try {
      const phase = this.db.prepare('SELECT id, name FROM phases WHERE id = ?').get(phaseId);
      if (!phase) {
        throw new Error(`Phase ${phaseId} not found`);
      }

      const cardCount = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        WHERE s.phase_id = ?
      `).get(phaseId).count;

      if (cardCount > 0) {
        throw new Error(`Phase "${phase.name}" still contains ${cardCount} card${cardCount > 1 ? 's' : ''} - only empty phases can be deleted`);
      }

      const result = this.db.prepare('DELETE FROM phases WHERE id = ?').run(phaseId);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to delete phase: ${error.message}`);
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
      card.external_dependencies = this.resolveExternalDependencies(
        JSON.parse(card.external_dependencies || '[]')
      );
      card.is_placeholder = Boolean(card.is_placeholder);
      card.likely_needs_expansion = Boolean(card.likely_needs_expansion);
      card.is_expanded = Boolean(card.is_expanded);

      return card;
    } catch (error) {
      throw new Error(`Failed to get card: ${error.message}`);
    }
  }

  /**
   * Find a card in a project whose session letter matches, ignoring case and
   * surrounding whitespace.
   *
   * Letters are PROJECT-scoped, not subphase-scoped: depends_on_cards,
   * dependency_updates and external_dependencies all resolve a card by letter
   * across the whole project, so the same letter twice anywhere on a board
   * makes every one of those references ambiguous.
   *
   * @param {number} projectId - Project ID
   * @param {string} letter - Session letter to look for
   * @param {number|null} excludeCardId - Card ID to ignore (when re-checking an existing card)
   * @returns {Object|null} - { id, session_letter, title } of the clashing card, or null
   */
  findCardBySessionLetter(projectId, letter, excludeCardId = null) {
    if (typeof letter !== 'string' || letter.trim() === '') return null;

    return this.db.prepare(`
      SELECT c.id, c.session_letter, c.title
      FROM cards c
      JOIN subphases s ON c.subphase_id = s.id
      JOIN phases p ON s.phase_id = p.id
      WHERE p.project_id = ?
        AND UPPER(TRIM(c.session_letter)) = ?
        AND (? IS NULL OR c.id != ?)
    `).get(projectId, letter.trim().toUpperCase(), excludeCardId, excludeCardId) || null;
  }

  /**
   * Throw if a session letter is empty or already taken elsewhere in the project.
   * The backstop behind AddCardDialog's client-side check, covering the paths
   * that never touch the dialog: project import, append import, and the Pi's
   * HTTP API.
   *
   * @param {number} projectId - Project ID
   * @param {string} letter - Session letter to validate
   * @param {number|null} excludeCardId - Card ID to ignore
   */
  assertSessionLetterAvailable(projectId, letter, excludeCardId = null) {
    if (typeof letter !== 'string' || letter.trim() === '') {
      throw new Error('Card is missing a session_letter');
    }

    const clash = this.findCardBySessionLetter(projectId, letter, excludeCardId);
    if (clash) {
      throw new Error(
        `Session letter "${clash.session_letter}" is already used by card "${clash.title}"`
      );
    }
  }

  /**
   * The project a subphase belongs to.
   * @param {number} subphaseId - Subphase ID
   * @returns {number|null} - Project ID, or null if the subphase doesn't exist
   */
  getProjectIdForSubphase(subphaseId) {
    const row = this.db.prepare(`
      SELECT p.project_id AS projectId
      FROM subphases s
      JOIN phases p ON s.phase_id = p.id
      WHERE s.id = ?
    `).get(subphaseId);

    return row ? row.projectId : null;
  }

  /**
   * Create a new card in a subphase
   * @param {number} subphaseId - Subphase ID
   * @param {Object} cardData - Card data
   * @returns {number} - The new card ID
   */
  createCard(subphaseId, cardData) {
    try {
      const projectId = this.getProjectIdForSubphase(subphaseId);
      if (projectId === null) {
        throw new Error(`Subphase ${subphaseId} not found`);
      }

      // Backstop behind the dialog's own check - also covers the Pi's HTTP API
      this.assertSessionLetterAvailable(projectId, cardData.session_letter);
      this.assertSessionLetterNotRetired(projectId, cardData.session_letter);

      const sql = `
        INSERT INTO cards (
          subphase_id, session_letter, title, description, success_criteria,
          resource, status, depends_on_cards, external_dependencies, is_placeholder, complexity,
          likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
          notes, parent_card_id, is_expanded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = this.db.prepare(sql).run(
        subphaseId,
        this.normalizeSessionLetter(cardData.session_letter),
        cardData.title,
        cardData.description || null,
        cardData.success_criteria || null,
        cardData.resource || 'claude_sub',
        'Not Started',
        JSON.stringify(this.normalizeDependsOnCards(cardData.depends_on_cards)),
        JSON.stringify(this.normalizeExternalDependencies(cardData.external_dependencies)),
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

      this._advanceSessionLetterHighWater(projectId);
      return result.lastInsertRowid;
    } catch (error) {
      throw new Error(`Failed to create card: ${error.message}`);
    }
  }

  /**
   * Create a card at a placement that may not exist yet - the Add Card
   * dialog's create path. The placement is one of resolveAppendTarget's
   * three legal combinations (add_to_phase + add_to_subphase, add_to_phase +
   * new_subphase, new_phase + new_subphase), resolved by that same code so
   * the dialog and the append importer share one set of rules and one
   * display_order computation. The card is then inserted by createCard, with
   * all its letter checks.
   *
   * One transaction: a card refused on its letter (duplicate or retired)
   * leaves no new phase or subphase behind.
   *
   * @param {number} projectId - Project ID
   * @param {Object} placement - Placement fields, as in an append batch
   * @param {Object} cardData - Card data, as for createCard
   * @returns {Object} - { cardId, subphaseId, createdPhase, createdSubphase }
   */
  createCardAt(projectId, placement, cardData) {
    const transaction = this.db.transaction(() => {
      const p = placement || {};
      for (const [key, what] of [['new_phase', 'New phase'], ['new_subphase', 'New subphase']]) {
        if (p[key] && (typeof p[key].name !== 'string' || p[key].name.trim() === '')) {
          throw new Error(`${what} name is required`);
        }
      }

      const { targetSubphaseId, createdPhase, createdSubphase } =
        this.resolveAppendTarget(projectId, p, '');
      const cardId = this.createCard(targetSubphaseId, cardData);
      return { cardId, subphaseId: targetSubphaseId, createdPhase, createdSubphase };
    });

    try {
      return transaction();
    } catch (error) {
      throw new Error(error.message.startsWith('Failed to create card') ? error.message : `Failed to create card: ${error.message}`);
    }
  }

  /**
   * Get the next available session letter for a subphase
   * @param {number} projectId - Project ID
   * @param {number|null} subphaseId - Subphase ID, or null for a subphase
   *   still to be created (treated as empty)
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

      const highWater = this.getSessionLetterHighWater(projectId);
      if (allProjectLetters.length === 0 && highWater === null) {
        return 'A';
      }

      // Extract all base letters used in the project
      const usedBaseLetters = new Set(
        allProjectLetters.map(letter => this._getBaseLetter(letter))
      );

      // Find next available base letter AFTER the high-water mark, so a
      // deleted card's letter (or any older gap) is never handed out again
      return this._getNextUnusedBaseLetter(usedBaseLetters, highWater);
    } catch (error) {
      throw new Error(`Failed to get next session letter: ${error.message}`);
    }
  }

  /**
   * The highest session letter in a project - the value getNextSessionLetter
   * continues from.
   *
   * Ordered exactly as getNextSessionLetter orders: shorter base first
   * (A < AA), then alphabetically, then by numeric suffix (C < C2 < C3). This
   * is the same value the app's "Export for Claude" text shows as
   * "Last session letter".
   *
   * Never lower than the project's persisted high-water mark, so deleting
   * the highest card does not walk the sequence backwards - and an append
   * file written from this value (exportForVault's last_session_letter)
   * continues past retired letters too.
   *
   * @param {number} projectId - Project ID
   * @returns {string|null} - The highest session letter, or null if the project has never had cards
   */
  getLastSessionLetter(projectId) {
    const letters = this._getProjectSessionLetters(projectId);
    const persisted = this._getPersistedHighWater(projectId);
    if (persisted !== null) letters.push(persisted);

    if (letters.length === 0) return null;

    const sorted = letters.slice().sort((a, b) => this._compareSessionLetters(a, b));
    return sorted[sorted.length - 1];
  }

  /**
   * The highest base letter ever allocated in the project (C, AK - never C2):
   * max(persisted high-water mark, highest base letter on the board).
   * Reading through the board means a NULL, stale or corrupted counter
   * degrades to today's derived value and can never sit below a live card.
   *
   * @param {number} projectId - Project ID
   * @returns {string|null} - A base letter, or null if the project has never had cards
   */
  getSessionLetterHighWater(projectId) {
    const last = this.getLastSessionLetter(projectId);
    return last === null ? null : this._getBaseLetter(last);
  }

  /**
   * Throw if a letter's base belongs to a deleted card: at or below the
   * project's high-water mark and held by no card in the project. Only base
   * letters are retired - a suffix (C3) may come back while any C card
   * remains.
   *
   * @param {number} projectId - Project ID
   * @param {string} letter - Session letter to validate
   * @param {string} prefix - Prepended to the message (the append import's batch/card label)
   */
  assertSessionLetterNotRetired(projectId, letter, prefix = '') {
    const normalized = this.normalizeSessionLetter(letter);
    if (typeof normalized !== 'string' || normalized === '') return;

    const base = this._getBaseLetter(normalized);
    const highWater = this.getSessionLetterHighWater(projectId);
    if (highWater === null || this._compareSessionLetters(base, highWater) > 0) return;

    const inUse = this._getProjectSessionLetters(projectId)
      .some(l => this._getBaseLetter(this.normalizeSessionLetter(l)) === base);
    if (inUse) return;

    throw new Error(
      `${prefix}session letter "${normalized}" is retired: ${base} belonged to a deleted card ` +
      `and letters are never reissued (this project's high-water mark is ${highWater})`
    );
  }

  /**
   * The persisted high-water mark, or null if unset or not a plain base letter.
   * @private
   */
  _getPersistedHighWater(projectId) {
    const row = this.db.prepare(
      'SELECT session_letter_high_water AS mark FROM projects WHERE id = ?'
    ).get(projectId);
    const mark = row && typeof row.mark === 'string' ? row.mark.trim().toUpperCase() : '';
    return /^[A-Z]+$/.test(mark) ? mark : null;
  }

  /**
   * Raise the persisted high-water mark to cover every card now on the
   * board. Called after every card insert. Never lowers it, and deleteCard
   * never calls it.
   * @private
   */
  _advanceSessionLetterHighWater(projectId) {
    const mark = this.getSessionLetterHighWater(projectId);
    if (mark === null || !/^[A-Z]+$/.test(mark)) return;
    if (mark === this._getPersistedHighWater(projectId)) return;
    this.db.prepare(
      'UPDATE projects SET session_letter_high_water = ? WHERE id = ?'
    ).run(mark, projectId);
  }

  /**
   * Every session letter on the project's board, as stored.
   * @private
   */
  _getProjectSessionLetters(projectId) {
    return this.db.prepare(`
      SELECT c.session_letter
      FROM cards c
      JOIN subphases s ON c.subphase_id = s.id
      JOIN phases p ON s.phase_id = p.id
      WHERE p.project_id = ?
    `).all(projectId).map(row => row.session_letter).filter(Boolean);
  }

  /**
   * Session letter order: shorter base first (A < AA), then alphabetically,
   * then by numeric suffix (C < C2 < C3).
   * @private
   */
  _compareSessionLetters(a, b) {
    return sessionLetters.compareSessionLetters(a, b);
  }

  /**
   * Extract base letter from a session letter (C2 → C, AA3 → AA, M → M)
   * @private
   */
  _getBaseLetter(letter) {
    return sessionLetters.getBaseLetter(letter);
  }

  /**
   * Extract numeric suffix from session letter (C2 → 2, C → 1, AA3 → 3)
   * @private
   */
  _getSuffix(letter) {
    return sessionLetters.getSuffix(letter);
  }

  /**
   * Find next unused base letter (A, B, C, ... Z, AA, AB, etc.) after
   * startAfter. A startAfter outside A-ZZ searches from A, as before the
   * high-water mark existed.
   * @private
   */
  _getNextUnusedBaseLetter(usedBaseLetters, startAfter = null) {
    let skipping = typeof startAfter === 'string' && /^[A-Z]{1,2}$/.test(startAfter);

    // Try single letters first (A-Z)
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i); // A=65
      if (skipping) {
        if (letter === startAfter) skipping = false;
        continue;
      }
      if (!usedBaseLetters.has(letter)) {
        return letter;
      }
    }

    // Try double letters (AA-ZZ)
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const letter = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
        if (skipping) {
          if (letter === startAfter) skipping = false;
          continue;
        }
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
   * Replace a card's cross-project dependencies.
   *
   * Entries are validated and normalised by normalizeExternalDependencies -
   * the same path the importers use - so a malformed entry throws instead of
   * being stored, and card_letter lands uppercased to match how session
   * letters are stored.
   *
   * Deliberately does NOT check that the referenced project or card exists:
   * an unresolved link is legal by design (see resolveExternalDependencies -
   * the target may not be imported yet). The card detail UI restricts the
   * picker to real projects so a typo cannot reach here in normal use.
   *
   * @param {number} id - Card ID
   * @param {Array} entries - [{ project_slug, card_letter, description }]
   * @returns {boolean} - Success status
   */
  updateCardExternalDependencies(id, entries) {
    try {
      const normalized = this.normalizeExternalDependencies(entries);
      const sql = `UPDATE cards SET external_dependencies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = this.db.prepare(sql).run(JSON.stringify(normalized), id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update card external dependencies: ${error.message}`);
    }
  }

  /**
   * Replace a card's same-board dependencies (depends_on_cards).
   *
   * Letters are normalised by normalizeDependsOnCards - the same path the
   * importers use - so they land trimmed, uppercased and de-duplicated.
   *
   * Unlike updateCardExternalDependencies this DOES check the references:
   * getBlockedReason treats a letter absent from the project as incomplete,
   * so a typo would block the card forever. A newly added letter must name
   * another card in this project, must not be the card itself, and must not
   * close a cycle. Letters the card already had are exempt from the
   * existence and cycle checks, so a dangling or cyclic entry left by an old
   * import can still be kept while a different entry is removed.
   *
   * Removal is a single write of the remaining letters - clearCardDependencies
   * stays the separate wipe-everything escape hatch.
   *
   * @param {number} id - Card ID
   * @param {Array} letters - Session letters this card should depend on
   * @returns {boolean} - Success status
   */
  updateCardDependsOnCards(id, letters) {
    try {
      if (!Array.isArray(letters)) {
        throw new Error('depends_on_cards must be an array of session letters');
      }

      const card = this.db.prepare(`
        SELECT c.id, c.session_letter, c.depends_on_cards, p.project_id
        FROM cards c
        JOIN subphases s ON c.subphase_id = s.id
        JOIN phases p ON s.phase_id = p.id
        WHERE c.id = ?
      `).get(id);
      if (!card) throw new Error(`Card ${id} not found`);

      const ownLetter = this.normalizeSessionLetter(card.session_letter);
      const current = new Set(this.normalizeDependsOnCards(JSON.parse(card.depends_on_cards || '[]')));
      const normalized = this.normalizeDependsOnCards(letters);
      const graph = this.getProjectDependencyGraph(card.project_id);

      for (const letter of normalized) {
        if (letter === ownLetter) {
          throw new Error(`Card ${ownLetter} cannot depend on itself`);
        }
        if (current.has(letter)) continue;
        if (!graph.has(letter)) {
          throw new Error(`There is no card ${letter} in this project`);
        }
        this.assertNoDependencyCycle(graph, ownLetter, letter);
      }

      const sql = `UPDATE cards SET depends_on_cards = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const result = this.db.prepare(sql).run(JSON.stringify(normalized), id);
      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update card dependencies: ${error.message}`);
    }
  }

  /**
   * Same-board dependency graph for one project, keyed by normalised letter.
   * Letters are resolved project-scoped, as getBlockedReason does.
   *
   * @param {number} projectId - Project ID
   * @returns {Map<string, {id, title, status, deps: string[]}>}
   */
  getProjectDependencyGraph(projectId) {
    const rows = this.db.prepare(`
      SELECT c.id, c.session_letter, c.title, c.status, c.depends_on_cards
      FROM cards c
      JOIN subphases s ON c.subphase_id = s.id
      JOIN phases p ON s.phase_id = p.id
      WHERE p.project_id = ?
    `).all(projectId);

    const graph = new Map();
    for (const row of rows) {
      graph.set(this.normalizeSessionLetter(row.session_letter), {
        id: row.id,
        title: row.title,
        status: row.status,
        deps: this.normalizeDependsOnCards(JSON.parse(row.depends_on_cards || '[]')),
      });
    }
    return graph;
  }

  /**
   * Throw if making `fromLetter` depend on `toLetter` would close a cycle,
   * i.e. `toLetter` already reaches `fromLetter` through existing
   * dependencies. The message names the full loop, e.g. "A -> B -> C -> A".
   *
   * @param {Map} graph - From getProjectDependencyGraph
   * @param {string} fromLetter - The card gaining the dependency
   * @param {string} toLetter - The card it would depend on
   */
  assertNoDependencyCycle(graph, fromLetter, toLetter) {
    if (fromLetter === toLetter) {
      throw new Error(`Card ${fromLetter} cannot depend on itself`);
    }

    const loop = this.findDependencyLoop(graph, fromLetter, toLetter);
    if (loop) {
      throw new Error(
        `Card ${fromLetter} cannot depend on ${toLetter}: that would create a ` +
        `dependency loop ${loop.join(' -> ')}`
      );
    }
  }

  /**
   * The one cycle walk, shared by the card editor and the append importer.
   * Returns the loop that the edge fromLetter -> toLetter closes, as a letter
   * path starting and ending at fromLetter (["C", "D", "C"]), or null.
   *
   * @param {Map} graph - letter -> { deps: string[] }
   * @param {string} fromLetter - The card gaining the dependency
   * @param {string} toLetter - The card it would depend on
   * @returns {string[]|null}
   */
  findDependencyLoop(graph, fromLetter, toLetter) {
    // Depth-first search from toLetter looking for fromLetter
    const visited = new Set();
    const walk = (letter, path) => {
      if (letter === fromLetter) return path;
      if (visited.has(letter)) return null;
      visited.add(letter);
      const node = graph.get(letter);
      if (!node) return null;
      for (const dep of node.deps) {
        const found = walk(dep, [...path, dep]);
        if (found) return found;
      }
      return null;
    };

    const loop = walk(toLetter, [toLetter]);
    return loop ? [fromLetter, ...loop] : null;
  }

  /**
   * Check an append file's same-board dependencies against the board as it
   * WOULD be after the import - existing cards, plus every new card in every
   * batch, plus every dependency_updates edge - before anything is written.
   * Validating during the write would report against a half-changed board,
   * and a loop can need all three sources at once (new C -> existing D, plus
   * a dependency_updates entry making D depend on C).
   *
   * Throws on: a new card depending on itself, a new card naming a letter
   * that is neither on the board nor in the file (getBlockedReason would
   * block it forever on a card that does not exist), a dependency_updates
   * self-reference, and any new edge that closes a loop. Existing board edges
   * are not re-checked.
   *
   * @param {number} projectId - Project ID
   * @param {Array} batches - From normaliseAppendBatches
   * @param {boolean} batched - Whether the file used `batches` (for message prefixes)
   * @param {Array} dependencyUpdates - data.dependency_updates
   */
  assertAppendDependenciesSound(projectId, batches, batched, dependencyUpdates) {
    const graph = this.getProjectDependencyGraph(projectId);
    for (const node of graph.values()) node.origin = 'on the board';

    const newEdges = [];
    batches.forEach((batch, index) => {
      if (!batch || !Array.isArray(batch.new_cards)) return;
      const label = batched ? `Batch ${index + 1}, ` : '';
      for (const card of batch.new_cards) {
        const letter = this.normalizeSessionLetter(card.session_letter);
        const deps = this.normalizeDependsOnCards(card.depends_on_cards);
        graph.set(letter, {
          title: card.title,
          status: card.status || 'Not Started',
          deps,
          origin: batched ? `new, batch ${index + 1}` : 'new in this file',
        });
        for (const dep of deps) newEdges.push({ from: letter, to: dep, where: `${label}card "${letter}"` });
      }
    });

    // Bad references first: a loop through a card that does not exist is
    // not the problem worth reporting
    for (const edge of newEdges) {
      if (edge.from === edge.to) {
        throw new Error(`${edge.where}: depends on itself`);
      }
      if (!graph.has(edge.to)) {
        throw new Error(
          `${edge.where}: depends on ${edge.to}, which is neither on the board nor in this file`
        );
      }
    }

    // A target that exists nowhere is a typo and refuses the import, matching
    // the dialog. A target that exists but is not Not Started (Done, In
    // Progress, or any custom column) is skipped by the write phase with a
    // warning - a legitimate no-op - so it adds no edge here, and the
    // letters it names are never stored, so they are not checked either.
    const updateEdges = new Set();
    for (const update of Array.isArray(dependencyUpdates) ? dependencyUpdates : []) {
      const target = this.normalizeSessionLetter(update.card || update.session_letter);
      const node = graph.get(target);
      if (!node) {
        throw new Error(
          `dependency_updates, card "${target}": target card ${target} is neither on the board nor in this file`
        );
      }
      if (node.status !== 'Not Started') continue;
      const adds = this.normalizeDependsOnCards(
        [].concat(update.add_dependencies || update.add_dependency || [])
      );
      for (const dep of adds) {
        if (node.deps.includes(dep)) continue;
        if (dep === target) {
          throw new Error(`dependency_updates, card "${target}": cannot depend on itself`);
        }
        if (!graph.has(dep)) {
          throw new Error(
            `dependency_updates, card "${target}": depends on ${dep}, which is neither on the board nor in this file`
          );
        }
        node.deps.push(dep);
        updateEdges.add(`${target}>${dep}`);
        newEdges.push({ from: target, to: dep, where: `dependency_updates, card "${target}"` });
      }
    }

    for (const edge of newEdges) {
      const loop = this.findDependencyLoop(graph, edge.from, edge.to);
      if (!loop) continue;

      const cards = [...new Set(loop)].map(l => {
        const node = graph.get(l);
        return `${l} "${node.title}" (${node.origin})`;
      });
      const fromUpdates = [];
      for (let i = 0; i < loop.length - 1; i++) {
        if (updateEdges.has(`${loop[i]}>${loop[i + 1]}`)) fromUpdates.push(`${loop[i]} -> ${loop[i + 1]}`);
      }
      throw new Error(
        `${edge.where}: depending on ${edge.to} would create a dependency loop ` +
        `${loop.join(' -> ')}. Cards: ${cards.join('; ')}` +
        (fromUpdates.length ? `. Added by dependency_updates: ${fromUpdates.join(', ')}` : '')
      );
    }
  }

  /**
   * Update card core details (title, description, success criteria)
   * @param {number} id - Card ID
   * @param {Object} details - Object with title, description, success_criteria
   * @returns {boolean} - Success status
   */
  updateCardDetails(id, details) {
    try {
      const updates = [];
      const values = [];

      if (details.title !== undefined) {
        const title = String(details.title).trim();
        if (!title) {
          throw new Error('Title cannot be empty');
        }
        updates.push('title = ?');
        values.push(title);
      }
      if (details.description !== undefined) {
        updates.push('description = ?');
        values.push(details.description);
      }
      if (details.success_criteria !== undefined) {
        updates.push('success_criteria = ?');
        values.push(details.success_criteria);
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
      throw new Error(`Failed to update card details: ${error.message}`);
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
   * Delete a card and clean up dependency references in other cards
   * @param {number} cardId - Card ID to delete
   * @returns {{ deletedLetter: string }}
   */
  deleteCard(cardId) {
    const transaction = this.db.transaction((id) => {
      const card = this.db.prepare('SELECT id, session_letter FROM cards WHERE id = ?').get(id);
      if (!card) throw new Error(`Card ${id} not found`);

      // Find all cards whose depends_on_cards contains this letter (broad LIKE search)
      const dependentCards = this.db.prepare(
        `SELECT id, depends_on_cards FROM cards WHERE depends_on_cards LIKE ?`
      ).all(`%${card.session_letter}%`);

      // Remove the letter from each dependent card's array
      for (const dep of dependentCards) {
        const deps = JSON.parse(dep.depends_on_cards);
        const updated = deps.filter(d => d !== card.session_letter);
        if (updated.length !== deps.length) {
          this.db.prepare(
            'UPDATE cards SET depends_on_cards = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(JSON.stringify(updated), dep.id);
        }
      }

      this.db.prepare('DELETE FROM cards WHERE id = ?').run(id);
      return { deletedLetter: card.session_letter };
    });

    return transaction(cardId);
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
      const reasons = [];

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
          reasons.push(`Waiting on card${incompleteCards.length > 1 ? 's' : ''}: ${incompleteCards.join(', ')}`);
        }
      }

      // Check cross-project (external) dependencies
      const externalDeps = this.resolveExternalDependencies(
        JSON.parse(card.external_dependencies || '[]')
      );
      const unresolvedExternal = externalDeps.filter(dep => !dep.resolved);
      if (unresolvedExternal.length > 0) {
        const labels = unresolvedExternal.map(dep => `${dep.project_slug}/${dep.card_letter}`);
        reasons.push(`Waiting on external: ${labels.join(', ')}`);
      }

      return reasons.length > 0 ? reasons.join('; ') : null;
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
   * Normalise an append payload into a list of batches.
   *
   * A file either uses the single-destination form (placement fields at the
   * top level) or the multi-destination form (a `batches` array, each entry
   * carrying its own placement plus new_cards). The single-destination form is
   * normalised into a one-entry batches array so there is exactly one code
   * path; mixing the two forms is an error rather than a silent preference.
   *
   * @param {Object} data - The append JSON payload
   * @returns {Array<Object>} - Batches, each { placement fields..., new_cards }
   */
  normaliseAppendBatches(data) {
    if (!data || typeof data !== 'object') return [{}];

    const hasBatches = data.batches !== undefined && data.batches !== null;
    if (!hasBatches) {
      const { batches, dependency_updates, ...batch } = data;
      return [batch];
    }

    const conflicting = APPEND_PLACEMENT_KEYS.concat('new_cards')
      .filter(key => data[key] !== undefined && data[key] !== null);
    if (conflicting.length > 0) {
      throw new Error(
        `Provide either "batches" or top-level placement fields, not both ` +
        `(found alongside "batches": ${conflicting.join(', ')})`
      );
    }
    if (!Array.isArray(data.batches) || data.batches.length === 0) {
      throw new Error('"batches" must be a non-empty array');
    }
    for (const batch of data.batches) {
      if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
        throw new Error('Every entry in "batches" must be an object');
      }
    }

    return data.batches;
  }

  /**
   * Scan an append-import payload for keys the importer does not understand.
   * Unknown keys are never an error (forward compatibility) but must be
   * reported so generated fields are not silently discarded.
   *
   * @param {Object} data - The append JSON payload
   * @returns {Array<string>} - Human-readable warnings, one per unknown key
   */
  findUnrecognisedImportKeys(data) {
    const KNOWN_TOP_LEVEL_KEYS = new Set([
      'add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase',
      'new_cards', 'dependency_updates', 'batches',
    ]);
    const KNOWN_BATCH_KEYS = new Set([
      'add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase',
      'new_cards',
    ]);
    const KNOWN_CARD_KEYS = new Set([
      'session_letter', 'title', 'description', 'success_criteria',
      'resource', 'status', 'depends_on_cards', 'external_dependencies',
      'is_placeholder', 'complexity', 'likely_needs_expansion',
      'prompt_guide', 'checkpoint', 'git_commit_message', 'notes',
      'parent_card_id', 'is_expanded',
    ]);

    const warnings = [];
    if (!data || typeof data !== 'object') return warnings;

    for (const key of Object.keys(data)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        warnings.push(`Unrecognised field "${key}" was ignored`);
      }
    }

    // Multi-destination files get their warnings prefixed with the batch they
    // came from; single-destination files keep the unprefixed wording.
    const batched = Array.isArray(data.batches);
    const batches = batched ? data.batches : [data];

    batches.forEach((batch, index) => {
      if (!batch || typeof batch !== 'object') return;
      const prefix = batched ? `Batch ${index + 1}` : null;

      if (batched) {
        for (const key of Object.keys(batch)) {
          if (!KNOWN_BATCH_KEYS.has(key)) {
            warnings.push(`${prefix}: unrecognised field "${key}" was ignored`);
          }
        }
      }

      if (!Array.isArray(batch.new_cards)) return;
      for (const card of batch.new_cards) {
        if (!card || typeof card !== 'object') continue;
        for (const key of Object.keys(card)) {
          if (!KNOWN_CARD_KEYS.has(key)) {
            const letter = card.session_letter || '?';
            warnings.push(
              prefix
                ? `${prefix}, card "${letter}": unrecognised field "${key}" was ignored`
                : `Card "${letter}": unrecognised field "${key}" was ignored`
            );
          }
        }
      }
    });

    return warnings;
  }

  /**
   * Resolve one batch's placement to the subphase its cards belong in,
   * creating a phase and/or subphase when the batch asks for one.
   *
   * @param {number} projectId - Project ID being appended to
   * @param {Object} batch - A single batch (placement fields + new_cards)
   * @param {string} label - Message prefix naming the batch ('' when unbatched)
   * @returns {Object} - { targetSubphaseId, createdPhase, createdSubphase }
   */
  resolveAppendTarget(projectId, batch, label) {
    const hasNewPhase = batch.new_phase && typeof batch.new_phase === 'object';
    const hasNewSubphase = batch.new_subphase && typeof batch.new_subphase === 'object';
    const hasAddToPhase = batch.add_to_phase !== undefined && batch.add_to_phase !== null;
    const hasAddToSubphase = batch.add_to_subphase !== undefined && batch.add_to_subphase !== null;

    // Validate the combination of targeting fields
    if (hasNewPhase && hasAddToPhase) {
      throw new Error(`${label}Provide either add_to_phase (existing) or new_phase (new), not both`);
    }
    if (hasNewPhase && !hasNewSubphase) {
      throw new Error(`${label}new_phase requires new_subphase (a phase cannot be created without a subphase)`);
    }
    if (hasNewSubphase && !hasNewPhase && !hasAddToPhase) {
      throw new Error(`${label}new_subphase without new_phase requires a valid add_to_phase ID`);
    }
    if (!hasNewPhase && !hasNewSubphase && (!hasAddToPhase || !hasAddToSubphase)) {
      throw new Error(`${label}Must provide add_to_phase + add_to_subphase, new_phase + new_subphase, or add_to_phase + new_subphase`);
    }

    if (hasNewPhase) {
      // Create a brand new phase (with the next available display_order) and a subphase under it
      const phaseOrderRow = this.db.prepare(`
        SELECT MAX(display_order) AS maxOrder FROM phases WHERE project_id = ?
      `).get(projectId);
      const nextPhaseOrder = phaseOrderRow.maxOrder !== null ? phaseOrderRow.maxOrder + 1 : 0;

      const phaseResult = this.db.prepare(`
        INSERT INTO phases (project_id, name, short_name, description, display_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        projectId,
        batch.new_phase.name,
        batch.new_phase.short_name || null,
        batch.new_phase.description || null,
        nextPhaseOrder
      );
      const newPhaseId = phaseResult.lastInsertRowid;

      const subphaseResult = this.db.prepare(`
        INSERT INTO subphases (phase_id, name, short_name, description, display_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        newPhaseId,
        batch.new_subphase.name,
        batch.new_subphase.short_name || null,
        batch.new_subphase.description || null,
        1
      );

      return {
        targetSubphaseId: subphaseResult.lastInsertRowid,
        createdPhase: { id: newPhaseId, name: batch.new_phase.name },
        createdSubphase: { id: subphaseResult.lastInsertRowid, name: batch.new_subphase.name },
      };
    }

    if (hasNewSubphase) {
      // Add a new subphase to an existing phase (with the next available display_order in that phase)
      const phase = this.db.prepare(`
        SELECT id FROM phases WHERE id = ? AND project_id = ?
      `).get(batch.add_to_phase, projectId);

      if (!phase) {
        throw new Error(`${label}Phase ${batch.add_to_phase} not found in project ${projectId}`);
      }

      const subOrderRow = this.db.prepare(`
        SELECT MAX(display_order) AS maxOrder FROM subphases WHERE phase_id = ?
      `).get(batch.add_to_phase);
      const nextSubOrder = subOrderRow.maxOrder !== null ? subOrderRow.maxOrder + 1 : 0;

      const subphaseResult = this.db.prepare(`
        INSERT INTO subphases (phase_id, name, short_name, description, display_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        batch.add_to_phase,
        batch.new_subphase.name,
        batch.new_subphase.short_name || null,
        batch.new_subphase.description || null,
        nextSubOrder
      );

      return {
        targetSubphaseId: subphaseResult.lastInsertRowid,
        createdPhase: null,
        createdSubphase: { id: subphaseResult.lastInsertRowid, name: batch.new_subphase.name },
      };
    }

    // Existing phase + existing subphase (original behavior)
    const phase = this.db.prepare(`
      SELECT id FROM phases WHERE id = ? AND project_id = ?
    `).get(batch.add_to_phase, projectId);

    if (!phase) {
      throw new Error(`${label}Phase ${batch.add_to_phase} not found in project ${projectId}`);
    }

    const subphase = this.db.prepare(`
      SELECT id FROM subphases WHERE id = ? AND phase_id = ?
    `).get(batch.add_to_subphase, batch.add_to_phase);

    if (!subphase) {
      throw new Error(`${label}Subphase ${batch.add_to_subphase} not found in phase ${batch.add_to_phase}`);
    }

    return { targetSubphaseId: batch.add_to_subphase, createdPhase: null, createdSubphase: null };
  }

  /**
   * Append new cards to an existing project from JSON data
   *
   * A file either targets one destination (placement fields at the top level)
   * or several (a `batches` array, each entry with its own placement and its
   * own new_cards). Either way a placement names its target subphase in one of
   * three ways:
   *   1. Existing phase + existing subphase: add_to_phase (int) + add_to_subphase (int)
   *   2. New phase + new subphase: new_phase (object) + new_subphase (object)
   *   3. Existing phase + new subphase: add_to_phase (int) + new_subphase (object)
   *
   * Session letters must be unique across the whole file, and
   * dependency_updates stays top-level, applied once every batch is inserted,
   * so an update may reference a letter added by any batch.
   *
   * @param {number} projectId - Project ID to append to
   * @param {Object} data - { add_to_phase, add_to_subphase, new_phase, new_subphase, new_cards, batches, dependency_updates }
   * @returns {Object} - { cardsAdded, dependenciesUpdated, warnings, createdPhase, createdSubphase, createdPhases, createdSubphases }
   */
  appendCards(projectId, data) {
    const transaction = this.db.transaction((projectId, data) => {
      const warnings = [];
      let cardsAdded = 0;
      let dependenciesUpdated = 0;

      // Report unrecognised keys instead of silently discarding them
      warnings.push(...this.findUnrecognisedImportKeys(data));

      const batches = this.normaliseAppendBatches(data);
      const batched = Array.isArray(data && data.batches);
      const createdPhases = [];
      const createdSubphases = [];

      // Letters must be unique across the whole file, and this runs before any
      // card is inserted: once batch 1's cards are on the board, a repeat in
      // batch 3 would be caught as a board clash and the error would name only
      // one of the two cards.
      const fileLetters = new Map();
      for (const batch of batches) {
        if (!batch || !Array.isArray(batch.new_cards)) continue;
        for (const card of batch.new_cards) {
          // Checked against the DB rather than a pre-read set so the letters an
          // append generator picked from a stale export can't slip through.
          this.assertSessionLetterAvailable(projectId, card.session_letter);

          const normalized = card.session_letter.trim().toUpperCase();
          if (fileLetters.has(normalized)) {
            throw new Error(
              `Session letter "${card.session_letter}" is used twice in this import ` +
              `("${fileLetters.get(normalized)}" and "${card.title}")`
            );
          }
          fileLetters.set(normalized, card.title);
        }
      }

      // Retired letters, judged against the board before this file: a letter
      // at or below the project's high-water mark that no card holds belonged
      // to a deleted card, and reissuing it would re-point every note, commit
      // and progress entry that names it at a different card
      batches.forEach((batch, index) => {
        if (!batch || !Array.isArray(batch.new_cards)) return;
        const label = batched ? `Batch ${index + 1}, ` : '';
        for (const card of batch.new_cards) {
          this.assertSessionLetterNotRetired(projectId, card.session_letter, `${label}card "${card.title}": `);
        }
      });

      // Same whole-file scope, and also before any insert: dependencies are
      // checked against the board as it will be once everything lands
      this.assertAppendDependenciesSound(projectId, batches, batched, data.dependency_updates);

      const insertCard = this.db.prepare(`
        INSERT INTO cards (
          subphase_id, session_letter, title, description, success_criteria,
          resource, status, depends_on_cards, external_dependencies, is_placeholder, complexity,
          likely_needs_expansion, prompt_guide, checkpoint, git_commit_message,
          notes, parent_card_id, is_expanded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      batches.forEach((batch, index) => {
        const label = batched ? `Batch ${index + 1}: ` : '';

        const { targetSubphaseId, createdPhase, createdSubphase } =
          this.resolveAppendTarget(projectId, batch, label);
        if (createdPhase) createdPhases.push(createdPhase);
        if (createdSubphase) createdSubphases.push(createdSubphase);

        if (!batch.new_cards || !Array.isArray(batch.new_cards)) return;

        // Insert new cards (letters were validated across the whole file above)
        for (const card of batch.new_cards) {
          insertCard.run(
            targetSubphaseId,
            this.normalizeSessionLetter(card.session_letter),
            card.title,
            card.description || null,
            card.success_criteria || null,
            card.resource || 'claude_sub',
            card.status || 'Not Started',
            JSON.stringify(this.normalizeDependsOnCards(card.depends_on_cards)),
            JSON.stringify(this.normalizeExternalDependencies(card.external_dependencies)),
            card.is_placeholder ? 1 : 0,
            card.complexity || 'medium',
            card.likely_needs_expansion ? 1 : 0,
            card.prompt_guide || null,
            card.checkpoint || null,
            card.git_commit_message || null,
            card.notes || null,
            card.parent_card_id || null,
            card.is_expanded ? 1 : 0
          );
          cardsAdded++;
        }
      });

      this._advanceSessionLetterHighWater(projectId);

      // Process dependency updates once every batch has landed, so an update
      // may reference a letter added by any batch
      if (data.dependency_updates && Array.isArray(data.dependency_updates)) {
        for (const update of data.dependency_updates) {
          // Find the card by session_letter in this project. Normalised so a
          // lowercase reference in the import still finds the stored card.
          const targetLetter = this.normalizeSessionLetter(update.card || update.session_letter);
          const targetCard = this.db.prepare(`
            SELECT c.id, c.session_letter, c.status, c.depends_on_cards
            FROM cards c
            JOIN subphases s ON c.subphase_id = s.id
            JOIN phases p ON s.phase_id = p.id
            WHERE p.project_id = ? AND c.session_letter = ?
          `).get(projectId, targetLetter);

          // Unreachable in practice: assertAppendDependenciesSound has already
          // refused a target that exists neither on the board nor in the file
          if (!targetCard) {
            throw new Error(`Dependency update target "${targetLetter}" not found`);
          }

          if (targetCard.status !== 'Not Started') {
            warnings.push(`Card "${targetLetter}" is "${targetCard.status}", skipping dependency update`);
            continue;
          }

          // Append new dependencies to existing ones
          // Support both add_dependency (single string) and add_dependencies (array)
          // Both sides normalised so a lowercase reference merges with, rather
          // than duplicates, the letter already stored
          const currentDeps = this.normalizeDependsOnCards(JSON.parse(targetCard.depends_on_cards));
          const newDeps = this.normalizeDependsOnCards(
            [].concat(update.add_dependencies || update.add_dependency || [])
          );
          // Self-reference and loops were already refused, for the whole file,
          // by assertAppendDependenciesSound before anything was inserted
          const mergedDeps = [...new Set([...currentDeps, ...newDeps])];

          this.db.prepare(`
            UPDATE cards SET depends_on_cards = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(JSON.stringify(mergedDeps), targetCard.id);

          dependenciesUpdated++;
        }
      }

      return {
        cardsAdded,
        dependenciesUpdated,
        warnings,
        // The singular fields stay populated only when exactly one of each was
        // created, so an existing caller's "Created phase X" wording stays true
        createdPhase: createdPhases.length === 1 ? createdPhases[0] : null,
        createdSubphase: createdSubphases.length === 1 ? createdSubphases[0] : null,
        createdPhases,
        createdSubphases,
      };
    });

    try {
      return transaction(projectId, data);
    } catch (error) {
      throw new Error(`Failed to append cards: ${error.message}`);
    }
  }

  // ============================================================================
  // APP SETTINGS
  // ============================================================================

  /**
   * Read an app-wide setting.
   * @param {string} key - Setting key
   * @returns {string|null} - The stored value, or null if never set
   */
  getSetting(key) {
    try {
      if (typeof key !== 'string' || key.trim() === '') {
        throw new Error('Setting key must be a non-empty string');
      }
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : null;
    } catch (error) {
      throw new Error(`Failed to get setting: ${error.message}`);
    }
  }

  /**
   * Store an app-wide setting. The value is trimmed; an empty value (or null)
   * removes the row, so the setting reads back as not set rather than "".
   * @param {string} key - Setting key
   * @param {string|null} value - Value to store
   * @returns {string|null} - The value now stored, or null if cleared
   */
  setSetting(key, value) {
    try {
      if (typeof key !== 'string' || key.trim() === '') {
        throw new Error('Setting key must be a non-empty string');
      }
      if (value !== null && value !== undefined && typeof value !== 'string') {
        throw new Error('Setting value must be a string');
      }
      const trimmed = (value || '').trim();
      if (trimmed === '') {
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        return null;
      }
      this.db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(key, trimmed);
      return trimmed;
    } catch (error) {
      throw new Error(`Failed to set setting: ${error.message}`);
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
                  // Strip computed resolution fields from external_dependencies,
                  // keeping only the canonical { project_slug, card_letter, description }
                  if (Array.isArray(cleanCard.external_dependencies)) {
                    cleanCard.external_dependencies = cleanCard.external_dependencies.map(dep => ({
                      project_slug: dep.project_slug,
                      card_letter: dep.card_letter,
                      description: dep.description || '',
                    }));
                  }
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

  /**
   * Export all projects for Obsidian vault consumption
   * Returns roadmap overview + unblocked cards per project
   */
  exportForVault() {
    try {
      const projects = this.getAllProjects();
      const exportProjects = projects.map(project => {
        const fullProject = this.getProject(project.id);
        const workableCards = this.getWorkableCards(project.id);

        // Build roadmap: phases -> subphases -> card counts by status
        // ids are the primary keys an append import targets with
        // add_to_phase / add_to_subphase - the same ids the app's
        // "Export for Claude" text lists under PHASES
        const roadmap = (fullProject.phases || []).map(phase => ({
          id: phase.id,
          phase: phase.name,
          short_name: phase.short_name,
          subphases: (phase.subphases || []).map(sub => {
            const cards = sub.cards || [];
            return {
              id: sub.id,
              name: sub.name,
              short_name: sub.short_name,
              not_started: cards.filter(c => c.status === 'Not Started').length,
              in_progress: cards.filter(c => c.status === 'In Progress').length,
              done: cards.filter(c => c.status === 'Done').length,
            };
          })
        }));

        // The three card sources arrive differently: getProject resolves
        // external_dependencies into enriched entries, while getWorkableCards
        // and the in-progress query below both SELECT c.* and leave the raw
        // JSON string. Normalise both to resolved entries so every exported
        // card carries the same shape.
        const externalDepsFor = (value) => {
          if (Array.isArray(value)) return value; // already resolved by getProject
          let parsed = [];
          try {
            parsed = JSON.parse(value || '[]');
          } catch (err) {
            parsed = [];
          }
          return this.resolveExternalDependencies(parsed);
        };

        // Every exported card carries external_dependencies, not just blocked
        // ones: a cross-project link is a dependency record and must survive
        // being satisfied. Entries keep their resolved/status so a consumer can
        // tell a completed link from a live one - resolved entries are NOT
        // filtered out. (blocked_by stays a blocked-card-only summary.)
        const shapeCard = (card) => ({
          session_letter: card.session_letter,
          title: card.title,
          description: card.description,
          phase: card.phase_name,
          subphase: card.subphase_name,
          complexity: card.complexity,
          resource: card.resource,
          depends_on_cards: card.depends_on_cards,
          external_dependencies: externalDepsFor(card.external_dependencies),
          success_criteria: card.success_criteria,
          notes: card.notes || '',
        });

        const unblockedCards = workableCards.map(shapeCard);

        // Blocked cards: Not Started but gated by internal and/or external
        // dependencies. Exported so downstream consumers can see WHY a
        // project has nothing unblocked, with a human-readable blocked_by.
        const statusByLetter = {};
        for (const phase of fullProject.phases || []) {
          for (const sub of phase.subphases || []) {
            for (const c of sub.cards || []) {
              statusByLetter[c.session_letter] = c.status;
            }
          }
        }

        const blockedCards = [];
        for (const phase of fullProject.phases || []) {
          for (const sub of phase.subphases || []) {
            for (const c of sub.cards || []) {
              if (c.status !== 'Not Started') continue;

              const internalBlockers = (c.depends_on_cards || [])
                .filter(letter => statusByLetter[letter] !== 'Done');
              // external_dependencies come pre-resolved from getProject
              const externalBlockers = (c.external_dependencies || [])
                .filter(dep => !dep.resolved);
              if (internalBlockers.length === 0 && externalBlockers.length === 0) continue;

              const blockedByParts = [];
              if (internalBlockers.length > 0) {
                blockedByParts.push(`card${internalBlockers.length > 1 ? 's' : ''} ${internalBlockers.join(', ')}`);
              }
              // Group external blockers by project for a compact label
              const byProject = new Map();
              for (const dep of externalBlockers) {
                const label = dep.project_name || dep.project_slug;
                if (!byProject.has(label)) byProject.set(label, []);
                byProject.get(label).push(dep.card_letter);
              }
              for (const [label, letters] of byProject) {
                blockedByParts.push(`${label} ${letters.join(', ')}`);
              }

              blockedCards.push({
                ...shapeCard({ ...c, phase_name: phase.name, subphase_name: sub.name }),
                blocked_by: blockedByParts.join('; '),
              });
            }
          }
        }

        // Done cards: deliberately absent from the three "what's next" arrays,
        // but needed to reconstruct a board rather than just answer what to do
        // next. Same card shape as every other array, plus completed_at.
        const doneCards = [];
        for (const phase of fullProject.phases || []) {
          for (const sub of phase.subphases || []) {
            for (const c of sub.cards || []) {
              if (c.status !== 'Done') continue;
              doneCards.push({
                ...shapeCard({ ...c, phase_name: phase.name, subphase_name: sub.name }),
                completed_at: c.completed_at || null,
              });
            }
          }
        }

        // Get in-progress cards
        const inProgressCards = this.db.prepare(`
          SELECT c.*, s.name as subphase_name, p.name as phase_name
          FROM cards c
          JOIN subphases s ON c.subphase_id = s.id
          JOIN phases p ON s.phase_id = p.id
          WHERE p.project_id = ? AND c.status = 'In Progress'
          ORDER BY p.display_order, s.display_order
        `).all(project.id).map(card => {
          card.depends_on_cards = JSON.parse(card.depends_on_cards);
          return shapeCard(card);
        });

        return {
          name: project.name,
          slug: project.slug,
          short_name: project.short_name || null,
          description: project.description,
          last_session_letter: this.getLastSessionLetter(project.id),
          stats: project.stats,
          roadmap,
          in_progress_cards: inProgressCards,
          unblocked_cards: unblockedCards,
          blocked_cards: blockedCards,
          done_cards: doneCards,
        };
      });

      return {
        exported_at: new Date().toISOString(),
        projects: exportProjects,
      };
    } catch (error) {
      throw new Error(`Failed to export for vault: ${error.message}`);
    }
  }
}

module.exports = KanbanDatabase;
