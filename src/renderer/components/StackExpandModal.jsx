import React, { useState } from 'react';
import Card from './Card';

const StackExpandModal = ({ cards, isOpen, onClose, onCardClick, title, onUnlockCard }) => {
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
      <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" />

      {/* Confirmation Dialog */}
      {confirmUnlock && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl p-6 max-w-md">
            <h3 className="text-lg font-bold text-dark-text mb-4">Unlock Card?</h3>
            <p className="text-dark-text-secondary mb-2">
              Are you sure you want to unlock <span className="font-semibold text-dark-text">"{confirmUnlock.title}"</span>?
            </p>
            <p className="text-dark-text-secondary mb-6 text-sm">
              This will remove all dependencies for this card. It will become immediately actionable.
            </p>
            {unlockError && (
              <div className="mb-4 p-3 rounded bg-red-900/50 border border-red-700 text-red-300 text-sm">
                {unlockError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-dark-bg border border-dark-border text-dark-text hover:bg-dark-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-500 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal content */}
      <div className="relative z-10 bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h3 className="text-lg font-bold text-dark-text">
            {title || `${cards.length} Cards`}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable grid content */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-dark">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div key={card.id}>
                <Card
                  card={card}
                  onClick={onCardClick}
                  isStacked={false}
                  onUnlock={card.isBlocked && onUnlockCard ? handleUnlockClick : undefined}
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
