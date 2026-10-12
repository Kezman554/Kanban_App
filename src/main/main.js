const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// File reader for project files
const { readProjectFiles } = require('./fileReader')

// Vault summary markdown builder
const { buildSummaryMarkdown } = require('./vaultSummary')

// Resolve the correct path to database operations
// In dev mode with vite-plugin-electron, __dirname is dist-electron
// We need to go up one level to project root and into src/database
const projectRoot = path.join(__dirname, '..')
const KanbanDatabase = require(path.join(projectRoot, 'src/database/operations'))

// Initialize database
let db = null

function initDatabase() {
  try {
    db = new KanbanDatabase()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Create menu with F12 shortcut for DevTools
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC Handlers for Database Operations
ipcMain.handle('db:getAllProjects', async () => {
  try {
    return db.getAllProjects()
  } catch (error) {
    console.error('Error getting all projects:', error)
    throw error
  }
})

ipcMain.handle('db:getProject', async (event, projectId) => {
  try {
    return db.getProject(projectId)
  } catch (error) {
    console.error('Error getting project:', error)
    throw error
  }
})

ipcMain.handle('db:createProject', async (event, projectData) => {
  try {
    return db.createProject(projectData)
  } catch (error) {
    console.error('Error creating project:', error)
    throw error
  }
})

ipcMain.handle('db:updateProject', async (event, projectId, data) => {
  try {
    return db.updateProject(projectId, data)
  } catch (error) {
    console.error('Error updating project:', error)
    throw error
  }
})

ipcMain.handle('db:deleteProject', async (event, projectId) => {
  try {
    return db.deleteProject(projectId)
  } catch (error) {
    console.error('Error deleting project:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardStatus', async (event, cardId, status) => {
  try {
    return db.updateCardStatus(cardId, status)
  } catch (error) {
    console.error('Error updating card status:', error)
    throw error
  }
})

ipcMain.handle('db:getCard', async (event, cardId) => {
  try {
    return db.getCard(cardId)
  } catch (error) {
    console.error('Error getting card:', error)
    throw error
  }
})

ipcMain.handle('db:clearCardDependencies', async (event, cardId) => {
  try {
    return db.clearCardDependencies(cardId)
  } catch (error) {
    console.error('Error clearing card dependencies:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardPrompt', async (event, cardId, promptData) => {
  try {
    return db.updateCardPrompt(cardId, promptData)
  } catch (error) {
    console.error('Error updating card prompt:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardExternalDependencies', async (event, cardId, entries) => {
  try {
    return db.updateCardExternalDependencies(cardId, entries)
  } catch (error) {
    console.error('Error updating card external dependencies:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardDependsOnCards', async (event, cardId, letters) => {
  try {
    return db.updateCardDependsOnCards(cardId, letters)
  } catch (error) {
    console.error('Error updating card dependencies:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardDetails', async (event, cardId, details) => {
  try {
    return db.updateCardDetails(cardId, details)
  } catch (error) {
    console.error('Error updating card details:', error)
    throw error
  }
})

ipcMain.handle('db:updateCardNotes', async (event, cardId, notes) => {
  try {
    return db.updateCardNotes(cardId, notes)
  } catch (error) {
    console.error('Error updating card notes:', error)
    throw error
  }
})

ipcMain.handle('db:createCard', async (event, subphaseId, cardData) => {
  try {
    return db.createCard(subphaseId, cardData)
  } catch (error) {
    console.error('Error creating card:', error)
    throw error
  }
})

ipcMain.handle('db:deleteCard', async (event, cardId) => {
  try {
    return db.deleteCard(cardId)
  } catch (error) {
    console.error('Error deleting card:', error)
    throw error
  }
})

ipcMain.handle('db:getNextSessionLetter', async (event, projectId, subphaseId) => {
  try {
    return db.getNextSessionLetter(projectId, subphaseId)
  } catch (error) {
    console.error('Error getting next session letter:', error)
    throw error
  }
})

ipcMain.handle('db:importProjectFromJson', async (event, jsonData) => {
  try {
    return db.importProjectFromJson(jsonData)
  } catch (error) {
    console.error('Error importing project:', error)
    throw error
  }
})

ipcMain.handle('db:importProjectFromFile', async (event, filePath) => {
  try {
    const fs = require('fs')
    const path = require('path')
    const fullPath = path.resolve(filePath)
    console.log('Importing project from file:', fullPath)
    const jsonContent = fs.readFileSync(fullPath, 'utf-8')
    const jsonData = JSON.parse(jsonContent)
    return db.importProjectFromJson(jsonData)
  } catch (error) {
    console.error('Error importing project from file:', error)
    throw error
  }
})

ipcMain.handle('db:deletePhase', async (event, phaseId) => {
  try {
    return db.deletePhase(phaseId)
  } catch (error) {
    console.error('Error deleting phase:', error)
    throw error
  }
})

ipcMain.handle('db:appendCards', async (event, projectId, data) => {
  try {
    return db.appendCards(projectId, data)
  } catch (error) {
    console.error('Error appending cards:', error)
    throw error
  }
})

ipcMain.handle('db:exportProjectToJson', async (event, projectId) => {
  try {
    return db.exportProjectToJson(projectId)
  } catch (error) {
    console.error('Error exporting project:', error)
    throw error
  }
})

const VAULT_EXPORT_PATH = 'C:\\Dev\\alfred-vault\\4-dev-hub\\kanban-export.json'
const VAULT_SUMMARY_PATH = path.join(path.dirname(VAULT_EXPORT_PATH), 'kanban-summary.md')

ipcMain.handle('db:exportToVault', async () => {
  try {
    const data = db.exportForVault()
    const summary = buildSummaryMarkdown(data)

    // Write each file via tmp + rename so a reader never sees a half-written file.
    const jsonTmp = VAULT_EXPORT_PATH + '.tmp'
    const summaryTmp = VAULT_SUMMARY_PATH + '.tmp'
    fs.writeFileSync(jsonTmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.writeFileSync(summaryTmp, summary, 'utf-8')
    fs.renameSync(jsonTmp, VAULT_EXPORT_PATH)
    fs.renameSync(summaryTmp, VAULT_SUMMARY_PATH)

    const cardCount = data.projects.reduce((sum, p) => sum + p.unblocked_cards.length, 0)
    return {
      success: true,
      path: VAULT_EXPORT_PATH,
      summaryPath: VAULT_SUMMARY_PATH,
      projectCount: data.projects.length,
      cardCount,
    }
  } catch (error) {
    console.error('Error exporting to vault:', error)
    throw error
  }
})

// Clear all data (delete all projects)
ipcMain.handle('db:clearAllData', async () => {
  try {
    const projects = db.getAllProjects()
    for (const project of projects) {
      db.deleteProject(project.id)
    }
    return { success: true, deletedCount: projects.length }
  } catch (error) {
    throw new Error(`Failed to clear data: ${error.message}`)
  }
})

// Export all projects
ipcMain.handle('db:exportAllProjects', async () => {
  try {
    const projects = db.getAllProjects()
    const exportData = []

    for (const project of projects) {
      const fullProject = db.exportProjectToJson(project.id)
      exportData.push(fullProject)
    }

    return exportData
  } catch (error) {
    throw new Error(`Failed to export projects: ${error.message}`)
  }
})

// Save file dialog
ipcMain.handle('dialog:saveJsonFile', async (event, defaultName) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return result.filePath
})

// Write file
ipcMain.handle('file:writeJson', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    throw new Error(`Failed to write file: ${error.message}`)
  }
})

// Get app info
ipcMain.handle('app:getInfo', async () => {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  let version = '1.0.0'

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    version = packageJson.version || version
  } catch (e) {
    // Use default version
  }

  return {
    version,
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    directory: projectRoot
  }
})

ipcMain.handle('db:getSetting', async (event, key) => {
  try {
    return db.getSetting(key)
  } catch (error) {
    console.error('Error getting setting:', error)
    throw error
  }
})

ipcMain.handle('db:setSetting', async (event, key, value) => {
  try {
    return db.setSetting(key, value)
  } catch (error) {
    console.error('Error setting setting:', error)
    throw error
  }
})

// File dialog handler for importing projects
ipcMain.handle('dialog:openJsonFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const jsonData = JSON.parse(content)
    return { filePath, data: jsonData }
  } catch (error) {
    throw new Error(`Failed to read or parse file: ${error.message}`)
  }
})

// Directory picker dialog
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

// Open folder in system file explorer
ipcMain.handle('shell:openInExplorer', async (event, directoryPath) => {
  try {
    await shell.openPath(directoryPath)
    return { success: true }
  } catch (error) {
    throw new Error(`Failed to open folder: ${error.message}`)
  }
})

// Update project directory path
ipcMain.handle('db:updateProjectPath', async (event, projectId, directoryPath) => {
  try {
    return db.updateProjectPath(projectId, directoryPath)
  } catch (error) {
    console.error('Error updating project path:', error)
    throw error
  }
})

// File reading handlers
ipcMain.handle('files:readProjectFiles', async (event, directoryPath, prdPath) => {
  try {
    return readProjectFiles(directoryPath, prdPath)
  } catch (error) {
    console.error('Error reading project files:', error)
    return { prd: null, progress: null }
  }
})

// Done cards handler
ipcMain.handle('cards:getDoneCards', async (event, projectId) => {
  try {
    return db.getDoneCardsForProject(projectId)
  } catch (error) {
    console.error('Error getting done cards:', error)
    throw error
  }
})

app.whenReady().then(() => {
  initDatabase()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (db) {
    db.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
