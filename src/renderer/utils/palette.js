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

// A waiting (blocked) card's pale wash of its own colour: the fill and the deep
// shade mixed into --wash-base (cream in light, so cool colours keep their hue;
// the page in dark). At these amounts ink text passes 4.5:1 on every palette
// colour in both modes (worst: title on marigold in dark 4.70, letter on lilac
// in light 5.41).
export function washFor(id) {
  const { fill, deep } = paletteFor(id);
  return {
    fill: `color-mix(in srgb, ${fill} 38%, var(--wash-base))`,
    deep: `color-mix(in srgb, ${deep} 50%, var(--wash-base))`,
  };
}

// A small, stable tilt in degrees (under 1) for standalone cards
export function tiltFor(id) {
  const n = Number.parseInt(id, 10) || 0;
  return (((n * 37) % 17) - 8) / 10;
}
