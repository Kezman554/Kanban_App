import React, { useState } from 'react';
import Card from './Card';
import StackExpandModal from './StackExpandModal';
import { FanSheets, StackControls } from './CardStack';

// Two palette-coloured cards fan out behind the latest done card
const DONE_FAN = [
  { x: 7, y: 9, r: 3 },
  { x: -6, y: 17, r: -2 },
];
const LETTERS_LISTED = 5; // letters named beneath the pile before "+N more"

const CompletedStack = ({ cards, onCardClick }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cards || cards.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center border-[1.5px] border-divider rounded-[14px]">
        <span className="text-xs text-muted">No completed cards</span>
      </div>
    );
  }

  // Cards should already be sorted by completed_at DESC (most recent first)
  // cards[0] is the most recently completed (top of the pile)
  const hasStack = cards.length > 1;
  const behind = cards.slice(1, DONE_FAN.length + 1);
  const depth = behind.length ? DONE_FAN[behind.length - 1].y : 0;
  const rest = cards.slice(1);
  const listed = rest.slice(0, LETTERS_LISTED).map(c => c.session_letter);
  const more = rest.length - listed.length;

  const handleExpandClick = (e) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      {/* isolate: the fan, pill and button layer only within this pile */}
      <div className="relative isolate" style={{ marginBottom: depth + (hasStack ? 10 : 0) }}>
        {hasStack && <FanSheets cards={behind} offsets={DONE_FAN} blank={false} />}

        {/* Top card (latest done, on the panel colour) */}
        <div className="relative" style={{ zIndex: DONE_FAN.length + 1 }}>
          <Card
            card={{ ...cards[0], isBlocked: false }}
            onClick={onCardClick}
            isStacked={false}
          />
        </div>

        {hasStack && (
          <StackControls
            count={cards.length}
            depth={depth}
            onExpand={handleExpandClick}
            expandTitle={`View all ${cards.length} completed cards`}
            countTitle={`${cards.length} completed cards`}
          />
        )}
      </div>

      {/* The next few letters under the pile */}
      {listed.length > 0 && (
        <p className="text-xs text-muted mt-1 px-1">
          Also done: {listed.join(', ')}
          {more > 0 && ` +${more} more`}
        </p>
      )}

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
