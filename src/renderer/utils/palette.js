// The 12-colour card palette. Colours are worked out from an id wherever
// something is drawn and are never stored. Values are CSS variables from the
// token block in index.css, so no colour literal lives outside it.

const NAMES = [
  'coral', 'aqua', 'lilac', 'mint', 'pink', 'sky',
  'marigold', 'sage', 'apricot', 'periwinkle', 'seafoam', 'mauve',
];

export const PALETTE = NAMES.map(name => ({
  name,
  fill: `var(--color-pal-${name})`,
  deep: `var(--color-pal-${name}-deep)`,
}));

// palette[id mod 12]; ids are positive integers but guard anything else
export function paletteFor(id) {
  const n = Number.parseInt(id, 10);
  const i = Number.isFinite(n) ? ((n % PALETTE.length) + PALETTE.length) % PALETTE.length : 0;
  return PALETTE[i];
}

// A small, stable tilt in degrees (under 1) for standalone cards
export function tiltFor(id) {
  const n = Number.parseInt(id, 10) || 0;
  return (((n * 37) % 17) - 8) / 10;
}
