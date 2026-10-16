// Light/dark theme. The choice lives in this browser only (localStorage), never
// in the database. Applying it just swaps data-theme on <html>; the token block
// in index.css does the rest, so nothing re-renders or reloads.

const STORAGE_KEY = 'kanban-theme'
const CHOICES = ['system', 'light', 'dark']
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return CHOICES.includes(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(choice) {
  if (choice === 'light' || choice === 'dark') return choice
  return media?.matches ? 'dark' : 'light'
}

function apply(choice) {
  document.documentElement.dataset.theme = resolve(choice)
}

export function setThemeChoice(choice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage unavailable: still apply for this session
  }
  apply(choice)
}

// Call once before first render. Follows the OS while the choice is 'system'.
export function initTheme() {
  apply(getThemeChoice())
  media?.addEventListener('change', () => {
    if (getThemeChoice() === 'system') apply('system')
  })
}
