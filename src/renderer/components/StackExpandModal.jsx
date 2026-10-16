import React, { useState } from 'react';
import { X } from './icons';
import Card from './Card';

// cardProps are passed to every Card (e.g. colourDone for the Done pile,
// fillLetter for a dependency stack)
const StackExpandModal = ({ cards, isOpen, onClose, onCardClick, title, onUnlockCard, cardProps = {} }) => {
  const [confirmUnlock, setConfirmUnlock] = useState(null);
  const [unlockError, setUnlockError] = useState(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  if (!isOpen || !cards || cards.length === 0) return null;

  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself, not the content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleUnlockClick = (card) => {
    setConfirmUnlock(card);
  };

  const handleConfirmUnlock = async () => {
    if (confirmUnlock && onUnlockCard) {
      setIsUnlocking(true);
      setUnlockError(null);
      try {
        await onUnlockCard(confirmUnlock.id);
        setConfirmUnlock(null);
        // Close the modal after successful unlock
        onClose();
      } catch (err) {
        setUnlockError(err.message || 'Failed to unlock card');
      } finally {
        setIsUnlocking(false);
      }
    }
  };

  const handleCancelUnlock = () => {
    setConfirmUnlock(null);
    setUnlockError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      onClick={handleBackdropClick}
    >
      {/* Blurred grey transparent backdrop */}
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" />

      {/* Confirmation Dialog */}
      {confirmUnlock && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="bg-page border-[1.5px] border-line rounded-[20px] shadow-card p-6 max-w-md">
            <h3 className="text-lg font-bold text-ink mb-4">Unlock Card?</h3>
            <p className="text-muted mb-2">
              Are you sure you want to unlock <span className="font-semibold text-ink">"{confirmUnlock.title}"</span>?
            </p>
            <p className="text-muted mb-6 text-sm">
              This will remove all dependencies for this card. It will become immediately actionable.
            </p>
            {unlockError && (
              <div className="mb-4 p-3 rounded bg-panel border border-danger-text text-danger-text text-sm">
                {unlockError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-page border border-line text-ink hover:bg-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-pal-marigold hover:brightness-95 text-card-ink border border-card-line font-semibold transition-colors disabled:opacity-50"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal content */}
      <div className="relative z-10 bg-page border-[1.5px] border-line rounded-[20px] shadow-card max-w-4xl w-full max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 bg-sidebar border-b border-divider">
          <h3 className="text-lg font-bold text-ink">
            {title || `${cards.length} Cards`}
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border-[1.5px] border-line flex items-center justify-center text-ink hover:bg-hover transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable grid content */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-themed">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div key={card.id}>
                <Card
                  card={card}
                  onClick={onCardClick}
                  isStacked={false}
                  onUnlock={card.isBlocked && onUnlockCard ? handleUnlockClick : undefined}
                  {...cardProps}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StackExpandModal;
