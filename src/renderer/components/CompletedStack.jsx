import React, { useState } from 'react';
import Card, { EmptyCardSlot } from './Card';
import StackExpandModal from './StackExpandModal';
import { FanSheets, StackControls } from './CardStack';

// Two palette-coloured cards fan out behind the latest done card
const DONE_FAN = [
  { x: 7, y: 9, r: 3 },
  { x: -6, y: 17, r: -2 },
];
const LETTERS_LISTED = 5; // letters named beneath the pile before "+N more"

// pileStyle places the pile (e.g. sticky in the Done column). It wraps the pile
// and its "Also done" line only: a sticky element is its own stacking context,
// so the expand modal stays outside it and still opens above everything.
const CompletedStack = ({ cards, onCardClick, pileStyle }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cards || cards.length === 0) {
    return (
      <div style={pileStyle}>
        <EmptyCardSlot>No completed cards</EmptyCardSlot>
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
      <div style={pileStyle}>
        {/* isolate: the fan, pill and button layer only within this pile */}
        <div className="relative isolate" style={{ marginBottom: depth + (hasStack ? 10 : 0) }}>
          {hasStack && <FanSheets cards={behind} offsets={DONE_FAN} blank={false} />}

          {/* Top card (latest done, in its palette colour with the green tick) */}
          <div className="relative" style={{ zIndex: DONE_FAN.length + 1 }}>
            <Card
              card={{ ...cards[0], isBlocked: false }}
              onClick={onCardClick}
              isStacked={false}
              colourDone
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
      </div>

      {/* Expand Modal */}
      <StackExpandModal
        cards={cards.map(c => ({ ...c, isBlocked: false }))}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCardClick={onCardClick}
        title={`${cards.length} Completed Cards`}
        cardProps={{ colourDone: true }}
      />
    </>
  );
};

export default CompletedStack;
