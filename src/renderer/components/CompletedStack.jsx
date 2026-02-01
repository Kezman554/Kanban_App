import React, { useState } from 'react';
import Card from './Card';
import StackExpandModal from './StackExpandModal';

const EDGE_PEEK = 8; // pixels of edge visible for each stacked card
const MAX_VISIBLE_EDGES = 5; // max stacked card edges to show

const CompletedStack = ({ cards, onCardClick }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cards || cards.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
        <span className="text-xs text-dark-text-secondary">No completed cards</span>
      </div>
    );
  }

  // Cards should already be sorted by completed_at DESC (most recent first)
  // cards[0] is the most recently completed (top of stack)
  // cards[n] is the oldest completed (showing only edge underneath)
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
            className="absolute left-0 right-0 h-2 bg-dark-surface border border-green-700 rounded-b-lg"
            style={{
              bottom: -((index + 1) * EDGE_PEEK),
              zIndex: MAX_VISIBLE_EDGES - index,
            }}
          />
        ))}

        {/* Top card (fully visible) */}
        <div className="relative" style={{ zIndex: MAX_VISIBLE_EDGES + 1 }}>
          <Card
            card={{ ...cards[0], isBlocked: false }}
            onClick={onCardClick}
            isStacked={false}
          />

          {/* Expand button - only shown when there's a stack */}
          {hasStack && (
            <button
              onClick={handleExpandClick}
              className="absolute top-2 right-2 w-6 h-6 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center justify-center shadow-lg transition-colors z-10"
              title={`View all ${cards.length} completed cards`}
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
            className="absolute right-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold shadow-lg"
            style={{
              bottom: -(totalStackHeight + 4),
              zIndex: MAX_VISIBLE_EDGES + 2
            }}
            title={`${cards.length} completed cards`}
          >
            {cards.length}
          </div>
        )}
      </div>

      {/* Expand Modal */}
      <StackExpandModal
        cards={cards.map(c => ({ ...c, isBlocked: false }))}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCardClick={onCardClick}
        title={`${cards.length} Completed Cards`}
      />
    </>
  );
};

export default CompletedStack;
