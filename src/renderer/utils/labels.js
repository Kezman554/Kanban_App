// Display labels shared by the board and the roadmap

// "Phase 9: Testing & Release" -> "9 · Testing & Release" when a short name is shown
export const phaseTitle = (phase) => phase.short_name
  ? `${phase.short_name} · ${phase.name.replace(/^phase\s+[\w.]+\s*[:.\-–]\s*/i, '')}`
  : phase.name;

// "2.1 Split & Merge" -> "Split & Merge" (the badge already shows the number)
export const subphaseTitle = (subphase) => subphase.name.replace(/^\d+\.\d+\s+/, '');
