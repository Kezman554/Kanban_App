import React, { useState } from 'react';
import Card from './Card';
import StackExpandModal from './StackExpandModal';

const EDGE_PEEK = 8; // pixels of edge visible for each stacked card
const MAX_VISIBLE_EDGES = 5; // max stacked card edges to show

const CardStack = ({ cards, onCardClick, onUnlockCard }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cards || cards.length === 0) return null;

  // cards[0] is the actionable (top) card
  // cards[1...n] are blocked cards showing only their edges underneath
  const hasStack = cards.length > 1;
  const visibleEdges = Math.min(cards.length - 1, MAX_VISIBLE_EDGES);
  const totalStackHeight = visibleEdges * EDGE_PEEK;

  const handleExpandClick = (e) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="relative" style={{ marginBottom: hasStack ? totalStackHeight : 0 }}>
        {/* Stacked card edges (only showing border rims, overlapping bottom of top card) */}
        {hasStack && cards.slice(1, MAX_VISIBLE_EDGES + 1).map((card, index) => (
          <div
            key={card.id}
            className="absolute left-0 right-0 h-2 bg-dark-surface border border-dark-border rounded-b-lg"
            style={{
              bottom: -((index + 1) * EDGE_PEEK),
              zIndex: MAX_VISIBLE_EDGES - index,
            }}
          />
        ))}

        {/* Top card (fully visible) */}
        <div className="relative" style={{ zIndex: MAX_VISIBLE_EDGES + 1 }}>
          <Card
            card={cards[0]}
            onClick={onCardClick}
            isStacked={false}
          />

          {/* Expand button - only shown when there's a stack */}
          {hasStack && (
            <button
              onClick={handleExpandClick}
              className="absolute top-2 right-2 w-6 h-6 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center shadow-lg transition-colors z-10"
              title={`View all ${cards.length} cards in stack`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Stack count badge - positioned at bottom of stacked edges */}
        {hasStack && (
          <div
            className="absolute right-2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg"
            style={{
              bottom: -(totalStackHeight + 4),
              zIndex: MAX_VISIBLE_EDGES + 2
            }}
            title={`${cards.length} cards in this dependency chain`}
          >
            {cards.length}
          </div>
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
      />
    </>
  );
};

export default CardStack;
