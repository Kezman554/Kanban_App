import React, { useState, useEffect, useMemo } from 'react';
import { Lock, Check, ResourceIcon } from './icons';
import CardDetail from './CardDetail';
import { copyText } from '../utils/clipboard.js';
import {
  buildCardStatusByLetter,
  isCardBlocked as isCardBlockedShared,
  getBlockedReason as getBlockedReasonShared,
} from '../utils/cardBlocking';

const RoadmapView = ({ projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectData = await window.electron.getProject(projectId);

      if (!projectData) {
        setError('Project not found');
        setLoading(false);
        return;
      }

      setProject(projectData);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load project');
      setLoading(false);
    }
  };

  const handleDeleteEmptyPhase = async (phase) => {
    const confirmed = window.confirm(
      `Delete empty phase "${phase.name}"?\n\nIts subphases will be removed too. This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await window.electron.deletePhase(phase.id);
      await loadProject();
    } catch (err) {
      setError(err.message || 'Failed to delete phase');
    }
  };

  // Build a map of card status by session letter for dependency checking
  const cardStatusByLetter = useMemo(() => buildCardStatusByLetter(project), [project]);

  // Blocked check shared with Board / AllProjectsView (utils/cardBlocking)
  const isCardBlocked = (card) => isCardBlockedShared(card, cardStatusByLetter);
  const getBlockedReason = (card) => getBlockedReasonShared(card, cardStatusByLetter);

  // Calculate phase stats
  const getPhaseStats = (phase) => {
    let total = 0;
    let done = 0;
    let inProgress = 0;

    for (const subphase of phase.subphases || []) {
      for (const card of subphase.cards || []) {
        total++;
        if (card.status === 'Done') done++;
        if (card.status === 'In Progress') inProgress++;
      }
    }

    return { total, done, inProgress };
  };

  // Calculate subphase stats
  const getSubphaseStats = (subphase) => {
    const cards = subphase.cards || [];
    const total = cards.length;
    const done = cards.filter(c => c.status === 'Done').length;
    const inProgress = cards.filter(c => c.status === 'In Progress').length;

    return { total, done, inProgress };
  };

  const handleCardClick = (card) => {
    setSelectedCard(card);
    setIsDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setTimeout(() => {
      if (!isDetailOpen) setSelectedCard(null);
    }, 300);
  };

  const handleCardUpdated = async (cardId) => {
    try {
      await loadProject();
      const freshCard = await window.electron.getCard(cardId);
      if (freshCard) setSelectedCard(freshCard);
    } catch (err) {
      console.error('Failed to refresh card:', err);
    }
  };

  const handleMarkDone = async (cardId, progressNotes) => {
    try {
      await window.electron.updateCardStatus(cardId, 'Done');
      await loadProject();
      if (selectedCard?.id === cardId) {
        setSelectedCard(prev => ({ ...prev, status: 'Done' }));
      }
    } catch (err) {
      console.error('Failed to mark card as done:', err);
    }
  };

  // Resolves true once the status is stored, false if it was not - Start
  // Session closes the view only on true
  const handleStatusChange = async (cardId, newStatus) => {
    try {
      await window.electron.updateCardStatus(cardId, newStatus);
    } catch (err) {
      console.error('Failed to update card status:', err);
      return false;
    }
    await loadProject();
    if (selectedCard?.id === cardId) {
      setSelectedCard(prev => ({ ...prev, status: newStatus }));
    }
    return true;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-danger-text">Error: {error}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">No project selected</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-page">
      {/* Document Container */}
      <div className="flex-1 overflow-auto scrollbar-themed">
        <div className="max-w-4xl mx-auto p-8">
          {/* Document Title */}
          <div className="mb-8 pb-6 border-b border-divider">
            <h1 className="text-3xl font-bold text-ink mb-2">
              # {project.name}
            </h1>
            {project.description && (
              <p className="text-muted mt-2 pl-4 border-l-4 border-divider italic">
                {project.description}
              </p>
            )}

            {/* Directory Path */}
            <div className="flex items-center gap-2 text-xs mt-3">
              {project.directory_path ? (
                <>
                  <button
                    onClick={async () => {
                      try {
                        await window.electron.openInExplorer(project.directory_path);
                      } catch (err) {
                        console.error('Failed to open folder:', err);
                      }
                    }}
                    className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors"
                    title="Open in file explorer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span>{project.directory_path}</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await copyText(project.directory_path);
                        setPathCopied(true);
                        setTimeout(() => setPathCopied(false), 2000);
                      } catch (err) {
                        console.error('Failed to copy path:', err);
                      }
                    }}
                    className={`transition-colors ${pathCopied ? 'text-success-text' : 'text-muted hover:text-ink'}`}
                    title={pathCopied ? 'Copied!' : 'Copy path to clipboard'}
                  >
                    {pathCopied ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      const newPath = await window.electron.selectDirectory();
                      if (newPath) {
                        await window.electron.updateProjectPath(project.id, newPath);
                        await loadProject();
                      }
                    }}
                    className="text-muted hover:text-ink transition-colors"
                    title="Change project folder"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    const newPath = await window.electron.selectDirectory();
                    if (newPath) {
                      await window.electron.updateProjectPath(project.id, newPath);
                      await loadProject();
                    }
                  }}
                  className="flex items-center gap-1.5 text-link hover:text-link transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>Set project folder</span>
                </button>
              )}
            </div>

            {/* Overall Progress */}
            {project.phases && (
              <div className="mt-4">
                {(() => {
                  let totalCards = 0;
                  let doneCards = 0;
                  for (const phase of project.phases) {
                    const stats = getPhaseStats(phase);
                    totalCards += stats.total;
                    doneCards += stats.done;
                  }
                  const percentage = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;

                  return (
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-2 bg-panel rounded-full overflow-hidden">
                        <div
                          className="h-full bg-done transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted">
                        {doneCards}/{totalCards} ({percentage}%)
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Phases */}
          {project.phases && project.phases.map((phase, phaseIdx) => {
            const phaseStats = getPhaseStats(phase);

            return (
              <div key={phase.id} className="mb-10">
                {/* Phase Header */}
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-ink flex items-center gap-3">
                    <span className="text-muted">##</span>
                    <span>
                      {phase.short_name ? `${phase.short_name}: ` : ''}
                      {phase.name}
                    </span>
                    <span className="text-base font-normal text-muted ml-2">
                      ({phaseStats.done}/{phaseStats.total} complete)
                    </span>
                    {phaseStats.total === 0 && (
                      <button
                        onClick={() => handleDeleteEmptyPhase(phase)}
                        className="text-sm font-normal font-sans px-3 py-1 rounded border border-danger-text text-danger-text hover:bg-danger/10 transition-colors"
                        title="This phase has no cards and doesn't appear on the board"
                      >
                        Delete empty phase
                      </button>
                    )}
                  </h2>
                  {phase.description && (
                    <p className="text-muted mt-1 ml-8">
                      {phase.description}
                    </p>
                  )}

                  {/* Phase Progress Bar */}
                  <div className="mt-2 ml-8 flex items-center gap-3">
                    <div className="flex-1 max-w-xs h-1.5 bg-panel rounded-full overflow-hidden">
                      <div
                        className="h-full bg-done transition-all"
                        style={{ width: `${phaseStats.total > 0 ? (phaseStats.done / phaseStats.total) * 100 : 0}%` }}
                      />
                    </div>
                    {phaseStats.inProgress > 0 && (
                      <span className="text-xs text-link">
                        {phaseStats.inProgress} in progress
                      </span>
                    )}
                  </div>
                </div>

                {/* Subphases */}
                {phase.subphases && phase.subphases.map((subphase, subIdx) => {
                  const subStats = getSubphaseStats(subphase);

                  return (
                    <div key={subphase.id} className="mb-6 ml-4">
                      {/* Subphase Header */}
                      <h3 className="text-lg font-semibold text-ink flex items-center gap-2 mb-3">
                        <span className="text-muted">###</span>
                        <span>
                          {subphase.short_name ? `${subphase.short_name}: ` : ''}
                          {subphase.name.replace(/^\d+\.\d+\s+/, '')}
                        </span>
                        <span className="text-sm font-normal text-muted">
                          ({subStats.done}/{subStats.total})
                        </span>
                      </h3>

                      {/* Cards as Checklist */}
                      <div className="ml-6 space-y-2">
                        {subphase.cards && subphase.cards.map((card) => {
                          const blocked = isCardBlocked(card);
                          const blockedReason = getBlockedReason(card);
                          const isDone = card.status === 'Done';
                          const isInProgress = card.status === 'In Progress';

                          return (
                            <div
                              key={card.id}
                              onClick={() => handleCardClick(card)}
                              className={`
                                flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all
                                ${isInProgress ? 'bg-primary/15 border border-primary ring-2 ring-primary/50' : ''}
                                ${isDone ? 'bg-panel/50' : ''}
                                ${blocked ? 'opacity-60' : ''}
                                ${!isDone && !isInProgress ? 'hover:bg-panel' : ''}
                              `}
                            >
                              {/* Checkbox */}
                              <div className="flex-shrink-0 mt-0.5 text-lg">
                                {isDone ? (
                                  <span className="text-success-text">[x]</span>
                                ) : blocked ? (
                                  <span className="text-danger-text inline-flex items-center">[<Lock className="w-4 h-4" />]</span>
                                ) : isInProgress ? (
                                  <span className="text-link">[~]</span>
                                ) : (
                                  <span className="text-muted">[ ]</span>
                                )}
                              </div>

                              {/* Session Letter */}
                              <div className={`
                                flex-shrink-0 w-8 h-8 rounded flex items-center justify-center font-bold text-sm
                                ${isDone ? 'bg-done text-cream' : ''}
                                ${isInProgress ? 'bg-primary text-cream' : ''}
                                ${!isDone && !isInProgress ? 'bg-page text-ink border border-line' : ''}
                              `}>
                                {isDone ? <Check className="w-4 h-4" /> : card.session_letter}
                              </div>

                              {/* Card Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`
                                    font-medium
                                    ${isDone ? 'text-muted line-through' : 'text-ink'}
                                    ${isInProgress ? 'text-link' : ''}
                                  `}>
                                    {card.title}
                                  </span>

                                  {/* Resource Icon */}
                                  <span className="text-sm" title={card.resource}>
                                    <ResourceIcon resource={card.resource} className="w-4 h-4 inline-block" />
                                  </span>

                                  {/* In Progress Badge */}
                                  {isInProgress && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-cream font-semibold animate-pulse">
                                      IN PROGRESS
                                    </span>
                                  )}
                                </div>

                                {/* Description preview */}
                                {card.description && !isDone && (
                                  <p className="text-sm text-muted mt-1 line-clamp-1">
                                    {card.description}
                                  </p>
                                )}

                                {/* Blocked reason */}
                                {blocked && blockedReason && (
                                  <p className="text-xs text-danger-text mt-1 flex items-center gap-1">
                                    <Lock className="w-3 h-3 flex-shrink-0" /> {blockedReason}
                                  </p>
                                )}

                                {/* Complexity badge */}
                                {card.complexity && card.complexity !== 'medium' && !isDone && (
                                  <span className={`
                                    inline-block text-xs px-2 py-0.5 rounded mt-1
                                    ${card.complexity === 'low' ? 'bg-pal-mint text-card-ink' : ''}
                                    ${card.complexity === 'high' ? 'bg-pal-coral text-card-ink' : ''}
                                  `}>
                                    {card.complexity} complexity
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Empty state */}
                        {(!subphase.cards || subphase.cards.length === 0) && (
                          <p className="text-muted italic text-sm">
                            No cards in this subphase
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty subphases state */}
                {(!phase.subphases || phase.subphases.length === 0) && (
                  <p className="text-muted italic ml-8">
                    No subphases in this phase
                  </p>
                )}
              </div>
            );
          })}

          {/* Empty phases state */}
          {(!project.phases || project.phases.length === 0) && (
            <p className="text-muted italic text-center py-8">
              No phases in this project
            </p>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-divider text-center">
            <p className="text-sm text-muted">
              --- End of Roadmap ---
            </p>
          </div>
        </div>
      </div>

      {/* Card Detail Panel */}
      <CardDetail
        card={selectedCard}
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        onMarkDone={handleMarkDone}
        onStatusChange={handleStatusChange}
        onCardUpdated={handleCardUpdated}
        project={project}
      />
    </div>
  );
};

export default RoadmapView;
