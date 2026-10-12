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
  createCard: (subphaseId, cardData) => ipcRenderer.invoke('db:createCard', subphaseId, cardData),
  createCardAt: (projectId, placement, cardData) => ipcRenderer.invoke('db:createCardAt', projectId, placement, cardData),
  getNextSessionLetter: (projectId, subphaseId) => ipcRenderer.invoke('db:getNextSessionLetter', projectId, subphaseId),
  updateCardStatus: (cardId, status) => ipcRenderer.invoke('db:updateCardStatus', cardId, status),
  updateCardPrompt: (cardId, promptData) => ipcRenderer.invoke('db:updateCardPrompt', cardId, promptData),
  updateCardNotes: (cardId, notes) => ipcRenderer.invoke('db:updateCardNotes', cardId, notes),
  updateCardDetails: (cardId, details) => ipcRenderer.invoke('db:updateCardDetails', cardId, details),
  updateCardExternalDependencies: (cardId, entries) =>
    ipcRenderer.invoke('db:updateCardExternalDependencies', cardId, entries),
  updateCardDependsOnCards: (cardId, letters) =>
    ipcRenderer.invoke('db:updateCardDependsOnCards', cardId, letters),
  clearCardDependencies: (cardId) => ipcRenderer.invoke('db:clearCardDependencies', cardId),
  deleteCard: (cardId) => ipcRenderer.invoke('db:deleteCard', cardId),

  // Phase operations
  deletePhase: (phaseId) => ipcRenderer.invoke('db:deletePhase', phaseId),

  // Import/Export operations
  importProjectFromJson: (jsonData) => ipcRenderer.invoke('db:importProjectFromJson', jsonData),
  importProjectFromFile: (filePath) => ipcRenderer.invoke('db:importProjectFromFile', filePath),
  appendCards: (projectId, data) => ipcRenderer.invoke('db:appendCards', projectId, data),
  exportProjectToJson: (projectId) => ipcRenderer.invoke('db:exportProjectToJson', projectId),
  exportToVault: () => ipcRenderer.invoke('db:exportToVault'),

  // Dialog operations
  openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile'),
  saveJsonFile: (defaultName) => ipcRenderer.invoke('dialog:saveJsonFile', defaultName),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),

  // Shell operations
  openInExplorer: (directoryPath) => ipcRenderer.invoke('shell:openInExplorer', directoryPath),

  // Project path operations
  updateProjectPath: (projectId, directoryPath) => ipcRenderer.invoke('db:updateProjectPath', projectId, directoryPath),

  // Data operations
  clearAllData: () => ipcRenderer.invoke('db:clearAllData'),
  exportAllProjects: () => ipcRenderer.invoke('db:exportAllProjects'),
  writeJsonFile: (filePath, data) => ipcRenderer.invoke('file:writeJson', filePath, data),

  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
  setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),

  // Project file reading
  readProjectFiles: (directoryPath, prdPath) => ipcRenderer.invoke('files:readProjectFiles', directoryPath, prdPath),

  // Done cards
  getDoneCards: (projectId) => ipcRenderer.invoke('cards:getDoneCards', projectId),
})
