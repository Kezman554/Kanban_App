const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // Project operations
  getAllProjects: () => ipcRenderer.invoke('db:getAllProjects'),
  getProject: (projectId) => ipcRenderer.invoke('db:getProject', projectId),
  createProject: (projectData) => ipcRenderer.invoke('db:createProject', projectData),
  updateProject: (projectId, data) => ipcRenderer.invoke('db:updateProject', projectId, data),
  deleteProject: (projectId) => ipcRenderer.invoke('db:deleteProject', projectId),

  // Card operations
  getCard: (cardId) => ipcRenderer.invoke('db:getCard', cardId),
  updateCardStatus: (cardId, status) => ipcRenderer.invoke('db:updateCardStatus', cardId, status),

  // Import/Export operations
  importProjectFromJson: (jsonData) => ipcRenderer.invoke('db:importProjectFromJson', jsonData),
  exportProjectToJson: (projectId) => ipcRenderer.invoke('db:exportProjectToJson', projectId),

  // API operations
  getAnthropicApiKey: () => ipcRenderer.invoke('api:getAnthropicKey'),

  // Terminal operations
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal:create', options),
    write: (terminalId, data) => ipcRenderer.invoke('terminal:write', terminalId, data),
    resize: (terminalId, cols, rows) => ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
    kill: (terminalId) => ipcRenderer.invoke('terminal:kill', terminalId),
    getActive: () => ipcRenderer.invoke('terminal:getActive'),
    isAvailable: () => ipcRenderer.invoke('terminal:isAvailable'),
    onData: (callback) => {
      const listener = (event, { terminalId, data }) => callback(terminalId, data)
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onExit: (callback) => {
      const listener = (event, { terminalId, exitCode, signal }) => callback(terminalId, exitCode, signal)
      ipcRenderer.on('terminal:exit', listener)
      return () => ipcRenderer.removeListener('terminal:exit', listener)
    },
  },
})
