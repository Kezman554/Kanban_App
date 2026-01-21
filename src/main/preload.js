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
})
