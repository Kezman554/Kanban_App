import React, { useCallback } from 'react';
import Terminal from './Terminal.jsx';
import { useTerminalSessions } from '../contexts/TerminalSessionContext.jsx';

/**
 * Tabbed terminal area showing all active terminal sessions.
 * Terminals remain mounted when not visible to preserve state.
 */
const TerminalTabs = ({ onCardClick }) => {
  const {
    sessions,
    activeCardId,
    switchToSession,
    closeSession,
    updateSessionStatus,
    getAllSessions,
  } = useTerminalSessions();

  const allSessions = getAllSessions();

  const handleTerminalExit = useCallback((cardId, exitCode) => {
    updateSessionStatus(cardId, exitCode);
  }, [updateSessionStatus]);

  const handleCloseTab = useCallback((e, cardId) => {
    e.stopPropagation();
    closeSession(cardId);
  }, [closeSession]);

  const handleTabClick = useCallback((cardId) => {
    switchToSession(cardId);
    if (onCardClick) {
      onCardClick(cardId);
    }
  }, [switchToSession, onCardClick]);

  if (allSessions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-dark-bg border-t border-dark-border">
      {/* Tab Bar */}
      <div className="flex items-center bg-dark-surface border-b border-dark-border overflow-x-auto scrollbar-dark">
        <div className="flex items-center px-2 py-1 gap-1 flex-nowrap">
          {allSessions.map(({ cardId, sessionLetter, cardTitle, status }) => {
            const isActive = cardId === activeCardId;
            const isRunning = status === 'running';

            return (
              <button
                key={cardId}
                onClick={() => handleTabClick(cardId)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors
                  min-w-[120px] max-w-[200px] group
                  ${isActive
                    ? 'bg-dark-bg text-dark-text border-t border-l border-r border-dark-border -mb-px'
                    : 'bg-dark-surface text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text'
                  }
                `}
              >
                {/* Session Letter Badge */}
                <span className={`
                  flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold
                  ${isActive ? 'bg-blue-600 text-white' : 'bg-dark-border text-dark-text'}
                `}>
                  {sessionLetter}
                </span>

                {/* Status Indicator */}
                {isRunning ? (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                ) : (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-500" />
                )}

                {/* Title (truncated) */}
                <span className="truncate flex-1 text-left">
                  {cardTitle || `Session ${sessionLetter}`}
                </span>

                {/* Close Button */}
                <button
                  onClick={(e) => handleCloseTab(e, cardId)}
                  className={`
                    flex-shrink-0 w-5 h-5 rounded flex items-center justify-center
                    opacity-0 group-hover:opacity-100 transition-opacity
                    hover:bg-red-600 hover:text-white text-dark-text-secondary
                  `}
                  title="Close terminal"
                >
                  x
                </button>
              </button>
            );
          })}
        </div>

        {/* Active Session Info */}
        <div className="flex-1 flex items-center justify-end px-4">
          <span className="text-xs text-dark-text-secondary">
            {allSessions.length} terminal{allSessions.length !== 1 ? 's' : ''} active
          </span>
        </div>
      </div>

      {/* Terminal Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {allSessions.map(({ cardId, command, cwd }) => {
          const isVisible = cardId === activeCardId;

          return (
            <div
              key={cardId}
              className={`absolute inset-0 ${isVisible ? 'z-10' : 'z-0 pointer-events-none'}`}
              style={{ visibility: isVisible ? 'visible' : 'hidden' }}
            >
              <Terminal
                initialCommand={command}
                cwd={cwd}
                onExit={(exitCode, signal) => handleTerminalExit(cardId, exitCode)}
                className="h-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TerminalTabs;
