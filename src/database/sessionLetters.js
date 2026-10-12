// Session-letter ordering, shared by the data layer (operations.js) and the
// vault summary (src/main/vaultSummary.js). Pure functions with no
// dependencies, so the summary can use them without loading the database.

// Base letter of a session letter (C2 -> C, AA3 -> AA, M -> M)
function getBaseLetter(letter) {
  return letter.replace(/\d+$/, '');
}

// Numeric suffix of a session letter (C2 -> 2, C -> 1, AA3 -> 3)
function getSuffix(letter) {
  const match = letter.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

// Shorter base first (A < AA), then alphabetically, then by numeric suffix
// (C < C2 < C3)
function compareSessionLetters(a, b) {
  const aBase = getBaseLetter(a);
  const bBase = getBaseLetter(b);
  if (aBase !== bBase) {
    if (aBase.length !== bBase.length) return aBase.length - bBase.length;
    return aBase.localeCompare(bBase);
  }
  return getSuffix(a) - getSuffix(b);
}

module.exports = { getBaseLetter, getSuffix, compareSessionLetters };
