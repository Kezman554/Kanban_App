import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Lock, LinkIcon, Check, GripVertical, ResourceIcon } from './icons';

const Card = ({ card, onClick, isDragging = false, isStacked = false, onUnlock }) => {
  // Disable drag for stacked cards OR blocked cards (even if at top of stack)
  const isDragDisabled = isStacked || card.isBlocked;

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id,
    disabled: isDragDisabled,
  });

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
  const resourceLabels = {
    claude_sub: 'Claude Subscription',
    anthropic_api: 'Anthropic API',
    none: 'Manual Task',
    tbc: 'To Be Confirmed'
  };

  // Status colors and styles
  const statusStyles = {
    'Not Started': {
      bg: 'bg-panel',
      border: 'border-divider',
      text: 'text-ink'
    },
    'In Progress': {
      bg: 'bg-panel',
      border: 'border-primary',
      text: 'text-ink',
      borderWidth: 'border-2'
    },
    'Done': {
      bg: 'bg-panel/50',
      border: 'border-success-text',
      text: 'text-muted'
    },
    'Blocked': {
      bg: 'bg-panel/30',
      border: 'border-divider',
      text: 'text-muted'
    }
  };

  // Determine if card is blocked - trust the passed isBlocked value if set
  const isBlocked = card.isBlocked === true;
  const actualStatus = isBlocked ? 'Blocked' : card.status;
  const statusStyle = statusStyles[actualStatus] || statusStyles['Not Started'];

  // Cross-project (external) dependencies that are not yet resolved
  const unresolvedExternalDeps = (card.external_dependencies || []).filter(d => !d.resolved);
  const externalDepTooltip = unresolvedExternalDeps
    .map(d => `${d.project_slug}/${d.card_letter}${d.description ? `: ${d.description}` : ''} — ${d.status ? d.status : 'not found'}`)
    .join('\n');

  // Complexity badge colors
  const complexityColors = {
    low: 'bg-pal-mint text-card-ink',
    medium: 'bg-pal-marigold text-card-ink',
    high: 'bg-pal-coral text-card-ink'
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
        ${!isStacked && !card.isBlocked ? 'hover:shadow-card hover:border-primary/60' : ''}
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
              className={`drag-handle flex-shrink-0 p-1 text-muted ${
                onUnlock ? 'cursor-pointer hover:text-warn-text' : ''
              }`}
              onClick={onUnlock ? (e) => {
                e.stopPropagation();
                onUnlock(card);
              } : undefined}
              title={onUnlock ? 'Click to unlock this card' : 'Complete dependencies to unlock'}
            >
              <Lock className="w-4 h-4" />
            </div>
          ) : (
            <div
              className="drag-handle flex-shrink-0 p-1 text-muted hover:text-ink"
              {...listeners}
              {...attributes}
              title="Drag to move card"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          )}

          {/* Session Letter Badge */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded flex items-center justify-center font-bold text-sm
            ${actualStatus === 'Done' ? 'bg-done text-cream' : 'bg-page text-ink'}
          `}>
            {actualStatus === 'Done' ? <Check className="w-4 h-4" /> : card.session_letter}
          </div>

          {/* Card Title */}
          <h3 className={`text-sm font-semibold ${statusStyle.text} flex-1 line-clamp-2`}>
            {card.title}
          </h3>
        </div>

        {/* Resource Icon - hide for manual tasks */}
        {card.resource !== 'none' && (
          <div className="flex-shrink-0 text-muted" title={resourceLabels[card.resource]}>
            <ResourceIcon resource={card.resource} className="w-5 h-5" />
            <span className="sr-only">{resourceLabels[card.resource]}</span>
          </div>
        )}
      </div>

      {/* Status and Badges Row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* Status Indicator */}
        <span className={`
          text-xs px-2 py-0.5 rounded-full
          ${actualStatus === 'Not Started' ? 'bg-raised text-muted' : ''}
          ${actualStatus === 'In Progress' ? 'bg-primary text-on-primary' : ''}
          ${actualStatus === 'Done' ? 'bg-done text-on-done' : ''}
          ${actualStatus === 'Blocked' ? 'bg-pal-coral text-card-ink' : ''}
        `}>
          {actualStatus}
        </span>

        {/* Blocked Indicator */}
        {isBlocked && (
          <div
            className="text-xs px-2 py-0.5 rounded border border-danger-text text-danger-text flex items-center gap-1"
            title={card.blockedReason || `Depends on: ${card.depends_on_cards.join(', ')}`}
          >
            <Lock className="w-3 h-3" />
            <span>Blocked</span>
          </div>
        )}

        {/* External (cross-project) Dependency Indicator - distinct from internal lock */}
        {unresolvedExternalDeps.length > 0 && (
          <div
            className="text-xs px-2 py-0.5 rounded bg-pal-marigold text-card-ink border border-card-line flex items-center gap-1 max-w-[12rem]"
            title={`Blocked by other project${unresolvedExternalDeps.length > 1 ? 's' : ''}:\n${externalDepTooltip}`}
          >
            <LinkIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {unresolvedExternalDeps.length === 1
                ? unresolvedExternalDeps[0].project_slug
                : `${unresolvedExternalDeps.length} external`}
            </span>
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
          <span className="text-xs px-2 py-0.5 rounded bg-pal-lilac text-card-ink border border-card-line">
            Manual
          </span>
        )}

        {/* TBC Indicator */}
        {card.resource === 'tbc' && (
          <span className="text-xs px-2 py-0.5 rounded bg-pal-apricot text-card-ink border border-card-line">
            TBC
          </span>
        )}

        {/* Placeholder Indicator */}
        {card.is_placeholder && (
          <span className="text-xs px-2 py-0.5 rounded bg-pal-marigold text-card-ink border border-card-line">
            Placeholder
          </span>
        )}

        {/* Expansion Flag */}
        {card.likely_needs_expansion && (
          <span className="text-xs px-2 py-0.5 rounded bg-pal-lilac text-card-ink border border-card-line">
            May Expand
          </span>
        )}
      </div>

    </div>
  );
};

export default Card;
