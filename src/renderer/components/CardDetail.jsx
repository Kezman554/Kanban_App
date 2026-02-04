import React, { useState, useEffect, useRef } from 'react';
import { generatePrompt } from '../services/promptGenerator.js';
import { useTerminalSessions } from '../contexts/TerminalSessionContext.jsx';

const CardDetail = ({ card, isOpen, onClose, onMarkDone, onExpandPlan, onStatusChange, onCardUpdated, project }) => {
  const [generatedPrompt, setGeneratedPrompt] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [promptGuideCopySuccess, setPromptGuideCopySuccess] = useState(false);
  const [commitMessageCopySuccess, setCommitMessageCopySuccess] = useState(false);
  const [isEditingPromptGuide, setIsEditingPromptGuide] = useState(false);
  const [editedPromptGuide, setEditedPromptGuide] = useState('');
  const [promptGuideSaveSuccess, setPromptGuideSaveSuccess] = useState(false);
  const [promptGuideSaveError, setPromptGuideSaveError] = useState(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');
  const [notesSaveSuccess, setNotesSaveSuccess] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState(null);
  const [sessionNotification, setSessionNotification] = useState(null);
  const panelRef = useRef(null);

  // Terminal session context
  const {
    hasActiveSession,
    getSession,
    createSession,
    switchToSession,
    closeSession,
  } = useTerminalSessions();

  // Check if this card has an active terminal
  const cardHasTerminal = card ? hasActiveSession(card.id) : false;
  const terminalSession = card ? getSession(card.id) : null;
  const isTerminalRunning = terminalSession?.status === 'running';
  const terminalExitCode = terminalSession?.exitCode;

  // Progress notes state (only shown after terminal exits)
  const [progressNotes, setProgressNotes] = useState('');
  const [tempPromptFile, setTempPromptFile] = useState(null);

  // Reset state when card changes
  useEffect(() => {
    setGeneratedPrompt(null);
    setIsGenerating(false);
    setGenerateError(null);
    setIsEditing(false);
    setEditedPrompt('');
    setCopySuccess(false);
    setPromptGuideCopySuccess(false);
    setCommitMessageCopySuccess(false);
    setSessionNotification(null);
    setProgressNotes('');
    setIsEditingPromptGuide(false);
    setEditedPromptGuide('');
    setPromptGuideSaveSuccess(false);
    setPromptGuideSaveError(null);
    setIsEditingNotes(false);
    setEditedNotes('');
    setNotesSaveSuccess(false);
    setNotesSaveError(null);
    // Clean up any temp file from previous card
    if (tempPromptFile) {
      window.electron.deleteTempFile(tempPromptFile).catch(() => {});
      setTempPromptFile(null);
    }
  }, [card?.id]);

  // Clean up temp file on unmount
  useEffect(() => {
    return () => {
      if (tempPromptFile) {
        window.electron.deleteTempFile(tempPromptFile).catch(() => {});
      }
    };
  }, [tempPromptFile]);

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

  // Resource type labels
  const resourceLabels = {
    claude_sub: 'Claude Subscription',
    anthropic_api: 'Anthropic API',
    none: 'Manual Task',
    tbc: 'To Be Confirmed'
  };

  const handleGeneratePrompt = async () => {
    setIsGenerating(true);
    setGenerateError(null);

    try {
      // Get PRD content and progress from project if available
      const prdContent = project?.prd_content || '';
      const progress = project?.progress || null;

      const result = await generatePrompt({
        card,
        prdContent,
        progress
      });

      if (result.success) {
        setGeneratedPrompt({
          prompt: result.prompt,
          checkpoint: result.checkpoint,
          commitMessage: result.commitMessage
        });
        setEditedPrompt(result.prompt);
      } else {
        setGenerateError(result.error || 'Failed to generate prompt');
      }
    } catch (error) {
      setGenerateError(error.message || 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    const textToCopy = isEditing ? editedPrompt : (generatedPrompt?.prompt || '');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleCopyPromptGuide = async () => {
    const textToCopy = isEditingPromptGuide ? editedPromptGuide : card.prompt_guide;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
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

  const handleCopyCommitMessage = async () => {
    if (!card.git_commit_message) return;

    try {
      await navigator.clipboard.writeText(card.git_commit_message);
      setCommitMessageCopySuccess(true);
      setTimeout(() => setCommitMessageCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy commit message:', error);
    }
  };

  const handleStartSession = async () => {
    const prompt = isEditing ? editedPrompt : (generatedPrompt?.prompt || '');
    if (!prompt) return;

    // Copy prompt to clipboard
    try {
      await navigator.clipboard.writeText(prompt);
      setSessionNotification('Prompt copied to clipboard - paste into your terminal');
      setTimeout(() => setSessionNotification(null), 5000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setSessionNotification('Failed to copy prompt - please copy manually');
      setTimeout(() => setSessionNotification(null), 5000);
    }

    // Move card to 'In Progress'
    if (onStatusChange && card.status !== 'In Progress') {
      try {
        await onStatusChange(card.id, 'In Progress');
      } catch (error) {
        console.error('Failed to update card status:', error);
      }
    }
  };

  const handleViewTerminal = () => {
    switchToSession(card.id);
  };

  const handleCloseTerminal = () => {
    closeSession(card.id);
    // Clean up temp file if exists
    if (tempPromptFile) {
      window.electron.deleteTempFile(tempPromptFile).catch(() => {});
      setTempPromptFile(null);
    }
  };

  const handleMarkDone = () => {
    if (onMarkDone) {
      // Pass progress notes if any
      onMarkDone(card.id, progressNotes.trim() || undefined);
    }
    // Close terminal session if exists
    if (cardHasTerminal) {
      closeSession(card.id);
    }
    setProgressNotes('');
  };

  const handleExpandPlan = () => {
    if (onExpandPlan) {
      onExpandPlan(card.id);
    }
  };

  const currentPrompt = isEditing ? editedPrompt : (generatedPrompt?.prompt || '');

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
              <h2 className="text-xl font-bold text-dark-text">{card.title}</h2>
            </div>

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
              {/* Active Terminal Badge */}
              {cardHasTerminal && (
                <span className={`
                  text-xs px-2 py-1 rounded flex items-center gap-1
                  ${isTerminalRunning ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}
                `}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isTerminalRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                  {isTerminalRunning ? 'Session Running' : 'Session Ended'}
                </span>
              )}
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Close (Esc)"
          >
            <span className="text-xl">x</span>
          </button>
        </div>

        {/* Session Start Notification */}
        {sessionNotification && (
          <div className="mx-6 mt-4 p-3 bg-green-900/50 border border-green-600 rounded-lg flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-green-200 text-sm">{sessionNotification}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-dark p-6 space-y-6">
          {/* Description */}
          {card.description && (
            <div>
              <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Description</h3>
              <p className="text-sm text-dark-text whitespace-pre-wrap bg-dark-bg p-3 rounded">
                {card.description}
              </p>
            </div>
          )}

          {/* Success Criteria */}
          {card.success_criteria && (
            <div>
              <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Success Criteria</h3>
              <p className="text-sm text-dark-text whitespace-pre-wrap bg-dark-bg p-3 rounded">
                {card.success_criteria}
              </p>
            </div>
          )}

          {/* Dependencies */}
          {card.depends_on_cards && card.depends_on_cards.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Dependencies</h3>
              <div className="flex gap-2 flex-wrap">
                {card.depends_on_cards.map((dep, idx) => (
                  <span
                    key={idx}
                    className="text-sm px-3 py-1 rounded bg-dark-bg text-dark-text border border-dark-border"
                  >
                    Session {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Claude Code Prompt (prompt_guide) - only for non-manual cards */}
          {(hasPromptGuide || isEditingPromptGuide) && !isManual && (
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
                  ) : (
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
                  placeholder="Enter prompt guide..."
                  autoFocus
                />
              ) : (
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3 max-h-64 overflow-y-auto scrollbar-dark">
                  <pre className="text-sm text-dark-text whitespace-pre-wrap font-mono">{card.prompt_guide}</pre>
                </div>
              )}
            </div>
          )}

          {/* Add Prompt Button - shown when no prompt exists for non-manual, non-TBC cards */}
          {!hasPromptGuide && !isEditingPromptGuide && !isManual && !isTBC && (
            <div>
              <button
                onClick={handleEditPromptGuide}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Claude Code Prompt
              </button>
            </div>
          )}

          {/* Commit Message (git_commit_message) - only for non-manual cards */}
          {!isManual && card.git_commit_message && card.git_commit_message.trim() !== '' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-dark-text-secondary">Commit Message</h3>
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
              </div>
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <code className="text-sm text-green-400 whitespace-pre-wrap">{card.git_commit_message}</code>
              </div>
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
              <h3 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                <span>@</span> Manual Task Guidance
              </h3>
              <p className="text-sm text-dark-text mb-3">
                This task requires manual action and cannot be automated with Claude Code.
              </p>
              {card.prompt_guide ? (
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

          {/* Prompt Section (for non-manual, non-TBC cards) */}
          {!isManual && !isTBC && (
            <div>
              <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Generated Prompt</h3>

              {/* Generate Button (if no generated prompt yet) */}
              {!generatedPrompt && (
                <div className="space-y-3">
                  <button
                    onClick={handleGeneratePrompt}
                    disabled={isGenerating}
                    className={`
                      w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                      ${isGenerating
                        ? 'bg-dark-border text-dark-text-secondary cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'}
                    `}
                  >
                    {isGenerating ? (
                      <>
                        <span className="animate-spin">...</span> Generating...
                      </>
                    ) : (
                      <>
                        <span>*</span> Generate Prompt
                      </>
                    )}
                  </button>

                  {generateError && (
                    <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
                      <p className="text-sm text-red-300">{generateError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Generated Prompt Display */}
              {generatedPrompt && (
                <div className="space-y-3">
                  {/* Edit Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEditing}
                        onChange={(e) => setIsEditing(e.target.checked)}
                        className="rounded border-dark-border bg-dark-bg text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-dark-text-secondary">Edit Prompt</span>
                    </label>
                    <button
                      onClick={() => {
                        setGeneratedPrompt(null);
                        setEditedPrompt('');
                        setIsEditing(false);
                      }}
                      className="text-xs text-dark-text-secondary hover:text-dark-text"
                    >
                      Regenerate
                    </button>
                  </div>

                  {/* Prompt Text Area */}
                  <div className="relative">
                    {isEditing ? (
                      <textarea
                        value={editedPrompt}
                        onChange={(e) => setEditedPrompt(e.target.value)}
                        className="w-full h-64 p-3 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text font-mono resize-none focus:outline-none focus:border-blue-500 scrollbar-dark"
                        placeholder="Edit the prompt..."
                      />
                    ) : (
                      <pre className="w-full h-64 p-3 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text font-mono whitespace-pre-wrap overflow-y-auto scrollbar-dark">
                        {currentPrompt}
                      </pre>
                    )}
                  </div>

                  {/* Checkpoint */}
                  {generatedPrompt.checkpoint && (
                    <div className="bg-dark-bg p-3 rounded border border-dark-border">
                      <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Checkpoint</h4>
                      <p className="text-sm text-dark-text whitespace-pre-wrap">{generatedPrompt.checkpoint}</p>
                    </div>
                  )}

                  {/* Commit Message */}
                  {generatedPrompt.commitMessage && (
                    <div className="bg-dark-bg p-3 rounded border border-dark-border">
                      <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Commit Message</h4>
                      <code className="text-sm text-green-400">{generatedPrompt.commitMessage}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Active Terminal Session Info */}
          {cardHasTerminal && (
            <div className={`
              rounded-lg p-4
              ${isTerminalRunning ? 'bg-green-900/20 border border-green-700' : 'bg-blue-900/20 border border-blue-700'}
            `}>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isTerminalRunning ? 'text-green-300' : 'text-blue-300'}`}>
                <span className={`w-2 h-2 rounded-full ${isTerminalRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                {isTerminalRunning ? 'Claude Code Session Running' : 'Session Ended'}
                {!isTerminalRunning && terminalExitCode !== null && (
                  <span className={terminalExitCode === 0 ? 'text-green-400' : 'text-yellow-400'}>
                    (Exit code: {terminalExitCode})
                  </span>
                )}
              </h3>
              <p className="text-sm text-dark-text mb-4">
                {isTerminalRunning
                  ? 'A Claude Code session is running for this card. Click below to view the terminal.'
                  : 'The session has completed. Review the output and mark the task as done if successful.'}
              </p>

              <button
                onClick={handleViewTerminal}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>&gt;_</span> View Terminal
              </button>

              {/* Progress Notes (only when session ended) */}
              {!isTerminalRunning && (
                <div className="mt-4 space-y-2">
                  <label className="text-xs text-dark-text-secondary">
                    Progress Notes (optional)
                  </label>
                  <textarea
                    value={progressNotes}
                    onChange={(e) => setProgressNotes(e.target.value)}
                    placeholder="What was accomplished? Any issues or follow-up needed?"
                    className="w-full h-24 p-3 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text resize-none focus:outline-none focus:border-blue-500 scrollbar-dark"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 p-6 border-t border-dark-border bg-dark-surface rounded-b-xl">
          <div className="flex flex-wrap gap-3">
            {/* When terminal is running - show View Terminal and minimal actions */}
            {cardHasTerminal && isTerminalRunning && (
              <>
                <button
                  onClick={handleViewTerminal}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>&gt;_</span> View Terminal
                </button>
                <p className="text-sm text-dark-text-secondary italic flex items-center py-2">
                  Session in progress...
                </p>
              </>
            )}

            {/* When terminal has exited - show prominent Mark as Done */}
            {cardHasTerminal && !isTerminalRunning && card.status !== 'Done' && (
              <>
                <button
                  onClick={handleViewTerminal}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>&gt;_</span> View Terminal
                </button>
                <button
                  onClick={handleStartSession}
                  disabled={!generatedPrompt}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>+</span> New Session
                </button>
                <button
                  onClick={handleMarkDone}
                  className="flex-[2] min-w-[160px] px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-lg"
                >
                  <span>OK</span> Mark as Done
                </button>
              </>
            )}

            {/* When no terminal - show normal actions */}
            {!cardHasTerminal && (
              <>
                {/* Copy to Clipboard (only if prompt exists) */}
                {generatedPrompt && !isManual && !isTBC && (
                  <button
                    onClick={handleCopyToClipboard}
                    className={`
                      flex-1 min-w-[140px] px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                      ${copySuccess
                        ? 'bg-green-700 text-white'
                        : 'bg-dark-bg border border-dark-border hover:bg-dark-hover text-dark-text'}
                    `}
                  >
                    {copySuccess ? (
                      <>
                        <span>OK</span> Copied!
                      </>
                    ) : (
                      <>
                        <span>[=]</span> Copy to Clipboard
                      </>
                    )}
                  </button>
                )}

                {/* Start Session (only if prompt exists) */}
                {generatedPrompt && !isManual && !isTBC && (
                  <button
                    onClick={handleStartSession}
                    className="flex-1 min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <span>&gt;</span> Start Session
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
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default CardDetail;
