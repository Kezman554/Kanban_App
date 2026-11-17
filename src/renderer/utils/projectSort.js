// Project list sort order. Like the theme, the choice and the "recently
// opened" record live in this browser only (localStorage), never in the
// database or exports. Every read and write tolerates storage being
// unavailable: the list then falls back to newest first.

const SORT_KEY = 'kanban-project-sort'
const RECENT_KEY = 'kanban-recent-projects'

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest', title: 'Newest first' },
  { id: 'name', label: 'A–Z', title: 'A–Z by name' },
  { id: 'recent', label: 'Recent', title: 'Most recently opened in this browser' },
]
const IDS = SORT_OPTIONS.map(o => o.id)

export function getProjectSort() {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return IDS.includes(v) ? v : 'newest'
  } catch {
    return 'newest'
  }
}

export function setProjectSort(choice) {
  try {
    if (choice === 'newest') localStorage.removeItem(SORT_KEY)
    else localStorage.setItem(SORT_KEY, choice)
  } catch {
    // Storage unavailable: the choice still applies for this session
  }
}

// { [projectId]: last-opened epoch ms }
export function getRecentProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function markProjectOpened(projectId, now = Date.now()) {
  const recent = getRecentProjects()
  recent[projectId] = now
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    // Storage unavailable: nothing recorded
  }
  return recent
}

// Newest first: created_at descending, id descending on a tie (the API's
// own order, made deterministic)
function byNewest(a, b) {
  const ca = a.created_at || ''
  const cb = b.created_at || ''
  if (ca !== cb) return ca < cb ? 1 : -1
  return (b.id || 0) - (a.id || 0)
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Return a new array of projects in the chosen order.
 * 'recent': opened projects by last-opened time, then never-opened ones
 * newest first.
 */
export function sortProjects(projects, choice, recent = {}) {
  const list = [...(projects || [])]
  if (choice === 'name') {
    return list.sort((a, b) => collator.compare(a.name || '', b.name || '') || byNewest(a, b))
  }
  if (choice === 'recent') {
    return list.sort((a, b) => {
      const ra = Number(recent[a.id]) || 0
      const rb = Number(recent[b.id]) || 0
      if (ra !== rb) return rb - ra
      return byNewest(a, b)
    })
  }
  return list.sort(byNewest)
}
