import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'src/renderer',
  // Favicon files (public/favicon.svg is the single source; npm run icons)
  publicDir: resolve(__dirname, 'public'),
  plugins: [
    react(),
    electron([
      {
        entry: resolve(__dirname, 'src/main/main.js'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron'),
          },
        },
      },
      {
        entry: resolve(__dirname, 'src/main/preload.js'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron'),
          },
        },
      },
      {
        entry: resolve(__dirname, 'src/main/fileReader.js'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron'),
          },
        },
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
