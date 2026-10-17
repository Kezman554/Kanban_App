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

// An invisible chip: holds the chip row open on cards with no tags
const ChipPlaceholder = () => (
  <span aria-hidden="true" className="invisible">
    <Chip>-</Chip>
  </span>
);

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

// Every card (and empty slot) shares one minimum height so stacks line up; it
// fits a three-line title over one chip row. The chip row sits at the bottom.
const CARD_MIN_H = 'min-h-[120px] flex flex-col';

// An empty slot the exact size of a one-line card (same border, padding, letter
// row and chip row), for "No cards" placeholders
export const EmptyCardSlot = ({ children, dashed = false }) => (
  <div className={`relative ${CARD_MIN_H} p-3 rounded-[14px] border-[1.5px] ${dashed ? 'border-dashed border-dash' : 'border-divider'}`}>
    <div className="h-[34px]" aria-hidden="true" />
    <div className="flex mt-auto pt-2">
      <ChipPlaceholder />
    </div>
    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">{children}</span>
  </div>
);

// colourDone: a done card keeps its palette colour (the Done pile's expanded view).
// fillLetter: a blocked card's letter circle takes its deep shade (the expanded
// Not Started stack); the card itself stays uncoloured.
const Card = ({ card, onClick, isDragging = false, isStacked = false, onUnlock, tilt = false, colourDone = false, fillLetter = false }) => {
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
  // Drawn on the panel colour: a done card, unless the view asks for its colour
  const onPanel = isDone && !colourDone;

  // Blocked: never coloured. Dashed outline, blocked fill, lock, letter, title, "waits on X"
  if (isBlocked) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`${CARD_MIN_H} bg-blocked border-[1.5px] border-dashed border-dash rounded-[14px] p-3 text-ink
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
          <div
            className={`flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-sm ${
              fillLetter ? 'text-cream' : 'border-[1.5px] border-dashed border-dash'
            }`}
            style={fillLetter ? { backgroundColor: paletteFor(card.id).deep } : undefined}
          >
            {card.session_letter}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold line-clamp-3">{card.title}</h3>
          </div>
        </div>

        {/* "waits on X" sits in the chip row, so blocked cards match the others' height */}
        <div className="flex items-center gap-1.5 mt-auto pt-2 pl-[74px] min-w-0">
          {card.waitsOn ? (
            <p className="text-xs text-muted truncate leading-[22px]" title={card.blockedReason || card.waitsOn}>
              {card.waitsOn}
            </p>
          ) : <ChipPlaceholder />}
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
      style={onPanel ? style : { ...style, backgroundColor: colour.fill }}
      className={`
        ${onPanel ? 'bg-panel text-ink border-line' : 'text-card-ink border-card-line'}
        ${CARD_MIN_H} border-[1.5px] rounded-[14px] p-3 shadow-card
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
          <h3 className="text-sm font-semibold flex-1 line-clamp-3">
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

      {/* Chips: complexity (when not medium), Manual, TBC, Placeholder, May Expand.
          Always drawn, with an invisible chip when empty, so every card is the same size */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 flex-wrap">
        {!hasChips && <ChipPlaceholder />}
        {unresolvedExternalDeps.length > 0 && (
          <Chip
            onPanel={onPanel}
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
        {card.complexity && card.complexity !== 'medium' && <Chip onPanel={onPanel}>{card.complexity}</Chip>}
        {card.resource === 'none' && <Chip onPanel={onPanel}>Manual</Chip>}
        {card.resource === 'tbc' && <Chip onPanel={onPanel} title="Approach to be confirmed">TBC</Chip>}
        {card.is_placeholder && <Chip onPanel={onPanel}>Placeholder</Chip>}
        {card.likely_needs_expansion && <Chip onPanel={onPanel}>May Expand</Chip>}
      </div>
    </div>
  );
};

export default Card;
