import React, { useState, useEffect, useMemo } from 'react';
import CardDetail from './CardDetail';

const RoadmapView = ({ projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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

  // Build a map of card status by session letter for dependency checking
  const cardStatusByLetter = useMemo(() => {
    if (!project?.phases) return {};

    const map = {};
    for (const phase of project.phases) {
      for (const subphase of phase.subphases || []) {
        for (const card of subphase.cards || []) {
          map[card.session_letter] = card.status;
        }
      }
    }
    return map;
  }, [project]);

  // Check if a card is blocked
  const isCardBlocked = (card) => {
    if (!card.depends_on_cards || card.depends_on_cards.length === 0) {
      return false;
    }
    if (card.status === 'Done' || card.status === 'In Progress') {
      return false;
    }
    return card.depends_on_cards.some(
      letter => cardStatusByLetter[letter] !== 'Done'
    );
  };

  // Get blocked reason
  const getBlockedReason = (card) => {
    if (!card.depends_on_cards || card.depends_on_cards.length === 0) return null;
    const incomplete = card.depends_on_cards.filter(
      letter => cardStatusByLetter[letter] !== 'Done'
    );
    if (incomplete.length === 0) return null;
    return `Waiting on: ${incomplete.join(', ')}`;
  };

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

  const handleStatusChange = async (cardId, newStatus) => {
    try {
      await window.electron.updateCardStatus(cardId, newStatus);
      await loadProject();
      if (selectedCard?.id === cardId) {
        setSelectedCard(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      console.error('Failed to update card status:', err);
    }
  };

  // Resource icons
  const resourceIcons = {
    claude_sub: '🤖',
    anthropic_api: '🔧',
    none: '✋',
    tbc: '❓'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-text-secondary">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-text-secondary">No project selected</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Document Container */}
      <div className="flex-1 overflow-auto scrollbar-dark">
        <div className="max-w-4xl mx-auto p-8">
          {/* Document Title */}
          <div className="mb-8 pb-6 border-b border-dark-border">
            <h1 className="text-3xl font-bold text-dark-text mb-2 font-mono">
              # {project.name}
            </h1>
            {project.description && (
              <p className="text-dark-text-secondary mt-2 pl-4 border-l-4 border-dark-border italic">
                {project.description}
              </p>
            )}

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
                      <div className="flex-1 h-2 bg-dark-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-dark-text-secondary font-mono">
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
                  <h2 className="text-2xl font-bold text-dark-text font-mono flex items-center gap-3">
                    <span className="text-dark-text-secondary">##</span>
                    <span>
                      {phase.short_name ? `${phase.short_name}: ` : ''}
                      {phase.name}
                    </span>
                    <span className="text-base font-normal text-dark-text-secondary ml-2">
                      ({phaseStats.done}/{phaseStats.total} complete)
                    </span>
                  </h2>
                  {phase.description && (
                    <p className="text-dark-text-secondary mt-1 ml-8">
                      {phase.description}
                    </p>
                  )}

                  {/* Phase Progress Bar */}
                  <div className="mt-2 ml-8 flex items-center gap-3">
                    <div className="flex-1 max-w-xs h-1.5 bg-dark-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 transition-all"
                        style={{ width: `${phaseStats.total > 0 ? (phaseStats.done / phaseStats.total) * 100 : 0}%` }}
                      />
                    </div>
                    {phaseStats.inProgress > 0 && (
                      <span className="text-xs text-blue-400">
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
                      <h3 className="text-lg font-semibold text-dark-text font-mono flex items-center gap-2 mb-3">
                        <span className="text-dark-text-secondary">###</span>
                        <span>
                          {subphase.short_name ? `${subphase.short_name}: ` : ''}
                          {subphase.name.replace(/^\d+\.\d+\s+/, '')}
                        </span>
                        <span className="text-sm font-normal text-dark-text-secondary">
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
                                ${isInProgress ? 'bg-blue-900/30 border border-blue-600 ring-2 ring-blue-500/50' : ''}
                                ${isDone ? 'bg-dark-surface/50' : ''}
                                ${blocked ? 'opacity-60' : ''}
                                ${!isDone && !isInProgress ? 'hover:bg-dark-surface' : ''}
                              `}
                            >
                              {/* Checkbox */}
                              <div className="flex-shrink-0 mt-0.5 font-mono text-lg">
                                {isDone ? (
                                  <span className="text-green-500">[x]</span>
                                ) : blocked ? (
                                  <span className="text-red-400">[🔒]</span>
                                ) : isInProgress ? (
                                  <span className="text-blue-400">[~]</span>
                                ) : (
                                  <span className="text-dark-text-secondary">[ ]</span>
                                )}
                              </div>

                              {/* Session Letter */}
                              <div className={`
                                flex-shrink-0 w-8 h-8 rounded flex items-center justify-center font-bold text-sm
                                ${isDone ? 'bg-green-700 text-white' : ''}
                                ${isInProgress ? 'bg-blue-600 text-white' : ''}
                                ${!isDone && !isInProgress ? 'bg-dark-bg text-dark-text border border-dark-border' : ''}
                              `}>
                                {isDone ? '✓' : card.session_letter}
                              </div>

                              {/* Card Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`
                                    font-medium
                                    ${isDone ? 'text-dark-text-secondary line-through' : 'text-dark-text'}
                                    ${isInProgress ? 'text-blue-200' : ''}
                                  `}>
                                    {card.title}
                                  </span>

                                  {/* Resource Icon */}
                                  <span className="text-sm" title={card.resource}>
                                    {resourceIcons[card.resource]}
                                  </span>

                                  {/* In Progress Badge */}
                                  {isInProgress && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold animate-pulse">
                                      IN PROGRESS
                                    </span>
                                  )}
                                </div>

                                {/* Description preview */}
                                {card.description && !isDone && (
                                  <p className="text-sm text-dark-text-secondary mt-1 line-clamp-1">
                                    {card.description}
                                  </p>
                                )}

                                {/* Blocked reason */}
                                {blocked && blockedReason && (
                                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                                    <span>🔒</span> {blockedReason}
                                  </p>
                                )}

                                {/* Complexity badge */}
                                {card.complexity && card.complexity !== 'medium' && !isDone && (
                                  <span className={`
                                    inline-block text-xs px-2 py-0.5 rounded mt-1
                                    ${card.complexity === 'low' ? 'bg-green-900 text-green-300' : ''}
                                    ${card.complexity === 'high' ? 'bg-red-900 text-red-300' : ''}
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
                          <p className="text-dark-text-secondary italic text-sm">
                            No cards in this subphase
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty subphases state */}
                {(!phase.subphases || phase.subphases.length === 0) && (
                  <p className="text-dark-text-secondary italic ml-8">
                    No subphases in this phase
                  </p>
                )}
              </div>
            );
          })}

          {/* Empty phases state */}
          {(!project.phases || project.phases.length === 0) && (
            <p className="text-dark-text-secondary italic text-center py-8">
              No phases in this project
            </p>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-dark-border text-center">
            <p className="text-sm text-dark-text-secondary font-mono">
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
        project={project}
      />
    </div>
  );
};

export default RoadmapView;
