import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Lock, Check, GripVertical, LinkIcon, ResourceIcon } from './icons';
import { paletteFor, tiltFor } from '../utils/palette';

const resourceLabels = {
  claude_sub: 'Claude Subscription',
  anthropic_api: 'Anthropic API',
  none: 'Manual Task',
  tbc: 'To Be Confirmed'
};

// Small pill on a card: thin outline on a translucent cream fill. On the
// panel-coloured done card it is outline-only so it follows the theme.
const Chip = ({ children, title, onPanel }) => (
  <span
    className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
      onPanel ? 'border-line text-ink' : 'border-card-line bg-cream/60 text-card-ink'
    }`}
    title={title}
  >
    {children}
  </span>
);

const Card = ({ card, onClick, isDragging = false, isStacked = false, onUnlock, tilt = false }) => {
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

  // While dragging, dnd-kit owns the transform; at rest a standalone card may tilt
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : tilt ? { transform: `rotate(${tiltFor(card.id)}deg)` } : {};

  // Determine if card is blocked - trust the passed isBlocked value if set
  const isBlocked = card.isBlocked === true;
  const isDone = card.status === 'Done';

  // Blocked: never coloured. Dashed outline, blocked fill, lock, letter, title, "waits on X"
  if (isBlocked) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-blocked border-[1.5px] border-dashed border-dash rounded-[14px] p-3 text-ink
          ${isStacked ? 'cursor-default' : 'cursor-pointer'} ${isDragging ? 'opacity-50' : ''}`}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2">
          <div
            className={`drag-handle flex-shrink-0 p-1 text-muted ${onUnlock ? 'cursor-pointer hover:text-ink' : ''}`}
            onClick={onUnlock ? (e) => {
              e.stopPropagation();
              onUnlock(card);
            } : undefined}
            title={onUnlock ? 'Click to unlock this card' : 'Complete dependencies to unlock'}
            role={onUnlock ? 'button' : undefined}
            aria-label={onUnlock ? `Unlock ${card.session_letter}` : 'Blocked'}
          >
            <Lock className="w-4 h-4" />
          </div>
          <div className="flex-shrink-0 w-[34px] h-[34px] rounded-full border-[1.5px] border-dashed border-dash flex items-center justify-center font-bold text-sm">
            {card.session_letter}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold line-clamp-2">{card.title}</h3>
            {card.waitsOn && (
              <p className="text-xs text-muted mt-0.5 truncate" title={card.blockedReason || card.waitsOn}>
                {card.waitsOn}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const colour = paletteFor(card.id);

  // Cross-project (external) dependencies that are not yet resolved
  const unresolvedExternalDeps = (card.external_dependencies || []).filter(d => !d.resolved);
  const externalDepTooltip = unresolvedExternalDeps
    .map(d => `${d.project_slug}/${d.card_letter}${d.description ? `: ${d.description}` : ''} — ${d.status ? d.status : 'not found'}`)
    .join('\n');

  const hasChips = unresolvedExternalDeps.length > 0 || (card.complexity && card.complexity !== 'medium') || card.resource === 'none' ||
    card.resource === 'tbc' || card.is_placeholder || card.likely_needs_expansion;

  return (
    <div
      ref={setNodeRef}
      style={isDone ? style : { ...style, backgroundColor: colour.fill }}
      className={`
        ${isDone ? 'bg-panel text-ink border-line' : 'text-card-ink border-card-line'}
        border-[1.5px] rounded-[14px] p-3 shadow-card
        ${isStacked ? 'cursor-default' : 'cursor-pointer hover:brightness-[0.97]'}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={handleClick}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Drag Handle */}
          {!isDragDisabled && (
            <div
              className="drag-handle flex-shrink-0 p-1 cursor-grab"
              {...listeners}
              {...attributes}
              title="Drag to move card"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          )}

          {/* Session letter in the deep shade, or the done tick */}
          <div
            className={`flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-sm ${
              isDone ? 'bg-done text-on-done' : 'text-cream'
            }`}
            style={isDone ? undefined : { backgroundColor: colour.deep }}
            title={isDone ? `Done: ${card.session_letter}` : undefined}
          >
            {isDone ? (
              <>
                <Check className="w-4 h-4" />
                <span className="sr-only">Done: {card.session_letter}</span>
              </>
            ) : card.session_letter}
          </div>

          {/* Card Title */}
          <h3 className="text-sm font-semibold flex-1 line-clamp-2">
            {card.title}
          </h3>
        </div>

        {/* Resource Icon - hide for manual tasks */}
        {card.resource !== 'none' && (
          <div className="flex-shrink-0 pt-1" title={resourceLabels[card.resource]}>
            <ResourceIcon resource={card.resource} className="w-5 h-5" />
            <span className="sr-only">{resourceLabels[card.resource]}</span>
          </div>
        )}
      </div>

      {/* Chips: complexity (when not medium), Manual, TBC, Placeholder, May Expand */}
      {hasChips && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {unresolvedExternalDeps.length > 0 && (
            <Chip
              onPanel={isDone}
              title={`Blocked by other project${unresolvedExternalDeps.length > 1 ? 's' : ''}:\n${externalDepTooltip}`}
            >
              <span className="inline-flex items-center gap-1 max-w-[12rem] align-bottom">
                <LinkIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {unresolvedExternalDeps.length === 1
                    ? unresolvedExternalDeps[0].project_slug
                    : `${unresolvedExternalDeps.length} external`}
                </span>
              </span>
            </Chip>
          )}
          {card.complexity && card.complexity !== 'medium' && <Chip onPanel={isDone}>{card.complexity}</Chip>}
          {card.resource === 'none' && <Chip onPanel={isDone}>Manual</Chip>}
          {card.resource === 'tbc' && <Chip onPanel={isDone} title="Approach to be confirmed">TBC</Chip>}
          {card.is_placeholder && <Chip onPanel={isDone}>Placeholder</Chip>}
          {card.likely_needs_expansion && <Chip onPanel={isDone}>May Expand</Chip>}
        </div>
      )}
    </div>
  );
};

export default Card;
