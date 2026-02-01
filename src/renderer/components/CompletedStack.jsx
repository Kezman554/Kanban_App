import React from 'react';
import Card from './Card';

const PEEK_AMOUNT = 40; // pixels visible of each stacked card
const MAX_VISIBLE_STACKED = 5; // max cards to show visually stacked

const CompletedStack = ({ cards, onCardClick }) => {
  if (!cards || cards.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
        <span className="text-xs text-dark-text-secondary">No completed cards</span>
      </div>
    );
  }

  // Cards should already be sorted by completed_at DESC (most recent first)
  // cards[0] is the most recently completed (top of stack)
  // cards[n] is the oldest completed (bottom, peeking underneath)
  const visibleCards = cards.slice(0, MAX_VISIBLE_STACKED);
  const hiddenCount = cards.length - MAX_VISIBLE_STACKED;

  return (
    <div className="relative">
      {visibleCards.map((card, index) => {
        const isTop = index === 0;
        const peekOffset = index * PEEK_AMOUNT;

        return (
          <div
            key={card.id}
            className="transition-all duration-200"
            style={{
              position: isTop ? 'relative' : 'absolute',
              top: isTop ? 0 : peekOffset,
              left: 0,
              right: 0,
              zIndex: visibleCards.length - index,
            }}
          >
            <Card
              card={{ ...card, isBlocked: false }}
              onClick={onCardClick}
              isStacked={!isTop}
            />
          </div>
        );
      })}

      {/* Spacer to account for peeking cards */}
      {cards.length > 1 && (
        <div style={{ height: (visibleCards.length - 1) * PEEK_AMOUNT }} />
      )}

      {/* Hidden cards indicator */}
      {hiddenCount > 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{
            top: visibleCards.length * PEEK_AMOUNT + 8,
            zIndex: 0,
          }}
        >
          <span className="text-xs px-2 py-1 rounded bg-dark-surface border border-dark-border text-dark-text-secondary">
            +{hiddenCount} more completed
          </span>
        </div>
      )}

      {/* Stack count badge on top card - green themed for completed */}
      {cards.length > 1 && (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shadow-lg"
          style={{ zIndex: visibleCards.length + 1 }}
          title={`${cards.length} completed cards`}
        >
          {cards.length}
        </div>
      )}
    </div>
  );
};

export default CompletedStack;
