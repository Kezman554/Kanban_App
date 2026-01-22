import React, { useState, useEffect, useRef } from 'react';
import { generatePrompt } from '../services/promptGenerator.js';

const CardDetail = ({ card, isOpen, onClose, onMarkDone, onExpandPlan, project }) => {
  const [generatedPrompt, setGeneratedPrompt] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const panelRef = useRef(null);

  // Reset state when card changes
  useEffect(() => {
    setGeneratedPrompt(null);
    setIsGenerating(false);
    setGenerateError(null);
    setIsEditing(false);
    setEditedPrompt('');
    setCopySuccess(false);
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

  const handleStartSession = () => {
    // TODO: Launch terminal with the prompt
    console.log('Start session - will launch terminal later');
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

  const currentPrompt = isEditing ? editedPrompt : (generatedPrompt?.prompt || '');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" />

      {/* Slide-out Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full w-full max-w-2xl bg-dark-surface border-l border-dark-border shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
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
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Close (Esc)"
          >
            <span className="text-xl">✕</span>
          </button>
        </div>

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

          {/* Manual Card Guidance */}
          {isManual && (
            <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                <span>✋</span> Manual Task Guidance
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
                <span>❓</span> Task Needs Planning
              </h3>
              <p className="text-sm text-dark-text mb-4">
                This task hasn't been fully planned yet. Use the button below to expand this card into detailed sub-tasks.
              </p>
              <button
                onClick={handleExpandPlan}
                className="w-full px-4 py-3 bg-orange-700 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>📋</span> Expand & Plan
              </button>
            </div>
          )}

          {/* Prompt Section (for non-manual, non-TBC cards) */}
          {!isManual && !isTBC && (
            <div>
              <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Generated Prompt</h3>

              {/* Generate Button (if no prompt guide or no generated prompt yet) */}
              {!generatedPrompt && (
                <div className="space-y-3">
                  {hasPromptGuide && (
                    <div className="bg-dark-bg p-3 rounded mb-3">
                      <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Prompt Guide</h4>
                      <p className="text-sm text-dark-text whitespace-pre-wrap">{card.prompt_guide}</p>
                    </div>
                  )}

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
                        <span className="animate-spin">⏳</span> Generating...
                      </>
                    ) : (
                      <>
                        <span>🤖</span> Generate Prompt
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
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 p-6 border-t border-dark-border bg-dark-surface">
          <div className="flex flex-wrap gap-3">
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
                    <span>✓</span> Copied!
                  </>
                ) : (
                  <>
                    <span>📋</span> Copy to Clipboard
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
                <span>🚀</span> Start Session
              </button>
            )}

            {/* Mark as Done */}
            {card.status !== 'Done' && (
              <button
                onClick={handleMarkDone}
                className="flex-1 min-w-[140px] px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>✓</span> Mark as Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CardDetail;
