import React, { useState, useMemo } from 'react';

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

    // Check new_cards exists
    if (!data.new_cards || !Array.isArray(data.new_cards) || data.new_cards.length === 0) {
      errors.push('JSON must contain a non-empty "new_cards" array');
      return { errors, warnings };
    }

    // Check add_to_phase
    if (!data.add_to_phase) {
      errors.push('Missing "add_to_phase" field');
    } else if (!projectLookups.phases[data.add_to_phase]) {
      errors.push(`Phase ID ${data.add_to_phase} not found in project`);
    }

    // Check add_to_subphase
    if (!data.add_to_subphase) {
      errors.push('Missing "add_to_subphase" field');
    } else if (!projectLookups.subphases[data.add_to_subphase]) {
      errors.push(`Subphase ID ${data.add_to_subphase} not found in project`);
    } else {
      // Verify subphase belongs to the specified phase
      const sub = projectLookups.subphases[data.add_to_subphase];
      if (data.add_to_phase && sub) {
        const phase = projectLookups.phases[data.add_to_phase];
        if (phase) {
          const belongsToPhase = (phase.subphases || []).some(s => s.id === data.add_to_subphase);
          if (!belongsToPhase) {
            errors.push(`Subphase ${data.add_to_subphase} does not belong to phase ${data.add_to_phase}`);
          }
        }
      }
    }

    // Check for duplicate session letters
    for (const card of data.new_cards) {
      if (!card.session_letter) {
        errors.push(`Card "${card.title || 'untitled'}" is missing session_letter`);
      } else if (projectLookups.cardLetters.has(card.session_letter)) {
        errors.push(`Session letter "${card.session_letter}" already exists in project`);
      }
      if (!card.title) {
        errors.push(`Card with letter "${card.session_letter || '?'}" is missing title`);
      }
    }

    // Check for duplicates within the new cards themselves
    const newLetters = new Set();
    for (const card of data.new_cards) {
      if (card.session_letter) {
        if (newLetters.has(card.session_letter)) {
          errors.push(`Duplicate session letter "${card.session_letter}" in new_cards`);
        }
        newLetters.add(card.session_letter);
      }
    }

    // Validate dependency updates
    if (data.dependency_updates && Array.isArray(data.dependency_updates)) {
      for (const update of data.dependency_updates) {
        const letter = update.card || update.session_letter;
        const target = projectLookups.cardsByLetter[letter];
        if (!target) {
          errors.push(`Dependency update target "${letter}" not found in project`);
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

  const targetSubphase = fileData?.add_to_subphase
    ? projectLookups.subphases[fileData.add_to_subphase]
    : null;

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

                {/* Target info */}
                {targetSubphase && (
                  <p className="text-sm text-dark-text">
                    Adding <span className="font-bold text-blue-400">{fileData.new_cards.length}</span> card{fileData.new_cards.length !== 1 ? 's' : ''} to{' '}
                    <span className="font-semibold">{targetSubphase.name}</span>
                  </p>
                )}

                {/* Card list */}
                <div className="space-y-1.5">
                  {fileData.new_cards.map((card, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
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
