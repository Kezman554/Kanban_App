import React, { useState } from 'react';
import Board from '../components/Board';
import RoadmapView from '../components/RoadmapView';

function CurrentProjectPage({ selectedProjectId }) {
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'roadmap'

  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dark-text mb-2">No Project Selected</h2>
          <p className="text-dark-text-secondary">
            Please select a project from the sidebar or create a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* View Toggle */}
      <div className="flex-shrink-0 px-6 py-3 bg-dark-surface border-b border-dark-border flex items-center gap-4">
        <span className="text-sm text-dark-text-secondary">View:</span>
        <div className="flex rounded-lg overflow-hidden border border-dark-border">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'kanban'
                ? 'bg-blue-600 text-white'
                : 'bg-dark-bg text-dark-text-secondary hover:text-dark-text'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setViewMode('roadmap')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'roadmap'
                ? 'bg-blue-600 text-white'
                : 'bg-dark-bg text-dark-text-secondary hover:text-dark-text'
            }`}
          >
            Roadmap
          </button>
        </div>
      </div>

      {/* Main Content Area - takes remaining space */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: '200px' }}>
        {viewMode === 'kanban' ? (
          <Board projectId={selectedProjectId} />
        ) : (
          <RoadmapView projectId={selectedProjectId} />
        )}
      </div>
    </div>
  );
}

export default CurrentProjectPage;
