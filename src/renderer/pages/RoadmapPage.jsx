import React from 'react';
import RoadmapView from '../components/RoadmapView';

function RoadmapPage({ selectedProjectId }) {
  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dark-text mb-2">No Project Selected</h2>
          <p className="text-dark-text-secondary">
            Please select a project from the sidebar to view its roadmap.
          </p>
        </div>
      </div>
    );
  }

  return <RoadmapView projectId={selectedProjectId} />;
}

export default RoadmapPage;
