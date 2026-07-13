// Single source of truth for whether a card is dependency-blocked in the
// renderer. Mirrors the backend logic in operations.js (getBlockedReason /
// getWorkableCards): a Not Started card is blocked while any internal
// dependency is not Done or any external (cross-project) dependency is
// unresolved. A dependency letter that doesn't exist in the project counts
// as blocking (never silently unblock).

/**
 * Build a { session_letter: status } lookup from a full project object.
 */
export function buildCardStatusByLetter(project) {
  const map = {};
  for (const phase of project?.phases || []) {
    for (const subphase of phase.subphases || []) {
      for (const card of subphase.cards || []) {
        map[card.session_letter] = card.status;
      }
    }
  }
  return map;
}

/**
 * @param {Object} card - Card with depends_on_cards and (resolved) external_dependencies
 * @param {Object} cardStatusByLetter - From buildCardStatusByLetter
 * @returns {boolean}
 */
export function isCardBlocked(card, cardStatusByLetter) {
  if (!card) return false;
  if (card.status === 'Done' || card.status === 'In Progress') return false;

  // Cross-project dependencies: resolution status is computed by the
  // backend (resolveExternalDependencies); unresolved includes missing
  // projects/cards.
  if ((card.external_dependencies || []).some(dep => !dep.resolved)) {
    return true;
  }

  return (card.depends_on_cards || []).some(
    letter => cardStatusByLetter[letter] !== 'Done'
  );
}

/**
 * Human-readable reason a card is blocked, or null when it isn't.
 * e.g. "Waiting on: M, AA; Waiting on external: Alfred Home Hub L, T"
 */
export function getBlockedReason(card, cardStatusByLetter) {
  if (!card) return null;
  if (card.status === 'Done' || card.status === 'In Progress') return null;

  const reasons = [];

  const incomplete = (card.depends_on_cards || []).filter(
    letter => cardStatusByLetter[letter] !== 'Done'
  );
  if (incomplete.length > 0) {
    reasons.push(`Waiting on: ${incomplete.join(', ')}`);
  }

  const unresolvedExternal = (card.external_dependencies || []).filter(dep => !dep.resolved);
  if (unresolvedExternal.length > 0) {
    const labels = unresolvedExternal.map(
      dep => `${dep.project_name || dep.project_slug} ${dep.card_letter}`
    );
    reasons.push(`Waiting on external: ${labels.join(', ')}`);
  }

  return reasons.length > 0 ? reasons.join('; ') : null;
}
