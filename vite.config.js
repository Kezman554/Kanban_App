import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/main.js',
      },
      {
        entry: 'src/main/preload.js',
      },
    ]),
    renderer(),
  ],
  server: {
    port: 8502,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
