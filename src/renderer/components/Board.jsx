import React, { useState, useEffect } from 'react';
import Card from './Card';

const Board = ({ projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState({});

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

      // Use Electron IPC to get project data from main process
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

                          return (
                            <div
                              key={colIdx}
                              className="flex-1 min-w-[300px] p-3 border-r border-dark-border"
                            >
                              {cards.length > 0 ? (
                                <div className="space-y-2">
                                  {cards.map((card) => (
                                    <Card key={card.id} card={card} />
                                  ))}
                                </div>
                              ) : (
                                <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
                                  <span className="text-xs text-dark-text-secondary">No cards</span>
                                </div>
                              )}
                            </div>
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
  );
};

export default Board;
