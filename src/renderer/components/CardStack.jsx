import React, { useState } from 'react';
import Card from './Card';
import StackExpandModal from './StackExpandModal';
import { Maximize2 } from './icons';
import { paletteFor } from '../utils/palette';

// Cards under the top card fan out behind it, nearest first: x, y (px), rotation (deg)
export const FAN_OFFSETS = [
  { x: 7, y: 9, r: 2.6 },
  { x: -6, y: 17, r: -2.2 },
  { x: 9, y: 25, r: 3.4 },
  { x: -4, y: 32, r: -1.6 },
];

// Full-size blank sheets behind a top card. Coloured in each card's own
// palette colour, or blank dashed sheets when the top card is blocked.
export const FanSheets = ({ cards, offsets, blank }) => (
  <>
    {cards.map((card, index) => {
      const o = offsets[index];
      return (
        <div
          key={card.id}
          aria-hidden="true"
          className={`absolute inset-0 rounded-[14px] border-[1.5px] ${
            blank ? 'bg-blocked border-dashed border-dash' : 'border-card-line shadow-card'
          }`}
          style={{
            transform: `translate(${o.x}px, ${o.y}px) rotate(${o.r}deg)`,
            zIndex: offsets.length - index,
            ...(blank ? {} : { backgroundColor: paletteFor(card.id).fill }),
          }}
        />
      );
    })}
  </>
);

// Teal expand button (top right) and count pill (bottom right of the fan)
export const StackControls = ({ count, depth, onExpand, expandTitle, countTitle }) => (
  <>
    <button
      onClick={onExpand}
      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-on-primary border-[1.5px] border-card-line flex items-center justify-center shadow-card hover:brightness-110 transition z-20"
      title={expandTitle}
      aria-label={expandTitle}
    >
      <Maximize2 className="w-3.5 h-3.5" />
    </button>
    <div
      className="absolute -right-2 px-2 py-0.5 rounded-full bg-primary text-on-primary border-[1.5px] border-card-line text-xs font-bold shadow-card z-20"
      style={{ bottom: -depth - 6 }}
      title={countTitle}
    >
      {count}
    </div>
  </>
);

const CardStack = ({ cards, onCardClick, onUnlockCard, onUnlockTopCard }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cards || cards.length === 0) return null;

  // cards[0] is the top card; up to four of the rest fan out behind it
  const hasStack = cards.length > 1;
  const behind = cards.slice(1, FAN_OFFSETS.length + 1);
  const depth = behind.length ? FAN_OFFSETS[behind.length - 1].y : 0;

  const handleExpandClick = (e) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      {/* isolate: the fan, pill and button layer only within this stack */}
      <div className="relative isolate" style={{ marginBottom: depth + (hasStack ? 10 : 0) }}>
        {hasStack && <FanSheets cards={behind} offsets={FAN_OFFSETS} blank={cards[0].isBlocked} />}

        {/* Top card (fully visible, never tilted) */}
        <div className="relative" style={{ zIndex: FAN_OFFSETS.length + 1 }}>
          <Card
            card={cards[0]}
            onClick={onCardClick}
            isStacked={false}
            onUnlock={cards[0].isBlocked && (onUnlockTopCard || onUnlockCard) ? (onUnlockTopCard || onUnlockCard) : undefined}
          />
        </div>

        {hasStack && (
          <StackControls
            count={cards.length}
            depth={depth}
            onExpand={handleExpandClick}
            expandTitle={`View all ${cards.length} cards in stack`}
            countTitle={`${cards.length} cards in this dependency chain`}
          />
        )}
      </div>

      {/* Expand Modal */}
      <StackExpandModal
        cards={cards}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCardClick={onCardClick}
        onUnlockCard={onUnlockCard}
        title={`${cards.length} Cards in Stack`}
        cardProps={{ fillLetter: true }}
      />
    </>
  );
};

export default CardStack;
