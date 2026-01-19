const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // API methods will be added here as needed
})
