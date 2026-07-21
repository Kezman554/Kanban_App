// Browser-only build of the renderer, for serving the board off the Pi.
// Deliberately omits the Electron plugins in vite.config.js: no main/preload,
// no electron dependency — just the React app to static files. The window.electron
// bridge is provided at runtime by src/renderer/electron-web-shim.js.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'src/renderer',
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  },
})
