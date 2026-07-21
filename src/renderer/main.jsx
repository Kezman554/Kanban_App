// Must run before App so window.electron exists when the first effects fire.
// No-op under Electron (preload already set window.electron); active in-browser.
import './electron-web-shim'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
