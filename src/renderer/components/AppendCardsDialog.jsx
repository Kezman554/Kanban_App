import React, { useState, useMemo } from 'react';

const BATCH_PLACEMENT_KEYS = ['add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase'];

// One created thing reads: phase "X". Several read: phases "X", "Y".
const describeCreated = (created, singular, plural) => {
  const items = created || [];
  if (items.length === 0) return '';
  const names = items.map(item => `"${item.name}"`).join(', ');
  return ` ${items.length === 1 ? singular : plural} ${names}`;
};

/**
 * Split an append file into its batches. A single-destination file becomes a
 * one-entry list so validation and the preview have one shape to handle, and
 * mixing the two forms is reported rather than silently resolved.
 */
const splitAppendBatches = (data) => {
  if (!data || typeof data !== 'object') return { batches: [], batched: false, error: null };

  const hasBatches = data.batches !== undefined && data.batches !== null;
  if (!hasBatches) {
    const { batches, dependency_updates, ...batch } = data;
    return { batches: [batch], batched: false, error: null };
  }

  const conflicting = BATCH_PLACEMENT_KEYS.concat('new_cards')
    .filter(key => data[key] !== undefined && data[key] !== null);
  if (conflicting.length > 0) {
    return {
      batches: [], batched: true,
      error: `Provide either "batches" or top-level placement fields, not both (found alongside "batches": ${conflicting.join(', ')})`,
    };
  }
  if (!Array.isArray(data.batches) || data.batches.length === 0) {
    return { batches: [], batched: true, error: '"batches" must be a non-empty array' };
  }
  if (data.batches.some(batch => !batch || typeof batch !== 'object' || Array.isArray(batch))) {
    return { batches: [], batched: true, error: 'Every entry in "batches" must be an object' };
  }

  return { batches: data.batches, batched: true, error: null };
};

const AppendCardsDialog = ({ isOpen, onClose, project, onSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [appending, setAppending] = useState(false);
  const [result, setResult] = useState(null);

  // Build lookups from project data
  const projectLookups = useMemo(() => {
    if (!project) return { phases: {}, subphases: {}, cardLetters: new Set(), cardsByLetter: {} };

    const phases = {};
    const subphases = {};
    const cardLetters = new Set();
    const cardsByLetter = {};

    for (const phase of project.phases || []) {
      phases[phase.id] = phase;
      for (const subphase of phase.subphases || []) {
        subphases[subphase.id] = { ...subphase, phaseName: phase.name };
        for (const card of subphase.cards || []) {
          cardLetters.add(card.session_letter);
          cardsByLetter[card.session_letter] = card;
        }
      }
    }

    return { phases, subphases, cardLetters, cardsByLetter };
  }, [project]);

  const validate = (data) => {
    const errors = [];
    const warnings = [];

    const { batches, batched, error: splitError } = splitAppendBatches(data);
    if (splitError) {
      errors.push(splitError);
      return { errors, warnings };
    }

    batches.forEach((batch, index) => {
      // Messages name their batch, so "Phase ID 4 not found" is traceable
      // back to one placement when the file has several
      const label = batched ? `Batch ${index + 1}: ` : '';

      if (!batch.new_cards || !Array.isArray(batch.new_cards) || batch.new_cards.length === 0) {
        errors.push(`${label}${batched ? 'must contain' : 'JSON must contain'} a non-empty "new_cards" array`);
        return;
      }

      const hasNewPhase = batch.new_phase && typeof batch.new_phase === 'object';
      const hasNewSubphase = batch.new_subphase && typeof batch.new_subphase === 'object';
      const hasAddToPhase = batch.add_to_phase !== undefined && batch.add_to_phase !== null;
      const hasAddToSubphase = batch.add_to_subphase !== undefined && batch.add_to_subphase !== null;

      // Validate the combination of targeting fields
      if (hasNewPhase && hasAddToPhase) {
        errors.push(`${label}Provide either "add_to_phase" (existing) or "new_phase" (new), not both`);
      } else if (hasNewPhase) {
        // Creating a new phase requires a new subphase too
        if (!hasNewSubphase) {
          errors.push(`${label}"new_phase" requires "new_subphase" (a phase cannot be created without a subphase)`);
        }
        if (!batch.new_phase.name) {
          errors.push(`${label}"new_phase" is missing a name`);
        }
        if (hasNewSubphase && !batch.new_subphase.name) {
          errors.push(`${label}"new_subphase" is missing a name`);
        }
      } else if (hasNewSubphase) {
        // New subphase under an existing phase
        if (!hasAddToPhase) {
          errors.push(`${label}"new_subphase" without "new_phase" requires a valid "add_to_phase" ID`);
        } else if (!projectLookups.phases[batch.add_to_phase]) {
          errors.push(`${label}Phase ID ${batch.add_to_phase} not found in project`);
        }
        if (!batch.new_subphase.name) {
          errors.push(`${label}"new_subphase" is missing a name`);
        }
      } else {
        // Existing phase + existing subphase (original behavior)
        if (!hasAddToPhase) {
          errors.push(`${label}Missing "add_to_phase" field`);
        } else if (!projectLookups.phases[batch.add_to_phase]) {
          errors.push(`${label}Phase ID ${batch.add_to_phase} not found in project`);
        }

        if (!hasAddToSubphase) {
          errors.push(`${label}Missing "add_to_subphase" field`);
        } else if (!projectLookups.subphases[batch.add_to_subphase]) {
          errors.push(`${label}Subphase ID ${batch.add_to_subphase} not found in project`);
        } else {
          // Verify subphase belongs to the specified phase
          const sub = projectLookups.subphases[batch.add_to_subphase];
          if (hasAddToPhase && sub) {
            const phase = projectLookups.phases[batch.add_to_phase];
            if (phase) {
              const belongsToPhase = (phase.subphases || []).some(s => s.id === batch.add_to_subphase);
              if (!belongsToPhase) {
                errors.push(`${label}Subphase ${batch.add_to_subphase} does not belong to phase ${batch.add_to_phase}`);
              }
            }
          }
        }
      }

      for (const card of batch.new_cards) {
        if (!card.session_letter) {
          errors.push(`${label}Card "${card.title || 'untitled'}" is missing session_letter`);
        } else if (projectLookups.cardLetters.has(card.session_letter)) {
          errors.push(`${label}Session letter "${card.session_letter}" already exists in project`);
        }
        if (!card.title) {
          errors.push(`${label}Card with letter "${card.session_letter || '?'}" is missing title`);
        }
      }
    });

    // Duplicate letters are a whole-file problem, not a per-batch one: the same
    // letter in batch 1 and batch 3 is just as much a clash
    const seenLetters = new Map();
    batches.forEach((batch, index) => {
      if (!Array.isArray(batch.new_cards)) return;
      for (const card of batch.new_cards) {
        if (!card || !card.session_letter) continue;
        if (seenLetters.has(card.session_letter)) {
          const first = seenLetters.get(card.session_letter);
          errors.push(
            batched
              ? `Duplicate session letter "${card.session_letter}" (batch ${first} and batch ${index + 1})`
              : `Duplicate session letter "${card.session_letter}" in new_cards`
          );
        } else {
          seenLetters.set(card.session_letter, index + 1);
        }
      }
    });

    // Warn about unrecognised keys so generated fields are never silently dropped
    // (mirrors findUnrecognisedImportKeys in src/database/operations.js)
    const knownTopLevelKeys = new Set([
      'add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase',
      'new_cards', 'dependency_updates', 'batches',
    ]);
    const knownBatchKeys = new Set([
      'add_to_phase', 'add_to_subphase', 'new_phase', 'new_subphase', 'new_cards',
    ]);
    const knownCardKeys = new Set([
      'session_letter', 'title', 'description', 'success_criteria',
      'resource', 'status', 'depends_on_cards', 'external_dependencies',
      'is_placeholder', 'complexity', 'likely_needs_expansion',
      'prompt_guide', 'checkpoint', 'git_commit_message', 'notes',
      'parent_card_id', 'is_expanded',
    ]);
    for (const key of Object.keys(data)) {
      if (!knownTopLevelKeys.has(key)) {
        warnings.push(`Unrecognised field "${key}" will be ignored`);
      }
    }
    batches.forEach((batch, index) => {
      const prefix = batched ? `Batch ${index + 1}` : null;
      if (batched) {
        for (const key of Object.keys(batch)) {
          if (!knownBatchKeys.has(key)) {
            warnings.push(`${prefix}: unrecognised field "${key}" will be ignored`);
          }
        }
      }
      if (!Array.isArray(batch.new_cards)) return;
      for (const card of batch.new_cards) {
        if (!card || typeof card !== 'object') continue;
        for (const key of Object.keys(card)) {
          if (!knownCardKeys.has(key)) {
            const letter = card.session_letter || '?';
            warnings.push(
              prefix
                ? `${prefix}, card "${letter}": unrecognised field "${key}" will be ignored`
                : `Card "${letter}": unrecognised field "${key}" will be ignored`
            );
          }
        }
      }
    });

    // Validate dependency updates
    if (data.dependency_updates && Array.isArray(data.dependency_updates)) {
      const importedLetters = new Set(seenLetters.keys());
      for (const update of data.dependency_updates) {
        const letter = update.card || update.session_letter;
        const target = projectLookups.cardsByLetter[letter];
        if (!target) {
          // A letter this file is adding is a legitimate target: updates run
          // after every batch has been inserted
          if (!importedLetters.has(letter)) {
            errors.push(`Dependency update target "${letter}" not found in project`);
          }
        } else if (target.status === 'Done') {
          warnings.push(`Card "${letter}" is Done - dependency update will be skipped`);
        } else if (target.status === 'In Progress') {
          warnings.push(`Card "${letter}" is In Progress - dependency update will be skipped`);
        }
      }
    }

    return { errors, warnings };
  };

  const handleSelectFile = async () => {
    try {
      setError(null);
      setValidationErrors([]);
      setValidationWarnings([]);
      setResult(null);

      const result = await window.electron.openJsonFile();
      if (!result) return;

      setSelectedFile(result.filePath);
      setFileData(result.data);

      // Run validation
      const { errors, warnings } = validate(result.data);
      setValidationErrors(errors);
      setValidationWarnings(warnings);
    } catch (err) {
      setError(err.message || 'Failed to read file');
      setSelectedFile(null);
      setFileData(null);
    }
  };

  const handleAppend = async () => {
    if (!fileData || validationErrors.length > 0) return;

    try {
      setAppending(true);
      setError(null);

      const appendResult = await window.electron.appendCards(project.id, fileData);
      setResult(appendResult);

      // Notify parent to reload
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err.message || 'Failed to append cards');
    } finally {
      setAppending(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileData(null);
    setError(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    setAppending(false);
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  // Group the cards under the destination each batch targets, so what lands
  // where is visible before the import runs
  const previewGroups = (() => {
    if (!fileData) return [];
    const { batches, error: splitError } = splitAppendBatches(fileData);
    if (splitError) return [];

    return batches.map((batch) => {
      const newPhase = batch.new_phase && typeof batch.new_phase === 'object' ? batch.new_phase : null;
      const newSubphase = batch.new_subphase && typeof batch.new_subphase === 'object' ? batch.new_subphase : null;

      let target = null;
      if (newPhase && newSubphase) {
        target = { name: newSubphase.name, note: `new phase "${newPhase.name}"` };
      } else if (newSubphase) {
        const phase = projectLookups.phases[batch.add_to_phase];
        target = { name: newSubphase.name, note: phase ? `new subphase in "${phase.name}"` : 'new subphase' };
      } else {
        const existing = batch.add_to_subphase ? projectLookups.subphases[batch.add_to_subphase] : null;
        target = existing ? { name: existing.name, note: null } : null;
      }

      return { target, cards: Array.isArray(batch.new_cards) ? batch.new_cards : [] };
    });
  })();

  const totalPreviewCards = previewGroups.reduce((n, group) => n + group.cards.length, 0);

  const canAppend = fileData && validationErrors.length === 0 && !appending && !result;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className="bg-dark-surface border border-dark-border rounded-lg shadow-xl w-full max-w-lg mx-4 pointer-events-auto max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-border flex-shrink-0">
            <h2 className="text-lg font-bold text-dark-text">Append Cards</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            >
              <span className="text-xl">x</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* File Picker */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                Select Append JSON File
              </label>
              <button
                onClick={handleSelectFile}
                disabled={!!result}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-blue-500 transition-colors text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl">📁</span>
                <div className="flex-1 min-w-0">
                  {selectedFile ? (
                    <span className="text-dark-text truncate block">
                      {selectedFile.split(/[/\\]/).pop()}
                    </span>
                  ) : (
                    <span className="text-dark-text-secondary">
                      Click to browse...
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg space-y-1">
                <p className="text-sm font-medium text-red-300">Validation Errors:</p>
                {validationErrors.map((err, i) => (
                  <p key={i} className="text-sm text-red-400 pl-2">- {err}</p>
                ))}
              </div>
            )}

            {/* Validation Warnings */}
            {validationWarnings.length > 0 && (
              <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg space-y-1">
                <p className="text-sm font-medium text-yellow-300">Warnings:</p>
                {validationWarnings.map((warn, i) => (
                  <p key={i} className="text-sm text-yellow-400 pl-2">- {warn}</p>
                ))}
              </div>
            )}

            {/* Preview */}
            {fileData && validationErrors.length === 0 && !result && (
              <div className="p-4 bg-dark-bg rounded-lg border border-dark-border space-y-3">
                <h3 className="text-sm font-medium text-dark-text-secondary">
                  Preview
                </h3>

                {/* One group per destination */}
                {previewGroups.map((group, gi) => (
                  <div key={gi} className="space-y-1.5">
                    <p className="text-sm text-dark-text">
                      Adding <span className="font-bold text-blue-400">{group.cards.length}</span> card{group.cards.length !== 1 ? 's' : ''} to{' '}
                      {group.target ? (
                        <>
                          <span className="font-semibold">{group.target.name}</span>
                          {group.target.note && (
                            <span className="text-green-400"> ({group.target.note})</span>
                          )}
                        </>
                      ) : (
                        <span className="font-semibold text-red-400">an unknown destination</span>
                      )}
                    </p>

                    {group.cards.map((card, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm pl-3">
                        <span className="flex-shrink-0 w-8 h-6 rounded bg-dark-surface flex items-center justify-center font-mono text-xs text-blue-400 border border-dark-border">
                          {card.session_letter}
                        </span>
                        <span className="text-dark-text truncate">{card.title}</span>
                        {card.status && card.status !== 'Not Started' && (
                          <span className="text-xs text-yellow-400 flex-shrink-0">({card.status})</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {previewGroups.length > 1 && (
                  <p className="text-xs text-dark-text-secondary border-t border-dark-border pt-2">
                    {totalPreviewCards} card{totalPreviewCards !== 1 ? 's' : ''} across {previewGroups.length} destinations
                  </p>
                )}

                {/* Dependency updates */}
                {fileData.dependency_updates && fileData.dependency_updates.length > 0 && (
                  <div className="pt-2 border-t border-dark-border">
                    <p className="text-xs font-medium text-dark-text-secondary mb-1.5">
                      Dependency Updates ({fileData.dependency_updates.length}):
                    </p>
                    {fileData.dependency_updates.map((update, i) => (
                      <div key={i} className="text-xs text-dark-text-secondary pl-2">
                        Card {update.card || update.session_letter} + deps: [{([].concat(update.add_dependencies || update.add_dependency || [])).join(', ')}]
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Success Result */}
            {result && (
              <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg space-y-2">
                <p className="text-sm font-medium text-green-300">
                  Successfully appended!
                </p>
                <p className="text-sm text-green-400">
                  {result.cardsAdded} card{result.cardsAdded !== 1 ? 's' : ''} added, {result.dependenciesUpdated} dependenc{result.dependenciesUpdated !== 1 ? 'ies' : 'y'} updated
                </p>
                {((result.createdPhases || []).length > 0 || (result.createdSubphases || []).length > 0) && (
                  <p className="text-sm text-green-400">
                    Created{describeCreated(result.createdPhases, 'phase', 'phases')}
                    {(result.createdPhases || []).length > 0 && (result.createdSubphases || []).length > 0 ? ' and' : ''}
                    {describeCreated(result.createdSubphases, 'subphase', 'subphases')}
                  </p>
                )}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="pt-1">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-400">- {w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-dark-border flex-shrink-0">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-dark-text-secondary hover:text-dark-text hover:bg-dark-hover transition-colors"
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleAppend}
                disabled={!canAppend}
                className={`
                  px-6 py-2 rounded-lg font-medium transition-colors
                  ${canAppend
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-dark-border text-dark-text-secondary cursor-not-allowed'
                  }
                `}
              >
                {appending ? 'Appending...' : 'Append Cards'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AppendCardsDialog;
