import React, { useState, useEffect, useRef } from 'react';
import { copyText } from '../utils/clipboard.js';

const CardDetail = ({ card, isOpen, onClose, onMarkDone, onExpandPlan, onStatusChange, onCardUpdated, onCardDeleted, project }) => {
  const [promptGuideCopySuccess, setPromptGuideCopySuccess] = useState(false);
  const [commitMessageCopySuccess, setCommitMessageCopySuccess] = useState(false);
  const [isEditingCommitMessage, setIsEditingCommitMessage] = useState(false);
  const [editedCommitMessage, setEditedCommitMessage] = useState('');
  const [commitMessageSaveSuccess, setCommitMessageSaveSuccess] = useState(false);
  const [commitMessageSaveError, setCommitMessageSaveError] = useState(null);
  const [isEditingPromptGuide, setIsEditingPromptGuide] = useState(false);
  const [editedPromptGuide, setEditedPromptGuide] = useState('');
  const [promptGuideSaveSuccess, setPromptGuideSaveSuccess] = useState(false);
  const [promptGuideSaveError, setPromptGuideSaveError] = useState(null);
  const [editingField, setEditingField] = useState(null); // 'title' | 'description' | 'success_criteria'
  const [editedFieldValue, setEditedFieldValue] = useState('');
  const [fieldSaveSuccess, setFieldSaveSuccess] = useState(null);
  const [fieldSaveError, setFieldSaveError] = useState(null);
  const [isEditingExtDeps, setIsEditingExtDeps] = useState(false);
  const [editedExtDeps, setEditedExtDeps] = useState([]);
  const [extDepsSaveSuccess, setExtDepsSaveSuccess] = useState(false);
  const [extDepsSaveError, setExtDepsSaveError] = useState(null);
  const [isEditingDeps, setIsEditingDeps] = useState(false);
  const [editedDeps, setEditedDeps] = useState([]);
  const [depsSaveSuccess, setDepsSaveSuccess] = useState(false);
  const [depsSaveError, setDepsSaveError] = useState(null);
  const [availableProjects, setAvailableProjects] = useState([]);
  // slug -> array of that project's cards, or 'loading'. Populates the letter picker.
  const [projectCardsBySlug, setProjectCardsBySlug] = useState({});
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');
  const [notesSaveSuccess, setNotesSaveSuccess] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState(null);
  const [sessionNotification, setSessionNotification] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const panelRef = useRef(null);

  // Reset state when card changes
  useEffect(() => {
    setPromptGuideCopySuccess(false);
    setCommitMessageCopySuccess(false);
    setIsEditingCommitMessage(false);
    setEditedCommitMessage('');
    setCommitMessageSaveSuccess(false);
    setCommitMessageSaveError(null);
    setSessionNotification(null);
    setIsEditingPromptGuide(false);
    setEditedPromptGuide('');
    setPromptGuideSaveSuccess(false);
    setPromptGuideSaveError(null);
    setEditingField(null);
    setEditedFieldValue('');
    setFieldSaveSuccess(null);
    setFieldSaveError(null);
    setIsEditingNotes(false);
    setEditedNotes('');
    setNotesSaveSuccess(false);
    setNotesSaveError(null);
    setIsEditingDeps(false);
    setEditedDeps([]);
    setDepsSaveSuccess(false);
    setDepsSaveError(null);
    setIsEditingExtDeps(false);
    setEditedExtDeps([]);
    setExtDepsSaveSuccess(false);
    setExtDepsSaveError(null);
    setProjectCardsBySlug({});
    setShowDeleteConfirm(false);
    setIsDeleting(false);
    setDeleteError(null);
  }, [card?.id]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
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

  // Handle escape key to close
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

  if (!isOpen || !card) return null;

  const isManual = card.resource === 'none';
  const isTBC = card.resource === 'tbc';
  const hasPromptGuide = card.prompt_guide && card.prompt_guide.trim() !== '';
  const hasExternalDeps = Array.isArray(card.external_dependencies) && card.external_dependencies.length > 0;

  // Same ordering the board uses: shorter base first (A < AA), then
  // alphabetical, then numeric suffix (C < C2)
  function compareLetters(a, b) {
    const parse = (x) => {
      const m = String(x || '').match(/^([A-Z]+)(\d*)$/);
      return m ? { base: m[1], num: m[2] ? parseInt(m[2], 10) : 0 } : { base: String(x || ''), num: 0 };
    };
    const pa = parse(a), pb = parse(b);
    if (pa.base.length !== pb.base.length) return pa.base.length - pb.base.length;
    if (pa.base !== pb.base) return pa.base.localeCompare(pb.base);
    return pa.num - pb.num;
  }

  // Resource type labels
  const resourceLabels = {
    claude_sub: 'Claude Subscription',
    anthropic_api: 'Anthropic API',
    none: 'Manual Task',
    tbc: 'To Be Confirmed'
  };

  const handleCopyPromptGuide = async () => {
    const textToCopy = isEditingPromptGuide ? editedPromptGuide : card.prompt_guide;
    if (!textToCopy) return;

    try {
      await copyText(textToCopy);
      setPromptGuideCopySuccess(true);
      setTimeout(() => setPromptGuideCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy prompt guide:', error);
    }
  };

  const handleEditPromptGuide = () => {
    setEditedPromptGuide(card.prompt_guide || '');
    setIsEditingPromptGuide(true);
    setPromptGuideSaveError(null);
  };

  const handleCancelEditPromptGuide = () => {
    setIsEditingPromptGuide(false);
    setEditedPromptGuide('');
    setPromptGuideSaveError(null);
  };

  const handleSavePromptGuide = async () => {
    try {
      setPromptGuideSaveError(null);
      await window.electron.updateCardPrompt(card.id, { prompt_guide: editedPromptGuide });
      setIsEditingPromptGuide(false);
      setPromptGuideSaveSuccess(true);
      setTimeout(() => setPromptGuideSaveSuccess(false), 2000);
      // Refresh card data in parent component
      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save prompt guide:', error);
      setPromptGuideSaveError(error.message || 'Failed to save');
    }
  };

  const handleEditField = (field) => {
    setEditedFieldValue(card[field] || '');
    setEditingField(field);
    setFieldSaveError(null);
  };

  const handleCancelEditField = () => {
    setEditingField(null);
    setEditedFieldValue('');
    setFieldSaveError(null);
  };

  const handleSaveField = async () => {
    const field = editingField;
    if (!field) return;
    const value = field === 'title' ? editedFieldValue.trim() : editedFieldValue;
    if (field === 'title' && !value) {
      setFieldSaveError('Title cannot be empty');
      return;
    }
    try {
      setFieldSaveError(null);
      await window.electron.updateCardDetails(card.id, { [field]: value });
      setEditingField(null);
      setEditedFieldValue('');
      setFieldSaveSuccess(field);
      setTimeout(() => setFieldSaveSuccess(null), 2000);
      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save card details:', error);
      setFieldSaveError(error.message || 'Failed to save');
    }
  };

  const handleEditNotes = () => {
    setEditedNotes(card.notes || '');
    setIsEditingNotes(true);
    setNotesSaveError(null);
  };

  const handleCancelEditNotes = () => {
    setIsEditingNotes(false);
    setEditedNotes('');
    setNotesSaveError(null);
  };

  const handleSaveNotes = async () => {
    try {
      setNotesSaveError(null);
      await window.electron.updateCardNotes(card.id, editedNotes);
      setIsEditingNotes(false);
      setNotesSaveSuccess(true);
      setTimeout(() => setNotesSaveSuccess(false), 2000);
      // Refresh card data in parent component
      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
      setNotesSaveError(error.message || 'Failed to save');
    }
  };

  // Cross-project dependency editing. The project picker is populated from the
  // database rather than free text: a mistyped slug passes validation and then
  // silently links to nothing.
  // Load the target project's cards so the letter can be picked rather than typed.
  const loadCardsForProject = async (slug, projects) => {
    if (!slug) return;
    const list = projects || availableProjects;
    const target = list.find(pr => pr.slug === slug);
    if (!target) return;

    setProjectCardsBySlug(prev => (prev[slug] ? prev : { ...prev, [slug]: 'loading' }));
    try {
      const full = await window.electron.getProject(target.id);
      const cards = [];
      for (const phase of full.phases || []) {
        for (const sub of phase.subphases || []) {
          for (const c of sub.cards || []) {
            cards.push({ session_letter: c.session_letter, title: c.title, status: c.status });
          }
        }
      }
      cards.sort((a, b) => compareLetters(a.session_letter, b.session_letter));
      setProjectCardsBySlug(prev => ({ ...prev, [slug]: cards }));

      // A stored letter that isn't in the target project drops to free text so it
      // stays visible and editable - it may legitimately not exist yet.
      const known = new Set(cards.map(c => c.session_letter));
      setEditedExtDeps(prev => prev.map(dep => (
        dep.project_slug === slug && dep.card_letter && !known.has(dep.card_letter)
          ? { ...dep, manual: true }
          : dep
      )));
    } catch (error) {
      console.error('Failed to load cards for project:', error);
      setProjectCardsBySlug(prev => ({ ...prev, [slug]: [] }));
    }
  };

  // Every card on this board, keyed by stored session letter - feeds the
  // same-board picker and the status shown against each dependency
  const boardCardsByLetter = new Map();
  for (const phase of project?.phases || []) {
    for (const sub of phase.subphases || []) {
      for (const c of sub.cards || []) boardCardsByLetter.set(c.session_letter, c);
    }
  }

  const handleEditDeps = () => {
    setDepsSaveError(null);
    setEditedDeps([...(card.depends_on_cards || [])]);
    setIsEditingDeps(true);
  };

  const handleCancelEditDeps = () => {
    setIsEditingDeps(false);
    setEditedDeps([]);
    setDepsSaveError(null);
  };

  const handleAddDep = (letter) => {
    if (!letter) return;
    setEditedDeps(prev => (prev.includes(letter) ? prev : [...prev, letter]));
  };

  const handleRemoveDep = (letter) => {
    setEditedDeps(prev => prev.filter(l => l !== letter));
  };

  const handleSaveDeps = async () => {
    try {
      setDepsSaveError(null);
      // Self-reference, unknown letters and cycles are all refused by
      // updateCardDependsOnCards; its message names the loop
      await window.electron.updateCardDependsOnCards(card.id, editedDeps);
      setIsEditingDeps(false);
      setEditedDeps([]);
      setDepsSaveSuccess(true);
      setTimeout(() => setDepsSaveSuccess(false), 2000);

      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save dependencies:', error);
      // Strip the data layer's "Failed to update card dependencies: " prefix
      const message = (error.message || 'Failed to save').replace(/^.*Failed to update card dependencies: /, '');
      setDepsSaveError(message);
    }
  };

  const handleEditExtDeps = async () => {
    setExtDepsSaveError(null);
    const rows = (card.external_dependencies || []).map(dep => ({
      project_slug: dep.project_slug || '',
      card_letter: dep.card_letter || '',
      description: dep.description || '',
      manual: false,
    }));
    setEditedExtDeps(rows);
    setIsEditingExtDeps(true);

    try {
      const projects = await window.electron.getAllProjects();
      setAvailableProjects(projects || []);
      // Prefetch cards for the projects already referenced
      const slugs = [...new Set(rows.map(r => r.project_slug).filter(Boolean))];
      await Promise.all(slugs.map(slug => loadCardsForProject(slug, projects || [])));
    } catch (error) {
      console.error('Failed to load projects:', error);
      setExtDepsSaveError('Could not load the project list');
    }
  };

  const handleCancelEditExtDeps = () => {
    setIsEditingExtDeps(false);
    setEditedExtDeps([]);
    setExtDepsSaveError(null);
  };

  const handleExtDepChange = (index, field, value) => {
    setEditedExtDeps(prev => prev.map((dep, i) => (
      i === index ? { ...dep, [field]: value } : dep
    )));
  };

  const handleExtDepProjectChange = (index, slug) => {
    // The old letter belongs to the old project, so clear it
    setEditedExtDeps(prev => prev.map((dep, i) => (
      i === index ? { ...dep, project_slug: slug, card_letter: '', manual: false } : dep
    )));
    loadCardsForProject(slug);
  };

  const handleToggleManualLetter = (index, manual) => {
    setEditedExtDeps(prev => prev.map((dep, i) => (
      i === index ? { ...dep, manual, card_letter: manual ? dep.card_letter : '' } : dep
    )));
  };

  const handleAddExtDep = () => {
    setEditedExtDeps(prev => [...prev, { project_slug: '', card_letter: '', description: '', manual: false }]);
  };

  const handleRemoveExtDep = (index) => {
    setEditedExtDeps(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveExtDeps = async () => {
    try {
      setExtDepsSaveError(null);

      // Catch blanks here so the user sees which row is wrong, rather than the
      // data layer's positional "external_dependencies[2]..." message
      for (let i = 0; i < editedExtDeps.length; i++) {
        const dep = editedExtDeps[i];
        if (!dep.project_slug) {
          setExtDepsSaveError(`Dependency ${i + 1}: choose a project`);
          return;
        }
        if (!String(dep.card_letter).trim()) {
          setExtDepsSaveError(`Dependency ${i + 1}: enter a session letter`);
          return;
        }
      }

      // normalizeExternalDependencies in the data layer does the rest: trims,
      // uppercases card_letter, and strips computed fields. `manual` is a
      // UI-only flag, dropped here rather than relying on the normaliser.
      const toSave = editedExtDeps.map(dep => ({
        project_slug: dep.project_slug,
        card_letter: dep.card_letter,
        description: dep.description,
      }));
      await window.electron.updateCardExternalDependencies(card.id, toSave);
      setIsEditingExtDeps(false);
      setEditedExtDeps([]);
      setExtDepsSaveSuccess(true);
      setTimeout(() => setExtDepsSaveSuccess(false), 2000);

      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save external dependencies:', error);
      setExtDepsSaveError(error.message || 'Failed to save');
    }
  };

  const handleCopyCommitMessage = async () => {
    const textToCopy = isEditingCommitMessage ? editedCommitMessage : card.git_commit_message;
    if (!textToCopy) return;

    try {
      await copyText(textToCopy);
      setCommitMessageCopySuccess(true);
      setTimeout(() => setCommitMessageCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy commit message:', error);
    }
  };

  const handleEditCommitMessage = () => {
    setEditedCommitMessage(card.git_commit_message || '');
    setIsEditingCommitMessage(true);
    setCommitMessageSaveError(null);
  };

  const handleCancelEditCommitMessage = () => {
    setIsEditingCommitMessage(false);
    setEditedCommitMessage('');
    setCommitMessageSaveError(null);
  };

  const handleSaveCommitMessage = async () => {
    try {
      setCommitMessageSaveError(null);
      await window.electron.updateCardPrompt(card.id, { git_commit_message: editedCommitMessage });
      setIsEditingCommitMessage(false);
      setCommitMessageSaveSuccess(true);
      setTimeout(() => setCommitMessageSaveSuccess(false), 2000);
      if (onCardUpdated) {
        await onCardUpdated(card.id);
      }
    } catch (error) {
      console.error('Failed to save commit message:', error);
      setCommitMessageSaveError(error.message || 'Failed to save');
    }
  };

  // Start a Not Started card: move it to In Progress and close the view - the
  // card closing is the confirmation. "Start Session" (an engineer card with a
  // prompt) copies the prompt first and moves only if the copy succeeded: a
  // failed copy leaves the card open and Not Started, since moving it would
  // record a session that never began. "Mark as Started" (manual and TBC
  // cards) has no prompt and touches no clipboard. Either way a failed move
  // leaves the card open with a message rather than hiding the failure
  // behind a closed card.
  const handleStartSession = async () => {
    const copiesPrompt = !isManual && !isTBC;
    if (copiesPrompt) {
      const prompt = card.prompt_guide || '';
      if (!prompt) return;

      // copyText reports failure by returning false rather than throwing (on the
      // Pi's plain-HTTP board it takes the legacy execCommand path)
      let copied = false;
      try {
        copied = await copyText(prompt);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
      if (!copied) {
        setSessionNotification('Failed to copy prompt - please copy manually');
        setTimeout(() => setSessionNotification(null), 5000);
        return;
      }
    }

    // onStatusChange resolves true once the new status is stored
    let moved = false;
    try {
      moved = onStatusChange ? await onStatusChange(card.id, 'In Progress') : false;
    } catch (error) {
      console.error('Failed to update card status:', error);
    }
    if (!moved) {
      setSessionNotification(copiesPrompt
        ? 'Prompt copied, but the card could not be moved to In Progress - move it by hand'
        : 'The card could not be moved to In Progress - move it by hand');
      return;
    }

    onClose();
  };

  const handleMarkDone = () => {
    if (onMarkDone) {
      onMarkDone(card.id);
    }
  };

  const handleExpandPlan = () => {
    if (onExpandPlan) {
      onExpandPlan(card.id);
    }
  };

  const getDependentCards = () => {
    if (!project || !card) return [];
    const allCards = [];
    for (const phase of project.phases || []) {
      for (const sub of phase.subphases || []) {
        allCards.push(...(sub.cards || []));
      }
    }
    return allCards.filter(c => {
      try {
        const deps = Array.isArray(c.depends_on_cards)
          ? c.depends_on_cards
          : JSON.parse(c.depends_on_cards || '[]');
        return deps.includes(card.session_letter);
      } catch { return false; }
    });
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await window.electron.deleteCard(card.id);
      setShowDeleteConfirm(false);
      onCardDeleted(card.id);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete card');
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 transition-opacity" />

      {/* Centered Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className="w-full max-w-3xl max-h-[90vh] bg-dark-surface border border-dark-border rounded-xl shadow-2xl flex flex-col transform transition-all duration-200 ease-out"
          style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? 'scale(1)' : 'scale(0.95)' }}
        >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-dark-border">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-3 mb-2">
              {/* Session Letter Badge */}
              <div className={`
                flex-shrink-0 w-10 h-10 rounded flex items-center justify-center font-bold text-lg
                ${card.status === 'Done' ? 'bg-green-700 text-white' : 'bg-dark-bg text-dark-text'}
              `}>
                {card.status === 'Done' ? '✓' : card.session_letter}
              </div>
              {editingField === 'title' ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editedFieldValue}
                    onChange={(e) => setEditedFieldValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveField();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        handleCancelEditField();
                      }
                    }}
                    className="flex-1 px-2 py-1 bg-dark-bg border border-blue-500 rounded text-xl font-bold text-dark-text focus:outline-none"
                    placeholder="Card title..."
                    autoFocus
                  />
                  <button
                    onClick={handleCancelEditField}
                    className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveField}
                    className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-dark-text">{card.title}</h2>
                  <button
                    onClick={() => handleEditField('title')}
                    className="flex-shrink-0 p-1 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
                    title="Edit title"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  {fieldSaveSuccess === 'title' && (
                    <span className="text-xs text-green-400">Saved!</span>
                  )}
                </>
              )}
            </div>
            {editingField === 'title' && fieldSaveError && (
              <div className="mb-2 text-xs text-red-400">{fieldSaveError}</div>
            )}

            {/* Status and Resource Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`
                text-xs px-2 py-1 rounded-full
                ${card.status === 'Not Started' ? 'bg-gray-700 text-gray-300' : ''}
                ${card.status === 'In Progress' ? 'bg-blue-700 text-blue-200' : ''}
                ${card.status === 'Done' ? 'bg-green-700 text-green-200' : ''}
              `}>
                {card.status}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-dark-bg text-dark-text-secondary">
                {resourceLabels[card.resource] || card.resource}
              </span>
              {card.complexity && (
                <span className={`
                  text-xs px-2 py-1 rounded
                  ${card.complexity === 'low' ? 'bg-green-900 text-green-300' : ''}
                  ${card.complexity === 'medium' ? 'bg-yellow-900 text-yellow-300' : ''}
                  ${card.complexity === 'high' ? 'bg-red-900 text-red-300' : ''}
                `}>
                  {card.complexity} complexity
                </span>
              )}
            </div>
          </div>

          {/* Delete Button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-shrink-0 p-2 rounded hover:bg-red-900/40 text-dark-text-secondary hover:text-red-400 transition-colors mr-1"
            title="Delete card"
          >
            <span className="text-lg">🗑</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Close (Esc)"
          >
            <span className="text-xl">x</span>
          </button>
        </div>

        {/* Start Session failure (on success the view closes instead) */}
        {sessionNotification && (
          <div className="mx-6 mt-4 p-3 bg-red-900/50 border border-red-600 rounded-lg flex items-center gap-2">
            <span className="text-red-400">!</span>
            <span className="text-red-200 text-sm">{sessionNotification}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-dark p-6 space-y-6">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-text-secondary">Description</h3>
                {fieldSaveSuccess === 'description' && (
                  <span className="text-xs text-green-400">Saved!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingField === 'description' ? (
                  <>
                    <button
                      onClick={handleCancelEditField}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveField}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleEditField('description')}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                    title={card.description ? 'Edit description' : 'Add description'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{card.description ? 'Edit' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>
            {editingField === 'description' && fieldSaveError && (
              <div className="mb-2 text-xs text-red-400">{fieldSaveError}</div>
            )}
            {editingField === 'description' ? (
              <textarea
                value={editedFieldValue}
                onChange={(e) => setEditedFieldValue(e.target.value)}
                className="w-full h-32 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-dark-text resize-none focus:outline-none scrollbar-dark"
                placeholder="Describe what this card involves..."
                autoFocus
              />
            ) : card.description ? (
              <p className="text-sm text-dark-text whitespace-pre-wrap bg-dark-bg p-3 rounded">
                {card.description}
              </p>
            ) : (
              <p className="text-sm text-dark-text-secondary italic bg-dark-bg p-3 rounded">
                No description
              </p>
            )}
          </div>

          {/* Success Criteria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-text-secondary">Success Criteria</h3>
                {fieldSaveSuccess === 'success_criteria' && (
                  <span className="text-xs text-green-400">Saved!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingField === 'success_criteria' ? (
                  <>
                    <button
                      onClick={handleCancelEditField}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveField}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleEditField('success_criteria')}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                    title={card.success_criteria ? 'Edit success criteria' : 'Add success criteria'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{card.success_criteria ? 'Edit' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>
            {editingField === 'success_criteria' && fieldSaveError && (
              <div className="mb-2 text-xs text-red-400">{fieldSaveError}</div>
            )}
            {editingField === 'success_criteria' ? (
              <textarea
                value={editedFieldValue}
                onChange={(e) => setEditedFieldValue(e.target.value)}
                className="w-full h-32 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-dark-text resize-none focus:outline-none scrollbar-dark"
                placeholder="How will you know this card is done?"
                autoFocus
              />
            ) : card.success_criteria ? (
              <p className="text-sm text-dark-text whitespace-pre-wrap bg-dark-bg p-3 rounded">
                {card.success_criteria}
              </p>
            ) : (
              <p className="text-sm text-dark-text-secondary italic bg-dark-bg p-3 rounded">
                No success criteria
              </p>
            )}
          </div>

          {/* Dependencies - one panel, two lists: same-board above, external
              below. The two letter inputs differ on purpose: a same-board
              letter that does not exist always blocks the card forever, so
              it is picked from real cards only; an external link may point at
              a project not imported yet, so that editor keeps a free-text
              fallback. Do not harmonise them. */}
          <div className="border border-dark-border rounded-lg p-4 space-y-5">
          <h3 className="text-sm font-semibold text-dark-text">Dependencies</h3>

          {/* Same-board dependencies - editing follows the same pattern as Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-text-secondary">This Board</h3>
                {depsSaveSuccess && (
                  <span className="text-xs text-green-400">Saved!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditingDeps ? (
                  <>
                    <button
                      onClick={handleCancelEditDeps}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDeps}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEditDeps}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                    title={card.depends_on_cards?.length ? 'Edit dependencies on this board' : 'Add a dependency on another card'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{card.depends_on_cards?.length ? 'Edit' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>

            {depsSaveError && (
              <div className="mb-2 text-xs text-red-400">{depsSaveError}</div>
            )}

            {(() => {
              const letters = isEditingDeps ? editedDeps : (card.depends_on_cards || []);

              const rows = letters.map(letter => {
                const target = boardCardsByLetter.get(letter);
                // A dependency on a Done card is legal and already satisfied
                const tone = !target
                  ? { box: 'bg-red-900/25 border-red-600', badge: 'bg-red-700 text-red-100', label: 'no such card' }
                  : target.status === 'Done'
                    ? { box: 'bg-green-900/20 border-green-700/60', badge: 'bg-green-700 text-green-100', label: 'Done - satisfied' }
                    : { box: 'bg-amber-900/20 border-amber-700/60', badge: 'bg-amber-700 text-amber-100', label: target.status };

                return (
                  <div key={letter} className={`text-sm px-3 py-2 rounded border ${tone.box}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-dark-text min-w-0 truncate">
                        Session {letter}
                        {target && <span className="text-dark-text-secondary"> · {target.title}</span>}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tone.badge}`}>
                          {tone.label}
                        </span>
                        {isEditingDeps && (
                          <button
                            onClick={() => handleRemoveDep(letter)}
                            className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 border border-red-700 text-red-300 hover:bg-red-900/70 transition-colors"
                            title="Remove this dependency"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {!target && (
                      <p className="text-red-300 mt-1 text-xs">
                        This board has no card {letter}, so this card stays blocked - remove it.
                      </p>
                    )}
                  </div>
                );
              });

              if (!isEditingDeps) {
                return rows.length > 0 ? (
                  <div className="space-y-2">{rows}</div>
                ) : (
                  <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                    <p className="text-sm text-dark-text-secondary italic">No dependencies on this board</p>
                  </div>
                );
              }

              // Picker: this project's other cards, never free text
              const candidates = [...boardCardsByLetter.values()]
                .filter(c => c.id !== card.id && !editedDeps.includes(c.session_letter))
                .sort((a, b) => compareLetters(a.session_letter, b.session_letter));

              return (
                <div className="space-y-2">
                  {rows.length === 0 && (
                    <p className="text-sm text-dark-text-secondary italic px-3 py-2 bg-dark-bg border border-dark-border rounded-lg">
                      No dependencies on this board - add one below
                    </p>
                  )}
                  {rows}
                  <select
                    value=""
                    onChange={(e) => handleAddDep(e.target.value)}
                    disabled={candidates.length === 0}
                    className="w-full px-2 py-1 bg-dark-bg border border-blue-500/60 rounded text-sm text-dark-text focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="">
                      {candidates.length === 0 ? 'No other cards to depend on' : '+ Add dependency on...'}
                    </option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.session_letter}>
                        {c.session_letter} - {c.title} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
          </div>

          {/* External (cross-project) Dependencies - always rendered so a first
              link can be added; editing follows the same pattern as Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-text-secondary flex items-center gap-1">
                  <span>🔗</span> External Dependencies
                </h3>
                {extDepsSaveSuccess && (
                  <span className="text-xs text-green-400">Saved!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditingExtDeps ? (
                  <>
                    <button
                      onClick={handleCancelEditExtDeps}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveExtDeps}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEditExtDeps}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                    title={hasExternalDeps ? "Edit external dependencies" : "Add an external dependency"}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{hasExternalDeps ? 'Edit' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>

            {extDepsSaveError && (
              <div className="mb-2 text-xs text-red-400">{extDepsSaveError}</div>
            )}

            {isEditingExtDeps ? (
              <div className="space-y-2">
                {editedExtDeps.length === 0 && (
                  <p className="text-sm text-dark-text-secondary italic px-3 py-2 bg-dark-bg border border-dark-border rounded-lg">
                    No external dependencies - add one below
                  </p>
                )}
                {editedExtDeps.map((dep, idx) => {
                  const targetCards = dep.project_slug ? projectCardsBySlug[dep.project_slug] : null;
                  const cardsLoading = targetCards === 'loading';
                  const cardsReady = Array.isArray(targetCards);
                  const usePicker = cardsReady && targetCards.length > 0 && !dep.manual;

                  return (
                    <div key={idx} className="p-3 bg-dark-bg border border-blue-500/60 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={dep.project_slug}
                          onChange={(e) => handleExtDepProjectChange(idx, e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm text-dark-text focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select project...</option>
                          {availableProjects
                            .filter(pr => !project || pr.id !== project.id)
                            .map(pr => (
                              <option key={pr.id} value={pr.slug}>{pr.name}</option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleRemoveExtDep(idx)}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-900/40 border border-red-700 text-red-300 hover:bg-red-900/70 transition-colors flex-shrink-0"
                          title="Remove this dependency"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Letter: picked from the target project's real cards where
                          possible, free text only as a deliberate fallback */}
                      {!dep.project_slug ? (
                        <p className="text-xs text-dark-text-secondary italic">
                          Choose a project to pick its card
                        </p>
                      ) : cardsLoading ? (
                        <p className="text-xs text-dark-text-secondary italic">Loading cards...</p>
                      ) : usePicker ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={dep.card_letter}
                            onChange={(e) => {
                              if (e.target.value === '__manual__') {
                                handleToggleManualLetter(idx, true);
                              } else {
                                handleExtDepChange(idx, 'card_letter', e.target.value);
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm text-dark-text focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Select card...</option>
                            {targetCards.map(c => (
                              <option key={c.session_letter} value={c.session_letter}>
                                {c.session_letter} - {c.title}{c.status === 'Done' ? ' (Done)' : ''}
                              </option>
                            ))}
                            <option value="__manual__">Other / not created yet...</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={dep.card_letter}
                            onChange={(e) => handleExtDepChange(idx, 'card_letter', e.target.value.toUpperCase())}
                            className="w-28 px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm text-dark-text font-bold uppercase focus:outline-none focus:border-blue-500"
                            placeholder="Letter"
                          />
                          <span className="text-xs text-dark-text-secondary">
                            {cardsReady && targetCards.length === 0
                              ? 'That project has no cards yet'
                              : 'Typing a letter that does not exist yet'}
                          </span>
                          {cardsReady && targetCards.length > 0 && (
                            <button
                              onClick={() => handleToggleManualLetter(idx, false)}
                              className="text-xs px-2 py-1 rounded font-medium bg-dark-surface border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                            >
                              Pick from list
                            </button>
                          )}
                        </div>
                      )}

                      <input
                        type="text"
                        value={dep.description}
                        onChange={(e) => handleExtDepChange(idx, 'description', e.target.value)}
                        className="w-full px-2 py-1 bg-dark-surface border border-dark-border rounded text-sm text-dark-text focus:outline-none focus:border-blue-500"
                        placeholder="Why this card depends on it (optional)"
                      />
                    </div>
                  );
                })}
                <button
                  onClick={handleAddExtDep}
                  className="text-xs px-3 py-1.5 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                >
                  + Add dependency
                </button>
              </div>
            ) : hasExternalDeps ? (
              <div className="space-y-2">
                {card.external_dependencies.map((dep, idx) => {
                  // Four distinct states. The two unresolved-and-not-blocking ones
                  // must NOT look alike: a project that has not been imported yet is
                  // a legitimate forward reference, whereas a missing card inside a
                  // project that IS imported is almost always a mistyped letter.
                  const projectMissing = !dep.project_name;
                  const cardMissing = !projectMissing && !dep.status;

                  const tone = dep.resolved
                    ? {
                        box: 'bg-green-900/20 border-green-700/60',
                        badge: 'bg-green-700 text-green-100',
                        label: 'Resolved',
                      }
                    : projectMissing
                      ? {
                          box: 'bg-slate-800/40 border-slate-600 border-dashed',
                          badge: 'bg-slate-600 text-slate-100',
                          label: 'project not imported yet',
                        }
                      : cardMissing
                        ? {
                            box: 'bg-red-900/25 border-red-600',
                            badge: 'bg-red-700 text-red-100',
                            label: 'no such card',
                          }
                        : {
                            box: 'bg-amber-900/20 border-amber-700/60',
                            badge: 'bg-amber-700 text-amber-100',
                            label: dep.status,
                          };

                  return (
                    <div key={idx} className={`text-sm px-3 py-2 rounded border ${tone.box}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-dark-text">
                          {dep.project_name || dep.project_slug}
                          <span className="text-dark-text-secondary"> · Session {dep.card_letter}</span>
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${tone.badge}`}>
                          {tone.label}
                        </span>
                      </div>
                      {cardMissing && (
                        <p className="text-red-300 mt-1 text-xs">
                          {dep.project_name} has no card {dep.card_letter} - check the letter.
                        </p>
                      )}
                      {projectMissing && (
                        <p className="text-slate-400 mt-1 text-xs">
                          Waiting for "{dep.project_slug}" to be imported.
                        </p>
                      )}
                      {dep.description && (
                        <p className="text-dark-text-secondary mt-1">{dep.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <p className="text-sm text-dark-text-secondary italic">No external dependencies</p>
              </div>
            )}
          </div>

          </div>

          {/* Claude Code Prompt (prompt_guide) - for every non-manual card. An
              empty one shows an "Add prompt" way into the editor; the editor's
              placeholder is never stored, so a prompt-less card keeps offering
              neither Copy nor Start Session. */}
          {!isManual && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-dark-text-secondary">Claude Code Prompt</h3>
                  {promptGuideSaveSuccess && (
                    <span className="text-xs text-green-400">Saved!</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditingPromptGuide ? (
                    <>
                      <button
                        onClick={handleCancelEditPromptGuide}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSavePromptGuide}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        Save
                      </button>
                    </>
                  ) : hasPromptGuide && (
                    <>
                      <button
                        onClick={handleEditPromptGuide}
                        className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                        title="Edit prompt"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCopyPromptGuide}
                        className={`
                          text-xs px-3 py-1 rounded font-medium transition-colors
                          ${promptGuideCopySuccess
                            ? 'bg-green-700 text-white'
                            : 'bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text'}
                        `}
                      >
                        {promptGuideCopySuccess ? 'Copied!' : 'Copy'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {promptGuideSaveError && (
                <div className="mb-2 text-xs text-red-400">{promptGuideSaveError}</div>
              )}
              {isEditingPromptGuide ? (
                <textarea
                  value={editedPromptGuide}
                  onChange={(e) => setEditedPromptGuide(e.target.value)}
                  className="w-full h-64 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-dark-text font-mono resize-none focus:outline-none scrollbar-dark"
                  placeholder="The prompt to paste into a Claude Code session for this card..."
                  autoFocus
                />
              ) : hasPromptGuide ? (
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3 max-h-64 overflow-y-auto scrollbar-dark">
                  <pre className="text-sm text-dark-text whitespace-pre-wrap font-mono">{card.prompt_guide}</pre>
                </div>
              ) : (
                <div className="bg-dark-bg border border-dashed border-dark-border rounded-lg p-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-dark-text-secondary italic">No prompt yet</p>
                  <button
                    onClick={handleEditPromptGuide}
                    className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Add prompt
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Commit Message (git_commit_message) - only for non-manual cards */}
          {!isManual && (isEditingCommitMessage || (card.git_commit_message && card.git_commit_message.trim() !== '')) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-dark-text-secondary">Commit Message</h3>
                  {commitMessageSaveSuccess && (
                    <span className="text-xs text-green-400">Saved!</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditingCommitMessage ? (
                    <>
                      <button
                        onClick={handleCancelEditCommitMessage}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveCommitMessage}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleEditCommitMessage}
                        className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                        title="Edit commit message"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCopyCommitMessage}
                        className={`
                          text-xs px-3 py-1 rounded font-medium transition-colors
                          ${commitMessageCopySuccess
                            ? 'bg-green-700 text-white'
                            : 'bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text'}
                        `}
                      >
                        {commitMessageCopySuccess ? 'Copied!' : 'Copy'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {commitMessageSaveError && (
                <div className="mb-2 text-xs text-red-400">{commitMessageSaveError}</div>
              )}
              {isEditingCommitMessage ? (
                <textarea
                  value={editedCommitMessage}
                  onChange={(e) => setEditedCommitMessage(e.target.value)}
                  className="w-full h-24 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-green-400 font-mono resize-none focus:outline-none scrollbar-dark"
                  placeholder="Enter commit message..."
                  autoFocus
                />
              ) : (
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <code className="text-sm text-green-400 whitespace-pre-wrap">{card.git_commit_message}</code>
                </div>
              )}
            </div>
          )}

          {/* Notes Section - visible for all cards, prominent for Done cards */}
          <div className={`${card.status === 'Done' ? 'bg-green-900/10 border border-green-800 rounded-lg p-4' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${card.status === 'Done' ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                  Notes
                </h3>
                {notesSaveSuccess && (
                  <span className="text-xs text-green-400">Saved!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditingNotes ? (
                  <>
                    <button
                      onClick={handleCancelEditNotes}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEditNotes}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                    title={card.notes ? "Edit notes" : "Add notes"}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{card.notes ? 'Edit' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>
            {notesSaveError && (
              <div className="mb-2 text-xs text-red-400">{notesSaveError}</div>
            )}
            {isEditingNotes ? (
              <textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                className="w-full h-32 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-dark-text resize-none focus:outline-none scrollbar-dark"
                placeholder="Record what was built, decisions made, or anything to remember..."
                autoFocus
              />
            ) : (
              <div className={`bg-dark-bg border border-dark-border rounded-lg p-3 ${!card.notes ? 'min-h-[60px] flex items-center justify-center' : ''}`}>
                {card.notes ? (
                  <p className="text-sm text-dark-text whitespace-pre-wrap">{card.notes}</p>
                ) : (
                  <p className="text-sm text-dark-text-secondary italic">No notes</p>
                )}
              </div>
            )}
          </div>

          {/* Manual Card Guidance */}
          {isManual && (
            <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                  <span>@</span> Manual Task Guidance
                </h3>
                <div className="flex items-center gap-2">
                  {promptGuideSaveSuccess && (
                    <span className="text-xs text-green-400">Saved!</span>
                  )}
                  {isEditingPromptGuide ? (
                    <>
                      <button
                        onClick={handleCancelEditPromptGuide}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSavePromptGuide}
                        className="text-xs px-3 py-1 rounded font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleEditPromptGuide}
                        className="text-xs px-2 py-1 rounded font-medium transition-colors bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text flex items-center gap-1"
                        title={card.prompt_guide ? "Edit guidance" : "Add guidance"}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>{card.prompt_guide ? 'Edit' : 'Add'}</span>
                      </button>
                      {card.prompt_guide && (
                        <button
                          onClick={handleCopyPromptGuide}
                          className={`
                            text-xs px-3 py-1 rounded font-medium transition-colors
                            ${promptGuideCopySuccess
                              ? 'bg-green-700 text-white'
                              : 'bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text'}
                          `}
                        >
                          {promptGuideCopySuccess ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {promptGuideSaveError && (
                <div className="mb-2 text-xs text-red-400">{promptGuideSaveError}</div>
              )}
              <p className="text-sm text-dark-text mb-3">
                This task requires manual action and cannot be automated with Claude Code.
              </p>
              {isEditingPromptGuide ? (
                <textarea
                  value={editedPromptGuide}
                  onChange={(e) => setEditedPromptGuide(e.target.value)}
                  className="w-full h-48 p-3 bg-dark-bg border border-blue-500 rounded-lg text-sm text-dark-text font-mono resize-none focus:outline-none scrollbar-dark"
                  placeholder="Enter task guidance or instructions..."
                  autoFocus
                />
              ) : card.prompt_guide ? (
                <div className="bg-dark-bg p-3 rounded">
                  <p className="text-sm text-dark-text whitespace-pre-wrap">{card.prompt_guide}</p>
                </div>
              ) : (
                <p className="text-sm text-dark-text-secondary italic">
                  No specific guidance provided. Review the description and success criteria above.
                </p>
              )}
            </div>
          )}

          {/* TBC Card Guidance */}
          {isTBC && (
            <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-orange-300 mb-2 flex items-center gap-2">
                <span>?</span> Task Needs Planning
              </h3>
              <p className="text-sm text-dark-text mb-4">
                This task hasn't been fully planned yet. Use the button below to expand this card into detailed sub-tasks.
              </p>
              <button
                onClick={handleExpandPlan}
                className="w-full px-4 py-3 bg-orange-700 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>+</span> Expand & Plan
              </button>
            </div>
          )}

        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (() => {
          const dependents = getDependentCards();
          return (
            <div className="flex-shrink-0 p-6 border-t border-red-800 bg-red-950/30">
              <p className="text-white font-semibold mb-1">
                Delete Session {card.session_letter}: {card.title}?
              </p>
              <p className="text-sm text-dark-text-secondary mb-3">This cannot be undone.</p>

              {card.status === 'In Progress' && (
                <p className="text-sm text-yellow-400 mb-2">⚠ This card is currently in progress.</p>
              )}
              {card.status === 'Done' && (
                <p className="text-sm text-yellow-400 mb-2">⚠ This card is marked complete. Deleting may affect project history.</p>
              )}
              {dependents.length > 0 && (
                <p className="text-sm text-blue-300 mb-3">
                  Note: {dependents.length} card(s) depend on this card and will be unblocked: {dependents.map(d => d.session_letter).join(', ')}
                </p>
              )}

              {deleteError && (
                <p className="text-sm text-red-400 mb-2">{deleteError}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Footer Actions */}
        <div className="flex-shrink-0 p-6 border-t border-dark-border bg-dark-surface rounded-b-xl">
          <div className="flex flex-wrap gap-3">
            {/* One-click start, only on a Not Started card: "Start Session" for
                an engineer card with a prompt (an engineer card with an empty
                prompt gets none - starting it is a mistake worth noticing),
                "Mark as Started" for manual and TBC cards */}
            {card.status === 'Not Started' && (isManual || isTBC || hasPromptGuide) && (
              <button
                onClick={handleStartSession}
                className="flex-1 min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>&gt;</span> {isManual || isTBC ? 'Mark as Started' : 'Start Session'}
              </button>
            )}

            {/* Mark as Done */}
            {card.status !== 'Done' && (
              <button
                onClick={handleMarkDone}
                className="flex-1 min-w-[140px] px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>OK</span> Mark as Done
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default CardDetail;
