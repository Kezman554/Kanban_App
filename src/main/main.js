const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Terminal management
const terminal = require('./terminal')

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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

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

ipcMain.handle('db:exportProjectToJson', async (event, projectId) => {
  try {
    return db.exportProjectToJson(projectId)
  } catch (error) {
    console.error('Error exporting project:', error)
    throw error
  }
})

// API Key handler
ipcMain.handle('api:getAnthropicKey', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured. Please add it to your .env file.')
  }
  return apiKey
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

// Terminal IPC Handlers
let mainWindow = null

ipcMain.handle('terminal:create', async (event, options) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    return terminal.createTerminal(win, options)
  } catch (error) {
    console.error('Error creating terminal:', error)
    throw error
  }
})

ipcMain.handle('terminal:write', async (event, terminalId, data) => {
  try {
    terminal.writeToTerminal(terminalId, data)
  } catch (error) {
    console.error('Error writing to terminal:', error)
    throw error
  }
})

ipcMain.handle('terminal:resize', async (event, terminalId, cols, rows) => {
  try {
    terminal.resizeTerminal(terminalId, cols, rows)
  } catch (error) {
    console.error('Error resizing terminal:', error)
    throw error
  }
})

ipcMain.handle('terminal:kill', async (event, terminalId) => {
  try {
    terminal.killTerminal(terminalId)
  } catch (error) {
    console.error('Error killing terminal:', error)
    throw error
  }
})

ipcMain.handle('terminal:getActive', async () => {
  return terminal.getActiveTerminals()
})

ipcMain.handle('terminal:isAvailable', async () => {
  return terminal.isPtyAvailable()
})

// Write prompt to temp file (for long prompts that exceed command line limits)
ipcMain.handle('file:writePromptToTemp', async (event, prompt, cardId) => {
  try {
    const tempDir = os.tmpdir()
    const fileName = `claude_prompt_${cardId}_${Date.now()}.txt`
    const filePath = path.join(tempDir, fileName)
    fs.writeFileSync(filePath, prompt, 'utf8')
    return filePath
  } catch (error) {
    console.error('Error writing prompt to temp file:', error)
    throw error
  }
})

// Clean up temp prompt file
ipcMain.handle('file:deleteTempFile', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.error('Error deleting temp file:', error)
    // Don't throw - cleanup failure is not critical
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
  // Kill all terminal sessions
  terminal.killAllTerminals()

  if (db) {
    db.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
