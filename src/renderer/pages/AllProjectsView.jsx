import React, { useState, useEffect, useMemo } from 'react';
import { ResourceIcon, Loader } from '../components/icons';
import { paletteFor } from '../utils/palette';
import {
  buildCardStatusByLetter,
  isCardBlocked,
  getBlockedReason,
} from '../utils/cardBlocking';

function AllProjectsView() {
  const [projects, setProjects] = useState([]);
  const [projectData, setProjectData] = useState({}); // Full project data with cards
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [includedProjects, setIncludedProjects] = useState(new Set()); // Empty means all
  const [hideClaudeSub, setHideClaudeSub] = useState(false);

  // Load all projects and their data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all projects with stats
      const allProjects = await window.electron.getAllProjects();
      setProjects(allProjects);

      // Load full data for each project
      const dataMap = {};
      for (const project of allProjects) {
        const fullProject = await window.electron.getProject(project.id);
        dataMap[project.id] = fullProject;
      }
      setProjectData(dataMap);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Get all cards from a project with blocked status calculated
  // (blocked check shared with Board / RoadmapView via utils/cardBlocking)
  const getCardsWithBlockedStatus = (project) => {
    if (!project?.phases) return [];

    const allCards = [];
    const cardStatusByLetter = buildCardStatusByLetter(project);

    for (const phase of project.phases) {
      for (const subphase of phase.subphases || []) {
        for (const card of subphase.cards || []) {
          allCards.push({
            ...card,
            phaseName: phase.name,
            subphaseName: subphase.name,
            projectId: project.id,
            projectName: project.name
          });
        }
      }
    }

    return allCards.map(card => ({
      ...card,
      isBlocked: isCardBlocked(card, cardStatusByLetter),
      blockedReason: getBlockedReason(card, cardStatusByLetter),
    }));
  };

  // Filter and sort cards across all projects
  const workableCards = useMemo(() => {
    const cards = [];

    for (const project of projects) {
      // Skip if project filter is active and this project isn't included
      if (includedProjects.size > 0 && !includedProjects.has(project.id)) {
        continue;
      }

      const fullProject = projectData[project.id];
      if (!fullProject) continue;

      const projectCards = getCardsWithBlockedStatus(fullProject);

      for (const card of projectCards) {
        // Skip blocked cards
        if (card.isBlocked) continue;

        // Skip done cards
        if (card.status === 'Done') continue;

        // Skip claude_sub if filter is active
        if (hideClaudeSub && card.resource === 'claude_sub') continue;

        cards.push(card);
      }
    }

    // Sort by project order, then phase order, then subphase order
    return cards;
  }, [projects, projectData, includedProjects, hideClaudeSub]);

  // Calculate stats for each project
  const projectStats = useMemo(() => {
    const stats = {};

    for (const project of projects) {
      const fullProject = projectData[project.id];
      if (!fullProject) {
        stats[project.id] = { total: 0, done: 0, inProgress: 0, workable: 0 };
        continue;
      }

      const cards = getCardsWithBlockedStatus(fullProject);
      const total = cards.length;
      const done = cards.filter(c => c.status === 'Done').length;
      const inProgress = cards.filter(c => c.status === 'In Progress').length;
      const workable = cards.filter(c => !c.isBlocked && c.status === 'Not Started').length;

      stats[project.id] = { total, done, inProgress, workable };
    }

    return stats;
  }, [projects, projectData]);

  const toggleProject = (projectId) => {
    setIncludedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const selectAllProjects = () => {
    setIncludedProjects(new Set());
  };

  // Resource labels
  const resourceLabels = {
    claude_sub: { label: 'Claude Subscription' },
    anthropic_api: { label: 'Anthropic API' },
    none: { label: 'Manual Task' },
    tbc: { label: 'To Be Confirmed' }
  };

  // Chip on a coloured card: thin outline on translucent cream
  const chip = 'text-xs px-2 py-0.5 rounded-full border border-card-line bg-cream/60 text-card-ink font-medium';

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 mx-auto mb-4 text-muted animate-spin" />
          <p className="text-muted">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-text mb-4">Error: {error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-primary hover:brightness-110 border-[1.5px] border-card-line text-cream rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-2">All Projects View</h1>
        <p className="text-muted">
          Showing {workableCards.length} workable cards across {includedProjects.size > 0 ? includedProjects.size : projects.length} project{(includedProjects.size > 0 ? includedProjects.size : projects.length) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 p-4 bg-panel rounded-[14px] border-[1.5px] border-line">
        <h2 className="text-sm font-semibold text-ink mb-3">Filters</h2>

        {/* Project Toggles */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted">Projects:</span>
            <button
              onClick={selectAllProjects}
              aria-pressed={includedProjects.size === 0}
              className={`text-xs px-2.5 py-1 rounded-full border-[1.5px] font-semibold ${
                includedProjects.size === 0
                  ? 'bg-primary text-on-primary border-card-line'
                  : 'bg-page text-ink border-line hover:bg-hover'
              }`}
            >
              All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {projects.map(project => {
              const stats = projectStats[project.id] || {};
              const isIncluded = includedProjects.size === 0 || includedProjects.has(project.id);

              return (
                <button
                  key={project.id}
                  onClick={() => toggleProject(project.id)}
                  aria-pressed={isIncluded}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border-[1.5px] transition-colors
                    ${isIncluded
                      ? 'bg-panel border-active-ring text-ink font-semibold'
                      : 'bg-page border-dash border-dashed text-muted hover:bg-hover'
                    }
                  `}
                >
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full border border-card-line flex-shrink-0"
                    style={{ backgroundColor: paletteFor(project.id).fill }}
                  />
                  <span>{project.name}</span>
                  <span className="text-xs opacity-75">
                    {stats.done}/{stats.total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resource Filter */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hideClaudeSub}
              onChange={(e) => setHideClaudeSub(e.target.checked)}
              className="rounded border-divider bg-page text-link focus:ring-active-ring"
            />
            <span className="text-sm text-ink">Hide claude_sub tasks</span>
            <span className="text-xs text-muted">(for when tokens depleted)</span>
          </label>
        </div>
      </div>

      {/* Project Stats Summary */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {projects
          .filter(p => includedProjects.size === 0 || includedProjects.has(p.id))
          .map(project => {
            const stats = projectStats[project.id] || {};
            const percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

            return (
              <div
                key={project.id}
                className="p-4 bg-panel rounded-[14px] border-[1.5px] border-line shadow-card"
              >
                <h3 className="font-semibold text-ink mb-2 flex items-center gap-2 min-w-0" title={project.name}>
                  <span
                    aria-hidden="true"
                    className="w-3 h-3 rounded-full border-[1.5px] border-card-line flex-shrink-0"
                    style={{ backgroundColor: paletteFor(project.id).fill }}
                  />
                  <span className="truncate">{project.name}</span>
                </h3>

                {/* Progress bar */}
                <div className="h-2.5 bg-page border border-line rounded-full mb-2 overflow-hidden">
                  <div
                    className="h-full bg-progress border-r-[1.5px] border-card-line transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-muted">
                  <span>{stats.done}/{stats.total} complete</span>
                  <span>{percentage}%</span>
                </div>

                <div className="mt-2 flex gap-3 text-xs">
                  <span className="text-link">{stats.inProgress} in progress</span>
                  <span className="text-success-text">{stats.workable} workable</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Workable Cards List */}
      <div className="flex-1 overflow-auto scrollbar-themed">
        <h2 className="text-lg font-semibold text-ink mb-4">Workable Cards</h2>

        {workableCards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted">
              {hideClaudeSub
                ? 'No workable cards found (try disabling the claude_sub filter)'
                : 'No workable cards found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {workableCards.map(card => (
              <div
                key={`${card.projectId}-${card.id}`}
                className="p-4 rounded-[14px] border-[1.5px] border-card-line shadow-card text-card-ink"
                style={{ backgroundColor: paletteFor(card.id).fill }}
              >
                <div className="flex items-start gap-3">
                  {/* Session letter in the card's deep shade */}
                  <div
                    className="flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-sm text-cream"
                    style={{ backgroundColor: paletteFor(card.id).deep }}
                  >
                    {card.session_letter}
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs truncate">
                        {card.projectName} / {card.phaseName} / {card.subphaseName}
                      </span>
                    </div>

                    <h3 className="font-semibold mb-2">{card.title}</h3>

                    {card.description && (
                      <p className="text-sm line-clamp-2 mb-2">
                        {card.description}
                      </p>
                    )}

                    {/* Chips */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={chip}>{card.status}</span>

                      <span
                        className={`${chip} flex items-center gap-1`}
                        title={resourceLabels[card.resource]?.label}
                      >
                        <ResourceIcon resource={card.resource} className="w-3.5 h-3.5" />
                        <span>{card.resource}</span>
                      </span>

                      {card.complexity && (
                        <span className={chip}>{card.complexity}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AllProjectsView;
