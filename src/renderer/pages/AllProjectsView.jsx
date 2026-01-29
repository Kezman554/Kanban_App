import React, { useState, useEffect, useMemo } from 'react';

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
  const getCardsWithBlockedStatus = (project) => {
    if (!project?.phases) return [];

    const allCards = [];
    const cardStatusByLetter = {};

    // First pass: collect all cards and their statuses
    for (const phase of project.phases) {
      for (const subphase of phase.subphases || []) {
        for (const card of subphase.cards || []) {
          cardStatusByLetter[card.session_letter] = card.status;
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

    // Second pass: determine blocked status
    return allCards.map(card => {
      let isBlocked = false;
      let blockedReason = null;

      if (card.depends_on_cards && card.depends_on_cards.length > 0 && card.status === 'Not Started') {
        const incompleteCards = card.depends_on_cards.filter(
          letter => cardStatusByLetter[letter] !== 'Done'
        );
        if (incompleteCards.length > 0) {
          isBlocked = true;
          blockedReason = `Waiting on: ${incompleteCards.join(', ')}`;
        }
      }

      return { ...card, isBlocked, blockedReason };
    });
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

  // Resource icons mapping
  const resourceIcons = {
    claude_sub: { icon: '🤖', label: 'Claude Subscription' },
    anthropic_api: { icon: '🔧', label: 'Anthropic API' },
    none: { icon: '✋', label: 'Manual Task' },
    tbc: { icon: '❓', label: 'To Be Confirmed' }
  };

  // Complexity badge colors
  const complexityColors = {
    low: 'bg-green-900 text-green-300',
    medium: 'bg-yellow-900 text-yellow-300',
    high: 'bg-red-900 text-red-300'
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-dark-text-secondary">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Error: {error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
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
        <h1 className="text-2xl font-bold text-dark-text mb-2">All Projects View</h1>
        <p className="text-dark-text-secondary">
          Showing {workableCards.length} workable cards across {includedProjects.size > 0 ? includedProjects.size : projects.length} project{(includedProjects.size > 0 ? includedProjects.size : projects.length) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 p-4 bg-dark-surface rounded-lg border border-dark-border">
        <h2 className="text-sm font-semibold text-dark-text mb-3">Filters</h2>

        {/* Project Toggles */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-dark-text-secondary">Projects:</span>
            <button
              onClick={selectAllProjects}
              className={`text-xs px-2 py-1 rounded ${
                includedProjects.size === 0
                  ? 'bg-blue-600 text-white'
                  : 'bg-dark-bg text-dark-text-secondary hover:text-dark-text'
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
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                    ${isIncluded
                      ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
                      : 'bg-dark-bg border border-dark-border text-dark-text-secondary hover:border-dark-hover'
                    }
                  `}
                >
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
              className="rounded border-dark-border bg-dark-bg text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-dark-text">Hide claude_sub tasks</span>
            <span className="text-xs text-dark-text-secondary">(for when tokens depleted)</span>
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
                className="p-4 bg-dark-surface rounded-lg border border-dark-border"
              >
                <h3 className="font-semibold text-dark-text mb-2 truncate" title={project.name}>
                  {project.name}
                </h3>

                {/* Progress bar */}
                <div className="h-2 bg-dark-bg rounded-full mb-2 overflow-hidden">
                  <div
                    className="h-full bg-green-600 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-dark-text-secondary">
                  <span>{stats.done}/{stats.total} complete</span>
                  <span>{percentage}%</span>
                </div>

                <div className="mt-2 flex gap-3 text-xs">
                  <span className="text-blue-400">{stats.inProgress} in progress</span>
                  <span className="text-green-400">{stats.workable} workable</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Workable Cards List */}
      <div className="flex-1 overflow-auto scrollbar-dark">
        <h2 className="text-lg font-semibold text-dark-text mb-4">Workable Cards</h2>

        {workableCards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-dark-text-secondary">
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
                className="p-4 bg-dark-surface rounded-lg border border-dark-border hover:border-dark-hover transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Session Letter Badge */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded flex items-center justify-center font-bold
                    ${card.status === 'In Progress' ? 'bg-blue-700 text-white' : 'bg-dark-bg text-dark-text'}
                  `}>
                    {card.session_letter}
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-dark-text-secondary truncate">
                        {card.projectName} / {card.phaseName} / {card.subphaseName}
                      </span>
                    </div>

                    <h3 className="font-semibold text-dark-text mb-2">{card.title}</h3>

                    {card.description && (
                      <p className="text-sm text-dark-text-secondary line-clamp-2 mb-2">
                        {card.description}
                      </p>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status */}
                      <span className={`
                        text-xs px-2 py-0.5 rounded-full
                        ${card.status === 'Not Started' ? 'bg-gray-700 text-gray-300' : ''}
                        ${card.status === 'In Progress' ? 'bg-blue-700 text-blue-200' : ''}
                      `}>
                        {card.status}
                      </span>

                      {/* Resource */}
                      <span
                        className="text-xs px-2 py-0.5 rounded bg-dark-bg text-dark-text-secondary flex items-center gap-1"
                        title={resourceIcons[card.resource]?.label}
                      >
                        <span>{resourceIcons[card.resource]?.icon}</span>
                        <span>{card.resource}</span>
                      </span>

                      {/* Complexity */}
                      {card.complexity && (
                        <span className={`text-xs px-2 py-0.5 rounded ${complexityColors[card.complexity]}`}>
                          {card.complexity}
                        </span>
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
