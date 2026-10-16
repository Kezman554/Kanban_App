// Regenerate the app's raster icons from the single source, public/favicon.svg.
// Edit the SVG, then run:  npm run icons
//
// Writes, next to the source (Vite copies public/ into both builds):
//   public/favicon-32.png       32x32 PNG fallback for browsers without SVG favicons
//   public/apple-touch-icon.png 180x180 home-screen icon (iOS / iPadOS), on the
//                               cream page colour: iOS fills transparency with black
// The SVG itself is served as the primary favicon, unchanged.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOURCE = path.join(PUBLIC_DIR, 'favicon.svg');

const OUTPUTS = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180, background: '#F4EFC9' },
];

const svg = fs.readFileSync(SOURCE, 'utf8');

for (const { file, size, background } of OUTPUTS) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background }).render().asPng();
  fs.writeFileSync(path.join(PUBLIC_DIR, file), png);
  console.log(`wrote public/${file} (${size}x${size}, ${png.length} bytes)`);
}
