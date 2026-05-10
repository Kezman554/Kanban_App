// Short label used for each project in the "Ready to Pick Up" section.
// Reads project.short_name (set per-project in the UI). Falls back to the
// first word of project.name when short_name is unset/blank.
function getShortName(project) {
  if (project && typeof project.short_name === 'string') {
    const trimmed = project.short_name.trim()
    if (trimmed) return trimmed
  }
  const source = (project && (project.name || project.slug)) || ''
  const first = source.split(/[\s\-_]+/)[0] || source
  return first
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatSyncedISO(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function formatSyncedHuman(iso) {
  const d = new Date(iso)
  const safe = isNaN(d.getTime()) ? new Date() : d
  return `${safe.getUTCFullYear()}-${pad(safe.getUTCMonth() + 1)}-${pad(safe.getUTCDate())} ${pad(safe.getUTCHours())}:${pad(safe.getUTCMinutes())}`
}

const COMPLEXITY_RANK = { low: 0, medium: 1 }

function sortByComplexityStable(items) {
  return items
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const aRank = COMPLEXITY_RANK[a.c.complexity] ?? 99
      const bRank = COMPLEXITY_RANK[b.c.complexity] ?? 99
      if (aRank !== bRank) return aRank - bRank
      return a.i - b.i
    })
    .map(x => x.c)
}

function buildSummaryMarkdown(data) {
  const projects = Array.isArray(data?.projects) ? data.projects : []
  const totalCards = projects.reduce((s, p) => s + (p.stats?.total_cards || 0), 0)
  const doneCards = projects.reduce((s, p) => s + (p.stats?.completed_cards || 0), 0)
  const overallPct = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0

  const exportedAt = data?.exported_at || new Date().toISOString()
  const syncedISO = formatSyncedISO(exportedAt)
  const syncedHuman = formatSyncedHuman(exportedAt)

  const lines = []
  lines.push('---')
  lines.push('tags: [generated, kanban]')
  lines.push('status: active')
  lines.push(`synced: ${syncedISO}`)
  lines.push('---')
  lines.push('')
  lines.push('# Kanban Summary')
  lines.push('')
  lines.push(`*Synced: ${syncedHuman} — ${projects.length} projects, ${doneCards} of ${totalCards} cards done (${overallPct}%)*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const p of projects) {
    const total = p.stats?.total_cards || 0
    const done = p.stats?.completed_cards || 0
    const pct = p.stats?.completion_percentage ?? 0
    lines.push(`## ${p.name} — ${pct}% (${done}/${total})`)

    const inProg = (p.in_progress_cards || [])
      .map(c => `${c.session_letter} — ${c.title}`)
      .join('; ')
    lines.push(`- **In progress:** ${inProg || '—'}`)

    const next = (p.unblocked_cards || [])
      .slice(0, 3)
      .map(c => `${c.session_letter} — ${c.title} *(${c.complexity})*`)
      .join('; ')
    lines.push(`- **Next unblocked:** ${next || '—'}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## Ready to Pick Up')
  lines.push('')

  const allUnblocked = []
  for (const p of projects) {
    const shortName = getShortName(p)
    for (const c of (p.unblocked_cards || [])) {
      allUnblocked.push({ ...c, _shortName: shortName })
    }
  }

  const eligible = allUnblocked.filter(c => c.complexity === 'low' || c.complexity === 'medium')
  const solo = sortByComplexityStable(eligible.filter(c => c.resource !== 'claude_sub'))
  const claude = sortByComplexityStable(eligible.filter(c => c.resource === 'claude_sub'))

  const renderList = (items) => {
    if (items.length === 0) return '_(none)_'
    return items
      .map(c => `- **${c._shortName} ${c.session_letter}** — ${c.title} *(${c.complexity})*`)
      .join('\n')
  }

  lines.push('### Solo (no Claude needed)')
  lines.push(renderList(solo))
  lines.push('')
  lines.push('### Claude Session')
  lines.push(renderList(claude))
  lines.push('')

  return lines.join('\n')
}

module.exports = { buildSummaryMarkdown, getShortName }
