import React from 'react';
import Board from '../components/Board';

// The board for the selected project. The roadmap has its own sidebar entry
// (RoadmapPage), so there is no view toggle here.
function CurrentProjectPage({ selectedProjectId }) {
  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-ink mb-2">No Project Selected</h2>
          <p className="text-muted">
            Please select a project from the sidebar or create a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: '200px' }}>
      <Board projectId={selectedProjectId} />
    </div>
  );
}

export default CurrentProjectPage;
