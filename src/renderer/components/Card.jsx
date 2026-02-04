import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTerminalSessions } from '../contexts/TerminalSessionContext.jsx';

const Card = ({ card, onClick, isDragging = false, isStacked = false, onUnlock }) => {
  const { hasActiveSession, getSession } = useTerminalSessions();

  // Disable drag for stacked cards OR blocked cards (even if at top of stack)
  const isDragDisabled = isStacked || card.isBlocked;

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id,
    disabled: isDragDisabled,
  });

  // Check if this card has an active terminal session
  const hasTerminal = hasActiveSession(card.id);
  const terminalSession = hasTerminal ? getSession(card.id) : null;
  const isTerminalRunning = terminalSession?.status === 'running';

  const handleClick = (e) => {
    // Don't trigger if clicking the drag handle or lock icon
    if (e.target.closest('.drag-handle')) {
      return;
    }
    // Only open detail panel, no inline expansion
    if (onClick) onClick(card);
  };

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  // Resource icons mapping
  const resourceIcons = {
    claude_sub: { icon: '🤖', label: 'Claude Subscription' },
    anthropic_api: { icon: '🔧', label: 'Anthropic API' },
    none: { icon: '✋', label: 'Manual Task' },
    tbc: { icon: '❓', label: 'To Be Confirmed' }
  };

  // Status colors and styles
  const statusStyles = {
    'Not Started': {
      bg: 'bg-dark-surface',
      border: 'border-dark-border',
      text: 'text-dark-text'
    },
    'In Progress': {
      bg: 'bg-dark-surface',
      border: 'border-blue-500',
      text: 'text-dark-text',
      borderWidth: 'border-2'
    },
    'Done': {
      bg: 'bg-dark-surface/50',
      border: 'border-green-700',
      text: 'text-dark-text-secondary'
    },
    'Blocked': {
      bg: 'bg-dark-surface/30',
      border: 'border-dark-border',
      text: 'text-dark-text-secondary'
    }
  };

  // Determine if card is blocked - trust the passed isBlocked value if set
  const isBlocked = card.isBlocked === true;
  const actualStatus = isBlocked ? 'Blocked' : card.status;
  const statusStyle = statusStyles[actualStatus] || statusStyles['Not Started'];

  // Complexity badge colors
  const complexityColors = {
    low: 'bg-green-900 text-green-300',
    medium: 'bg-yellow-900 text-yellow-300',
    high: 'bg-red-900 text-red-300'
  };

  // Card border style for TBC and Manual
  const getCardBorderStyle = () => {
    if (card.resource === 'tbc') {
      return 'border-dashed';
    }
    return 'border-solid';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        ${statusStyle.bg} ${statusStyle.border} ${statusStyle.borderWidth || 'border'} ${getCardBorderStyle()}
        rounded-lg p-3 transition-all
        ${isStacked ? 'opacity-70 cursor-default' : 'cursor-pointer'}
        ${!isStacked && !card.isBlocked ? 'hover:shadow-lg hover:border-blue-500/50' : ''}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={handleClick}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Drag Handle / Lock Icon */}
          {isDragDisabled ? (
            <div
              className={`drag-handle flex-shrink-0 p-1 text-dark-text-secondary/50 ${
                onUnlock ? 'cursor-pointer hover:text-yellow-400' : ''
              }`}
              onClick={onUnlock ? (e) => {
                e.stopPropagation();
                onUnlock(card);
              } : undefined}
              title={onUnlock ? 'Click to unlock this card' : 'Complete dependencies to unlock'}
            >
              🔒
            </div>
          ) : (
            <div
              className="drag-handle flex-shrink-0 p-1 text-dark-text-secondary hover:text-dark-text"
              {...listeners}
              {...attributes}
              title="Drag to move card"
            >
              ⋮⋮
            </div>
          )}

          {/* Session Letter Badge */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded flex items-center justify-center font-bold text-sm
            ${actualStatus === 'Done' ? 'bg-green-700 text-white' : 'bg-dark-bg text-dark-text'}
          `}>
            {actualStatus === 'Done' ? '✓' : card.session_letter}
          </div>

          {/* Card Title */}
          <h3 className={`text-sm font-semibold ${statusStyle.text} flex-1 line-clamp-2`}>
            {card.title}
          </h3>
        </div>

        {/* Resource Icon - hide for manual tasks */}
        {card.resource !== 'none' && (
          <div className="flex-shrink-0" title={resourceIcons[card.resource]?.label}>
            <span className="text-lg">{resourceIcons[card.resource]?.icon}</span>
          </div>
        )}

        {/* Active Terminal Indicator */}
        {hasTerminal && (
          <div
            className="flex-shrink-0 flex items-center gap-1"
            title={isTerminalRunning ? 'Terminal session running' : 'Terminal session ended'}
          >
            <span className={`
              w-3 h-3 rounded-full
              ${isTerminalRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}
            `} />
          </div>
        )}
      </div>

      {/* Status and Badges Row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* Status Indicator */}
        <span className={`
          text-xs px-2 py-0.5 rounded-full
          ${actualStatus === 'Not Started' ? 'bg-gray-700 text-gray-300' : ''}
          ${actualStatus === 'In Progress' ? 'bg-blue-700 text-blue-200' : ''}
          ${actualStatus === 'Done' ? 'bg-green-700 text-green-200' : ''}
          ${actualStatus === 'Blocked' ? 'bg-red-900 text-red-300' : ''}
        `}>
          {actualStatus}
        </span>

        {/* Blocked Indicator */}
        {isBlocked && (
          <div
            className="text-xs px-2 py-0.5 rounded bg-red-900 text-red-300 flex items-center gap-1"
            title={card.blockedReason || `Depends on: ${card.depends_on_cards.join(', ')}`}
          >
            <span>🔒</span>
            <span>Blocked</span>
          </div>
        )}

        {/* Complexity Badge */}
        {card.complexity && card.complexity !== 'medium' && (
          <span className={`text-xs px-2 py-0.5 rounded ${complexityColors[card.complexity]}`}>
            {card.complexity}
          </span>
        )}

        {/* Manual Task Indicator */}
        {card.resource === 'none' && (
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300">
            Manual
          </span>
        )}

        {/* TBC Indicator */}
        {card.resource === 'tbc' && (
          <span className="text-xs px-2 py-0.5 rounded bg-orange-900 text-orange-300">
            TBC
          </span>
        )}

        {/* Placeholder Indicator */}
        {card.is_placeholder && (
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-900 text-yellow-300">
            Placeholder
          </span>
        )}

        {/* Expansion Flag */}
        {card.likely_needs_expansion && (
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-900 text-indigo-300">
            May Expand
          </span>
        )}

        {/* Active Terminal Badge */}
        {hasTerminal && (
          <span className={`
            text-xs px-2 py-0.5 rounded flex items-center gap-1
            ${isTerminalRunning ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}
          `}>
            <span className={`w-1.5 h-1.5 rounded-full ${isTerminalRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
            Terminal
          </span>
        )}
      </div>

    </div>
  );
};

export default Card;
