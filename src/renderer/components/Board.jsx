import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import Card from './Card';
import CardDetail from './CardDetail';

// Droppable Cell Component
const DroppableCell = ({ id, children, isOver, canDrop, isEmpty }) => {
  const { setNodeRef } = useDroppable({ id });

  let dropIndicatorClass = '';
  if (isOver) {
    if (canDrop) {
      dropIndicatorClass = 'ring-2 ring-green-500 bg-green-500/10';
    } else {
      dropIndicatorClass = 'ring-2 ring-red-500 bg-red-500/10';
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[300px] p-3 border-r border-dark-border transition-all ${dropIndicatorClass}`}
    >
      {children}
    </div>
  );
};

const Board = ({ projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [activeCard, setActiveCard] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    })
  );

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    loadProject();
  }, [projectId]);

  const loadProject = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Use Electron IPC to get project data from main process
      const projectData = await window.electron.getProject(projectId);

      if (!projectData) {
        setError('Project not found');
        if (!silent) setLoading(false);
        return;
      }

      setProject(projectData);
      if (!silent) setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load project');
      if (!silent) setLoading(false);
    }
  };

  const togglePhase = (phaseId) => {
    setCollapsedPhases(prev => ({
      ...prev,
      [phaseId]: !prev[phaseId]
    }));
  };

  const getCardsForCell = (subphaseId, status) => {
    if (!project) return [];

    // Find all cards for this subphase and status
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        if (subphase.id === subphaseId) {
          return subphase.cards.filter(card => card.status === status);
        }
      }
    }
    return [];
  };

  const findCardById = (cardId) => {
    if (!project) return null;

    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        const card = subphase.cards.find(c => c.id === cardId);
        if (card) return card;
      }
    }
    return null;
  };

  const isCardBlocked = (card) => {
    if (!card) return false;

    // Check if card has dependencies
    if (!card.depends_on_cards || card.depends_on_cards.length === 0) {
      return false;
    }

    // Check if all dependencies are completed
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        for (const depCardLetter of card.depends_on_cards) {
          const depCard = subphase.cards.find(c => c.session_letter === depCardLetter);
          if (depCard && depCard.status !== 'Done') {
            return true;
          }
        }
      }
    }
    return false;
  };

  const canDropCard = (cardId, newStatus) => {
    const card = findCardById(cardId);
    if (!card) return false;

    // Blocked cards cannot be moved to "In Progress"
    if (newStatus === 'In Progress' && isCardBlocked(card)) {
      return false;
    }

    return true;
  };

  const handleDragStart = (event) => {
    const cardId = parseInt(event.active.id);
    const card = findCardById(cardId);
    setActiveCard(card);
  };

  const handleDragOver = (event) => {
    const { over } = event;

    if (over) {
      const [subphaseId, status] = over.id.split('|');
      setDropTarget({ subphaseId: parseInt(subphaseId), status });
    } else {
      setDropTarget(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    setActiveCard(null);
    setDropTarget(null);

    if (!over) return;

    const cardId = parseInt(active.id);
    const [subphaseId, newStatus] = over.id.split('|');
    const card = findCardById(cardId);

    if (!card || card.status === newStatus) return;

    // Validate drop
    if (!canDropCard(cardId, newStatus)) {
      console.log('Cannot drop: card is blocked and target is In Progress');
      return;
    }

    try {
      // Update status in database
      await window.electron.updateCardStatus(cardId, newStatus);

      // Reload project to get updated data (silent to preserve scroll position)
      await loadProject(true);
    } catch (err) {
      console.error('Failed to update card status:', err);
      setError('Failed to update card status');
    }
  };

  // Handle card click to open detail panel
  const handleCardClick = (card) => {
    setSelectedCard(card);
    setIsDetailOpen(true);
  };

  // Handle closing detail panel
  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    // Keep selectedCard for animation, clear after a brief delay
    setTimeout(() => {
      if (!isDetailOpen) setSelectedCard(null);
    }, 300);
  };

  // Handle marking card as done
  const handleMarkDone = async (cardId, progressNotes) => {
    try {
      await window.electron.updateCardStatus(cardId, 'Done');
      // TODO: Store progress notes if provided
      if (progressNotes) {
        console.log('Progress notes for card', cardId, ':', progressNotes);
        // Could save to card.notes field or a separate progress log
      }
      await loadProject(true);
      // Update selected card if it was the one marked done
      if (selectedCard?.id === cardId) {
        const updatedCard = findCardById(cardId);
        if (updatedCard) setSelectedCard({ ...updatedCard, status: 'Done' });
      }
    } catch (err) {
      console.error('Failed to mark card as done:', err);
      setError('Failed to update card status');
    }
  };

  // Handle status change from CardDetail
  const handleStatusChange = async (cardId, newStatus) => {
    try {
      await window.electron.updateCardStatus(cardId, newStatus);
      await loadProject(true);
      // Update selected card if it was the one changed
      if (selectedCard?.id === cardId) {
        const updatedCard = findCardById(cardId);
        if (updatedCard) setSelectedCard({ ...updatedCard, status: newStatus });
      }
    } catch (err) {
      console.error('Failed to update card status:', err);
      setError('Failed to update card status');
    }
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

  const columns = project.columns || ['Not Started', 'In Progress', 'Done'];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-dark-bg">
        {/* Board Header */}
        <div className="flex-shrink-0 p-6 border-b border-dark-border">
          <h1 className="text-2xl font-bold text-dark-text mb-2">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-dark-text-secondary">{project.description}</p>
          )}
        </div>

        {/* Scrollable Board Content */}
        <div className="flex-1 overflow-auto scrollbar-dark">
          <div className="min-w-max">
          {/* Column Headers */}
          <div className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border">
            <div className="flex">
              {/* Row header spacer */}
              <div className="w-48 flex-shrink-0 p-4 border-r border-dark-border">
                <span className="text-xs font-semibold text-dark-text-secondary uppercase">
                  Subphase
                </span>
              </div>

              {/* Column headers */}
              {columns.map((column, idx) => (
                <div
                  key={idx}
                  className="flex-1 min-w-[300px] p-4 border-r border-dark-border"
                >
                  <h3 className="text-sm font-bold text-dark-text">{column}</h3>
                </div>
              ))}
            </div>
          </div>

          {/* Phase Sections */}
          {project.phases && project.phases.length > 0 ? (
            project.phases.map((phase) => (
              <div key={phase.id} className="border-b border-dark-border">
                {/* Phase Header (Collapsible) */}
                <div
                  className="bg-dark-surface sticky top-[57px] z-[9] cursor-pointer hover:bg-dark-hover transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex items-center gap-3 p-4 border-b border-dark-border">
                    {/* Collapse/Expand Icon */}
                    <span className="text-dark-text-secondary text-sm">
                      {collapsedPhases[phase.id] ? '▶' : '▼'}
                    </span>

                    {/* Phase Name */}
                    <h2 className="text-lg font-bold text-dark-text">
                      {phase.short_name ? `${phase.short_name}: ` : ''}
                      {phase.name}
                    </h2>

                    {/* Phase Description */}
                    {phase.description && (
                      <span className="text-sm text-dark-text-secondary ml-2">
                        — {phase.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Subphase Rows */}
                {!collapsedPhases[phase.id] && phase.subphases && (
                  <div>
                    {phase.subphases.map((subphase) => (
                      <div key={subphase.id} className="flex border-b border-dark-border hover:bg-dark-surface/30 transition-colors">
                        {/* Row Header */}
                        <div className="w-48 flex-shrink-0 p-4 border-r border-dark-border bg-dark-surface">
                          <div className="flex items-center gap-2">
                            {/* Subphase short name badge */}
                            <div className="flex-shrink-0 w-10 h-10 rounded bg-dark-bg flex items-center justify-center font-bold text-sm text-dark-text border border-dark-border">
                              {subphase.short_name || '—'}
                            </div>

                            {/* Subphase name */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-dark-text truncate" title={subphase.name}>
                                {subphase.name.replace(/^\d+\.\d+\s+/, '')}
                              </div>
                              {subphase.description && (
                                <div className="text-xs text-dark-text-secondary truncate mt-1" title={subphase.description}>
                                  {subphase.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cells for each column */}
                        {columns.map((column, colIdx) => {
                          const cards = getCardsForCell(subphase.id, column);
                          const cellId = `${subphase.id}|${column}`;
                          const isOver = dropTarget?.subphaseId === subphase.id && dropTarget?.status === column;
                          const canDrop = activeCard ? canDropCard(activeCard.id, column) : true;

                          return (
                            <DroppableCell
                              key={colIdx}
                              id={cellId}
                              isOver={isOver}
                              canDrop={canDrop}
                              isEmpty={cards.length === 0}
                            >
                              {cards.length > 0 ? (
                                <div className="space-y-2">
                                  {cards.map((card) => (
                                    <Card
                                      key={card.id}
                                      card={card}
                                      isDragging={activeCard?.id === card.id}
                                      onClick={handleCardClick}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
                                  <span className="text-xs text-dark-text-secondary">No cards</span>
                                </div>
                              )}
                            </DroppableCell>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state for phase with no subphases */}
                {!collapsedPhases[phase.id] && (!phase.subphases || phase.subphases.length === 0) && (
                  <div className="p-8 text-center text-dark-text-secondary">
                    No subphases in this phase
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-dark-text-secondary">
              No phases in this project
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeCard ? (
          <div className="opacity-50">
            <Card card={activeCard} />
          </div>
        ) : null}
      </DragOverlay>

      {/* Card Detail Panel */}
      <CardDetail
        card={selectedCard}
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        onMarkDone={handleMarkDone}
        onStatusChange={handleStatusChange}
        project={project}
      />
    </DndContext>
  );
};

export default Board;
