import React, { useState } from 'react';

const Card = ({ card, onClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    setIsExpanded(!isExpanded);
    if (onClick) onClick(card);
  };

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

  // Determine if card is blocked
  const isBlocked = card.isBlocked || (card.depends_on_cards && card.depends_on_cards.length > 0 && card.status === 'Not Started');
  const actualStatus = isBlocked ? 'Blocked' : card.status;
  const style = statusStyles[actualStatus] || statusStyles['Not Started'];

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
      className={`
        ${style.bg} ${style.border} ${style.borderWidth || 'border'} ${getCardBorderStyle()}
        rounded-lg p-3 cursor-pointer transition-all hover:shadow-lg
        ${isExpanded ? 'ring-2 ring-blue-500' : ''}
      `}
      onClick={handleClick}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Session Letter Badge */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded flex items-center justify-center font-bold text-sm
            ${actualStatus === 'Done' ? 'bg-green-700 text-white' : 'bg-dark-bg text-dark-text'}
          `}>
            {actualStatus === 'Done' ? '✓' : card.session_letter}
          </div>

          {/* Card Title */}
          <h3 className={`text-sm font-semibold ${style.text} flex-1 line-clamp-2`}>
            {card.title}
          </h3>
        </div>

        {/* Resource Icon */}
        <div className="flex-shrink-0" title={resourceIcons[card.resource]?.label}>
          <span className="text-lg">{resourceIcons[card.resource]?.icon}</span>
        </div>
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
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-dark-border space-y-3">
          {/* Description */}
          {card.description && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Description</h4>
              <p className="text-sm text-dark-text whitespace-pre-wrap">{card.description}</p>
            </div>
          )}

          {/* Success Criteria */}
          {card.success_criteria && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Success Criteria</h4>
              <p className="text-sm text-dark-text whitespace-pre-wrap">{card.success_criteria}</p>
            </div>
          )}

          {/* Prompt Guide */}
          {card.prompt_guide && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Prompt Guide</h4>
              <p className="text-sm text-dark-text whitespace-pre-wrap">{card.prompt_guide}</p>
            </div>
          )}

          {/* Checkpoint */}
          {card.checkpoint && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Checkpoint</h4>
              <p className="text-sm text-dark-text whitespace-pre-wrap">{card.checkpoint}</p>
            </div>
          )}

          {/* Dependencies */}
          {card.depends_on_cards && card.depends_on_cards.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Dependencies</h4>
              <div className="flex gap-2 flex-wrap">
                {card.depends_on_cards.map((dep, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 rounded bg-dark-bg text-dark-text">
                    Card {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Completion Time */}
          {card.completed_at && (
            <div>
              <h4 className="text-xs font-semibold text-dark-text-secondary mb-1">Completed</h4>
              <p className="text-sm text-dark-text">{new Date(card.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Expand/Collapse Indicator */}
      <div className="mt-2 text-center">
        <span className="text-xs text-dark-text-secondary">
          {isExpanded ? '▲ Click to collapse' : '▼ Click to expand'}
        </span>
      </div>
    </div>
  );
};

export default Card;
