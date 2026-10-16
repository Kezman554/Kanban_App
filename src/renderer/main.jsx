// Must run before App so window.electron exists when the first effects fire.
// No-op under Electron (preload already set window.electron); active in-browser.
import './electron-web-shim'

import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/fredoka/400.css'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import App from './App'
import './index.css'
import { initTheme } from './utils/theme'

// Set data-theme before the first paint so there is no flash of the wrong mode
initTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
