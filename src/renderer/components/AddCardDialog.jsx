import React, { useState, useEffect, useRef } from 'react';

const AddCardDialog = ({ isOpen, onClose, onSave, subphaseId, projectId, existingCards }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [resource, setResource] = useState('claude_sub');
  const [complexity, setComplexity] = useState('medium');
  const [dependencies, setDependencies] = useState([]);
  const [promptGuide, setPromptGuide] = useState('');
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [nextLetter, setNextLetter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);

  // Fetch next session letter when dialog opens
  useEffect(() => {
    if (isOpen && projectId && subphaseId) {
      fetchNextLetter();
    }
  }, [isOpen, projectId, subphaseId]);

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

  const fetchNextLetter = async () => {
    try {
      const letter = await window.electron.getNextSessionLetter(projectId, subphaseId);
      setNextLetter(letter);
    } catch (err) {
      console.error('Failed to get next session letter:', err);
      setNextLetter('?');
    }
  };

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

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cardData = {
        session_letter: nextLetter,
        title: title.trim(),
        description: description.trim() || null,
        success_criteria: successCriteria.trim() || null,
        resource,
        complexity,
        depends_on_cards: dependencies,
        prompt_guide: promptGuide.trim() || null,
        git_commit_message: gitCommitMessage.trim() || null,
      };

      await onSave(subphaseId, cardData);
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
                This will be Session <span className="font-bold text-blue-400">{nextLetter || '...'}</span>
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
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
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
              disabled={isLoading || !title.trim()}
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
