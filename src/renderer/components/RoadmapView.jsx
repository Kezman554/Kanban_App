import React, { useState, useEffect, useMemo } from 'react';
import { Check, Copy, Folder, Pencil, Trash2 } from './icons';
import SubphaseBadge from './SubphaseBadge';
import { paletteFor } from '../utils/palette';
import { phaseTitle, subphaseTitle } from '../utils/labels';
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

  // Whole-project totals for the header
  const totals = (project.phases || []).reduce((acc, phase) => {
    const s = getPhaseStats(phase);
    return { total: acc.total + s.total, done: acc.done + s.done, inProgress: acc.inProgress + s.inProgress };
  }, { total: 0, done: 0, inProgress: 0 });
  const overallPct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-page">
      <div className="flex-1 overflow-auto scrollbar-themed">
        <div className="max-w-6xl mx-auto p-8">
          {/* Header: title, folder, overall progress, in-progress pill, key */}
          <div className="mb-8 pb-6 border-b border-divider">
            <h1 className="text-3xl font-bold text-ink">{project.name}</h1>
            {project.description && (
              <p className="text-muted mt-1">{project.description}</p>
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
                    <Folder className="w-4 h-4" />
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
                    aria-label={pathCopied ? 'Copied' : 'Copy path to clipboard'}
                  >
                    {pathCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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
                    aria-label="Change project folder"
                  >
                    <Pencil className="w-3.5 h-3.5" />
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
                  className="flex items-center gap-1.5 text-link hover:underline"
                >
                  <Folder className="w-4 h-4" />
                  <span>Set project folder</span>
                </button>
              )}
            </div>

            {/* Overall progress */}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                <div
                  className="flex-1 h-3 bg-panel border-[1.5px] border-line rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={overallPct}
                  aria-label="Cards done"
                >
                  <div className="h-full bg-progress transition-all" style={{ width: `${overallPct}%` }} />
                </div>
                <span className="text-sm font-semibold text-ink whitespace-nowrap">
                  {totals.done}/{totals.total} done · {overallPct}%
                </span>
              </div>
              {totals.inProgress > 0 && (
                <span className="text-xs px-3 py-1 rounded-full bg-primary text-on-primary font-semibold border-[1.5px] border-card-line">
                  {totals.inProgress} in progress
                </span>
              )}

              {/* Key */}
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted" aria-label="Key">
                <li className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-done text-on-done flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                  Done
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-6 h-4 rounded-full border-[2.5px] border-active-ring ring-2 ring-active-ring/25 bg-pal-aqua" />
                  In progress
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-6 h-4 rounded-full border-[1.5px] border-card-line bg-pal-lilac" />
                  Ready
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-6 h-4 rounded-full border-[1.5px] border-dashed border-dash" />
                  Blocked
                </li>
              </ul>
            </div>
          </div>

          {/* Phases on a timeline: a vertical line with a percentage circle per phase */}
          <div className="relative">
            {project.phases && project.phases.length > 0 && (
              <div className="absolute left-[25px] top-2 bottom-2 w-[2px] bg-divider" aria-hidden="true" />
            )}

            {project.phases && project.phases.map((phase) => {
              const phaseStats = getPhaseStats(phase);
              const pct = phaseStats.total > 0 ? Math.round((phaseStats.done / phaseStats.total) * 100) : 0;
              const isComplete = phaseStats.total > 0 && phaseStats.done === phaseStats.total;
              const circle = isComplete
                ? 'bg-done text-on-done border-card-line'
                : phaseStats.done > 0
                  ? 'bg-progress text-card-ink border-card-line'
                  : 'bg-panel text-ink border-line';

              return (
                <section key={phase.id} className="relative flex gap-5 mb-10">
                  {/* Phase circle */}
                  <div
                    className={`relative z-10 flex-shrink-0 w-[52px] h-[52px] rounded-full border-[1.5px] flex items-center justify-center text-sm font-bold ${circle}`}
                    title={`${phaseStats.done} of ${phaseStats.total} done`}
                  >
                    {pct}%
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Phase title and "done/total · description" */}
                    <div className="min-h-[52px] flex flex-col justify-center mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-bold text-ink">{phaseTitle(phase)}</h2>
                        {phaseStats.total === 0 && (
                          <button
                            onClick={() => handleDeleteEmptyPhase(phase)}
                            className="text-xs px-3 py-1 rounded-full border-[1.5px] border-danger-text text-danger-text hover:bg-danger/10 transition-colors flex items-center gap-1.5"
                            title="This phase has no cards and doesn't appear on the board"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete empty phase
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-muted">
                        {phaseStats.done}/{phaseStats.total}
                        {phase.description ? ` · ${phase.description}` : ''}
                      </p>
                    </div>

                    {/* Subphase rows: badge and name, then every card as a chip */}
                    {phase.subphases && phase.subphases.map((subphase) => (
                      <div key={subphase.id} className="flex gap-4 py-2 border-t border-divider first:border-t-0">
                        <div className="w-[190px] flex-shrink-0 flex items-start gap-2 pt-1.5">
                          <SubphaseBadge subphase={subphase} />
                          <span className="text-sm font-semibold text-ink leading-7 min-w-0 break-words" title={subphase.name}>
                            {subphaseTitle(subphase)}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                          {subphase.cards && subphase.cards.map((card) => {
                            const blocked = isCardBlocked(card);
                            const blockedReason = getBlockedReason(card);
                            const isDone = card.status === 'Done';
                            const isInProgress = card.status === 'In Progress';
                            const colour = paletteFor(card.id);
                            const state = isDone ? 'done' : isInProgress ? 'in progress' : blocked ? 'blocked' : 'ready';

                            const chip = isDone
                              ? 'border-[1.5px] border-divider text-muted'
                              : isInProgress
                                ? 'border-[2.5px] border-active-ring ring-4 ring-active-ring/25 text-card-ink'
                                : blocked
                                  ? 'border-[1.5px] border-dashed border-dash text-ink'
                                  : 'border-[1.5px] border-card-line shadow-card text-card-ink';

                            return (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => handleCardClick(card)}
                                className={`h-[38px] max-w-[300px] rounded-full pl-[3px] pr-3 flex items-center gap-2 text-sm font-medium hover:brightness-95 transition ${chip}`}
                                style={isDone || blocked ? undefined : { backgroundColor: colour.fill }}
                                title={`${card.session_letter}: ${card.title}${blocked && blockedReason ? ` — ${blockedReason}` : ''}`}
                              >
                                <span
                                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                    isDone
                                      ? 'bg-done text-on-done'
                                      : blocked
                                        ? 'border-[1.5px] border-dashed border-dash'
                                        : 'text-cream'
                                  }`}
                                  style={isDone || blocked ? undefined : { backgroundColor: colour.deep }}
                                >
                                  {isDone ? <Check className="w-3.5 h-3.5" /> : card.session_letter}
                                </span>
                                <span className={`truncate ${isDone ? 'line-through' : ''}`}>{card.title}</span>
                                <span className="sr-only">({isDone ? `${card.session_letter}, ` : ''}{state})</span>
                              </button>
                            );
                          })}

                          {/* Empty state */}
                          {(!subphase.cards || subphase.cards.length === 0) && (
                            <p className="text-muted italic text-sm leading-[38px]">
                              No cards in this subphase
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Empty subphases state */}
                    {(!phase.subphases || phase.subphases.length === 0) && (
                      <p className="text-muted italic text-sm">
                        No subphases in this phase
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Empty phases state */}
          {(!project.phases || project.phases.length === 0) && (
            <p className="text-muted italic text-center py-8">
              No phases in this project
            </p>
          )}
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
