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
  importProjectFromFile: (filePath) => ipcRenderer.invoke('db:importProjectFromFile', filePath),
  exportProjectToJson: (projectId) => ipcRenderer.invoke('db:exportProjectToJson', projectId),

  // API operations
  getAnthropicApiKey: () => ipcRenderer.invoke('api:getAnthropicKey'),
  getMaskedApiKey: () => ipcRenderer.invoke('api:getMaskedKey'),
  saveApiKey: (key) => ipcRenderer.invoke('api:saveKey', key),
  testApiConnection: () => ipcRenderer.invoke('api:testConnection'),

  // Dialog operations
  openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile'),
  saveJsonFile: (defaultName) => ipcRenderer.invoke('dialog:saveJsonFile', defaultName),

  // Data operations
  clearAllData: () => ipcRenderer.invoke('db:clearAllData'),
  exportAllProjects: () => ipcRenderer.invoke('db:exportAllProjects'),
  writeJsonFile: (filePath, data) => ipcRenderer.invoke('file:writeJson', filePath, data),

  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  // File operations (for prompt handling)
  writePromptToTemp: (prompt, cardId) => ipcRenderer.invoke('file:writePromptToTemp', prompt, cardId),
  deleteTempFile: (filePath) => ipcRenderer.invoke('file:deleteTempFile', filePath),

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
