import React, { useState, useCallback } from 'react';
import Board from '../components/Board';
import RoadmapView from '../components/RoadmapView';
import TerminalTabs from '../components/TerminalTabs';
import { useTerminalSessions } from '../contexts/TerminalSessionContext.jsx';

function CurrentProjectPage({ selectedProjectId }) {
  const { sessions } = useTerminalSessions();
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'roadmap'

  const hasActiveSessions = sessions.size > 0;

  // Handle resize drag
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);

    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.min(Math.max(startHeight + delta, 150), 600);
      setTerminalHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const toggleTerminalCollapse = useCallback(() => {
    setIsTerminalCollapsed(prev => !prev);
  }, []);

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

      {/* Terminal Area - only shows when there are active sessions */}
      {hasActiveSessions && (
        <>
          {/* Resize Handle / Collapse Toggle */}
          <div
            className={`
              flex items-center justify-center gap-2 h-6 bg-dark-surface border-t border-dark-border
              ${isTerminalCollapsed ? '' : 'cursor-ns-resize'}
              select-none
            `}
            onMouseDown={isTerminalCollapsed ? undefined : handleMouseDown}
          >
            {/* Collapse/Expand Button */}
            <button
              onClick={toggleTerminalCollapse}
              className="flex items-center gap-2 px-3 py-0.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
              title={isTerminalCollapsed ? 'Expand terminals' : 'Collapse terminals'}
            >
              <span className="transform transition-transform" style={{ transform: isTerminalCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                v
              </span>
              <span>Terminals ({sessions.size})</span>
            </button>

            {/* Resize grip (only when not collapsed) */}
            {!isTerminalCollapsed && (
              <div className="flex gap-1">
                <span className="w-8 h-1 bg-dark-border rounded" />
              </div>
            )}
          </div>

          {/* Terminal Content */}
          {!isTerminalCollapsed && (
            <div
              style={{ height: `${terminalHeight}px` }}
              className={`flex-shrink-0 ${isResizing ? 'select-none' : ''}`}
            >
              <TerminalTabs />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CurrentProjectPage;
