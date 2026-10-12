import React, { useState, useEffect, useRef } from 'react';

// Name (required), short name and description (optional) for a phase or
// subphase created along with the card
const NewGroupFields = ({ label, value, onChange }) => {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const input = 'px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500';
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-dark-text-secondary">{label}</div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value.name}
          onChange={set('name')}
          className={`flex-1 ${input}`}
          placeholder="Name (required)"
        />
        <input
          type="text"
          value={value.short_name}
          onChange={set('short_name')}
          className={`w-32 ${input}`}
          placeholder="Short name"
        />
      </div>
      <input
        type="text"
        value={value.description}
        onChange={set('description')}
        className={`w-full ${input}`}
        placeholder="Description (optional)"
      />
    </div>
  );
};

const AddCardDialog = ({ isOpen, onClose, onSave, subphaseId, projectId, existingCards, phases = [] }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [resource, setResource] = useState('claude_sub');
  const [complexity, setComplexity] = useState('medium');
  const [dependencies, setDependencies] = useState([]);
  const [promptGuide, setPromptGuide] = useState('');
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [nextLetter, setNextLetter] = useState('');
  // Destination key: 'sub:<id>' (existing subphase), 'newsub:<phaseId>' (new
  // subphase under an existing phase), 'newphase', or '' (not chosen yet).
  // null means "use the subphase the Add button was clicked from" - kept as an
  // override rather than seeded from the prop so the default needs no effect
  // to apply and cannot race the letter fetch on open. Opened with no subphase
  // (the empty-board button) the destination starts unset.
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [newPhase, setNewPhase] = useState({ name: '', short_name: '', description: '' });
  const [newSubphase, setNewSubphase] = useState({ name: '', short_name: '', description: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  const errorRef = useRef(null);

  // Where the card will actually land
  const destination = selectedDestination !== null
    ? selectedDestination
    : (subphaseId ? `sub:${subphaseId}` : '');
  const [destinationMode, destinationId] = destination.split(':');
  const targetSubphaseId = destinationMode === 'sub' ? Number(destinationId) : null;
  const isNewSubphase = destinationMode === 'newsub';
  const isNewPhase = destinationMode === 'newphase';

  // Fetch the suggested session letter for the CHOSEN destination -
  // getNextSessionLetter is subphase-scoped, so changing the destination has
  // to re-suggest. A subphase still to be created is an empty subphase, so it
  // is asked for with no subphase id (the project's high-water mark plus one).
  // A response for a destination since changed away from is discarded, so a
  // slow earlier answer cannot overwrite the current one.
  useEffect(() => {
    if (!(isOpen && projectId && destination)) return undefined;
    let superseded = false;
    window.electron.getNextSessionLetter(projectId, targetSubphaseId)
      .then((letter) => { if (!superseded) setNextLetter(letter); })
      .catch((err) => {
        console.error('Failed to get next session letter:', err);
        if (!superseded) setNextLetter('?');
      });
    return () => { superseded = true; };
  }, [isOpen, projectId, destination]);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setSuccessCriteria('');
      setResource('claude_sub');
      setComplexity('medium');
      setDependencies([]);
      setPromptGuide('');
      setGitCommitMessage('');
      setNextLetter('');
      setSelectedDestination(null);
      setNewPhase({ name: '', short_name: '', description: '' });
      setNewSubphase({ name: '', short_name: '', description: '' });
      setError(null);
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // The form scrolls, so an error at the bottom can land off screen - bring it into view
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [error]);

  const handleDependencyToggle = (letter) => {
    setDependencies(prev => {
      if (prev.includes(letter)) {
        return prev.filter(l => l !== letter);
      } else {
        return [...prev, letter];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!destination) {
      setError('Choose a destination');
      return;
    }
    if (isNewPhase && !newPhase.name.trim()) {
      setError('New phase name is required');
      return;
    }
    if ((isNewPhase || isNewSubphase) && !newSubphase.name.trim()) {
      setError('New subphase name is required');
      return;
    }

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    const sessionLetter = nextLetter.trim().toUpperCase();

    if (!sessionLetter) {
      setError('Session letter is required');
      return;
    }

    const conflict = (existingCards || []).find(
      card => (card.session_letter || '').toUpperCase() === sessionLetter
    );
    if (conflict) {
      setError(`Session letter ${sessionLetter} is already used by "${conflict.title}". Letters must be unique across the whole project.`);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cardData = {
        session_letter: sessionLetter,
        title: title.trim(),
        description: description.trim() || null,
        success_criteria: successCriteria.trim() || null,
        resource,
        complexity,
        depends_on_cards: dependencies,
        prompt_guide: promptGuide.trim() || null,
        git_commit_message: gitCommitMessage.trim() || null,
      };

      // One of resolveAppendTarget's three legal placements
      const named = (fields) => ({
        name: fields.name.trim(),
        short_name: fields.short_name.trim() || null,
        description: fields.description.trim() || null,
      });
      let placement;
      if (isNewPhase) {
        placement = { new_phase: named(newPhase), new_subphase: named(newSubphase) };
      } else if (isNewSubphase) {
        placement = { add_to_phase: Number(destinationId), new_subphase: named(newSubphase) };
      } else {
        const phase = phases.find(ph => (ph.subphases || []).some(sub => sub.id === targetSubphaseId));
        placement = { add_to_phase: phase ? phase.id : null, add_to_subphase: targetSubphaseId };
      }

      await onSave(placement, cardData);
      onClose();
    } catch (err) {
      console.error('Failed to create card:', err);
      setError(err.message || 'Failed to create card');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Resource type options
  const resourceOptions = [
    { value: 'claude_sub', label: 'Claude Subscription' },
    { value: 'anthropic_api', label: 'Anthropic API' },
    { value: 'none', label: 'Manual Task' },
    { value: 'tbc', label: 'To Be Confirmed' },
  ];

  // Complexity options
  const complexityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          className="w-full max-w-2xl max-h-[90vh] bg-dark-surface border border-dark-border rounded-xl shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-border">
            <div>
              <h2 className="text-xl font-bold text-dark-text">Add New Card</h2>
              <p className="text-sm text-dark-text-secondary mt-1">
                Session letters are unique across the whole project
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-dark">
            {/* Destination - defaults to the subphase the button was clicked from.
                Lists EVERY subphase, including those the board hides because all
                their cards are done, so work can be filed where it belongs. Always
                shown: on a project with no phases, "+ New phase" is the only way in. */}
            <div>
                <label className="block text-sm font-medium text-dark-text mb-1">
                  Destination <span className="text-red-400">*</span>
                </label>
                <select
                  value={destination}
                  onChange={(e) => setSelectedDestination(e.target.value)}
                  className={`w-full px-3 py-2 bg-dark-bg border rounded-lg text-dark-text focus:outline-none focus:border-blue-500 ${destination ? 'border-dark-border' : 'border-yellow-600'}`}
                >
                  {!destination && (
                    <option value="" disabled>Choose a destination...</option>
                  )}
                  {phases.map(phase => (
                    <optgroup key={phase.id} label={phase.name}>
                      {(phase.subphases || []).map(sub => {
                        const cards = sub.cards || [];
                        const allDone = cards.length > 0 && cards.every(c => c.status === 'Done');
                        const suffix = cards.length === 0
                          ? ' - empty'
                          : allDone
                            ? ' - all done (hidden from board)'
                            : '';
                        return (
                          <option key={sub.id} value={`sub:${sub.id}`}>
                            {sub.name}{suffix}
                          </option>
                        );
                      })}
                      <option value={`newsub:${phase.id}`}>+ New subphase...</option>
                    </optgroup>
                  ))}
                  <option value="newphase">+ New phase...</option>
                </select>
                <p className="text-xs text-dark-text-secondary mt-1">
                  Completed phases are hidden on the board but can still be chosen here
                </p>

                {/* Inline fields for a phase and/or subphase created with the card */}
                {(isNewPhase || isNewSubphase) && (
                  <div className="mt-3 p-3 bg-dark-bg border border-dark-border rounded-lg space-y-3">
                    {isNewPhase && (
                      <NewGroupFields
                        label="New phase"
                        value={newPhase}
                        onChange={setNewPhase}
                      />
                    )}
                    <NewGroupFields
                      label={isNewPhase ? 'Its first subphase' : `New subphase in ${(phases.find(ph => String(ph.id) === destinationId) || {}).name || 'phase'}`}
                      value={newSubphase}
                      onChange={setNewSubphase}
                    />
                  </div>
                )}
            </div>

            {/* Session Letter */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Session Letter <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={nextLetter}
                onChange={(e) => setNextLetter(e.target.value.toUpperCase())}
                className="w-32 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text font-bold uppercase focus:outline-none focus:border-blue-500"
                placeholder="A"
              />
              <p className="text-xs text-dark-text-secondary mt-1">
                Suggested automatically - edit if you want a different letter
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text focus:outline-none focus:border-blue-500"
                placeholder="Card title..."
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-24 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text resize-none focus:outline-none focus:border-blue-500 scrollbar-dark"
                placeholder="What needs to be done..."
              />
            </div>

            {/* Success Criteria */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Success Criteria
              </label>
              <textarea
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                className="w-full h-20 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text resize-none focus:outline-none focus:border-blue-500 scrollbar-dark"
                placeholder="How to know when it's done..."
              />
            </div>

            {/* Resource and Complexity Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Resource Type */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-1">
                  Resource Type
                </label>
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text focus:outline-none focus:border-blue-500"
                >
                  {resourceOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Complexity */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-1">
                  Complexity
                </label>
                <select
                  value={complexity}
                  onChange={(e) => setComplexity(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text focus:outline-none focus:border-blue-500"
                >
                  {complexityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dependencies */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Dependencies
              </label>
              <p className="text-xs text-dark-text-secondary mb-2">
                Select cards that must be completed before this one
              </p>
              {existingCards && existingCards.length > 0 ? (
                <div className="flex flex-wrap gap-2 p-3 bg-dark-bg border border-dark-border rounded-lg max-h-32 overflow-y-auto scrollbar-dark">
                  {existingCards.map(card => (
                    <button
                      key={card.session_letter}
                      type="button"
                      onClick={() => handleDependencyToggle(card.session_letter)}
                      className={`
                        px-3 py-1 rounded text-sm font-medium transition-colors
                        ${dependencies.includes(card.session_letter)
                          ? 'bg-blue-600 text-white'
                          : 'bg-dark-surface border border-dark-border text-dark-text hover:border-blue-500'}
                      `}
                      title={card.title}
                    >
                      {card.session_letter}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-dark-text-secondary italic p-3 bg-dark-bg border border-dark-border rounded-lg">
                  No existing cards to depend on
                </p>
              )}
              {dependencies.length > 0 && (
                <p className="text-xs text-dark-text-secondary mt-1">
                  Selected: {dependencies.join(', ')}
                </p>
              )}
            </div>

            {/* Prompt Guide */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Prompt Guide <span className="text-dark-text-secondary">(optional)</span>
              </label>
              <textarea
                value={promptGuide}
                onChange={(e) => setPromptGuide(e.target.value)}
                className="w-full h-24 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text font-mono text-sm resize-none focus:outline-none focus:border-blue-500 scrollbar-dark"
                placeholder="Claude Code prompt for this task..."
              />
            </div>

            {/* Git Commit Message */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">
                Git Commit Message <span className="text-dark-text-secondary">(optional)</span>
              </label>
              <input
                type="text"
                value={gitCommitMessage}
                onChange={(e) => setGitCommitMessage(e.target.value)}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text font-mono text-sm focus:outline-none focus:border-blue-500"
                placeholder="feat: add feature X"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div ref={errorRef} className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-dark-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text hover:bg-dark-hover transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                isLoading || !title.trim() || !nextLetter.trim() || !destination ||
                (isNewPhase && !newPhase.name.trim()) ||
                ((isNewPhase || isNewSubphase) && !newSubphase.name.trim())
              }
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Card'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddCardDialog;
