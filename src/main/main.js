const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
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

// Get masked API key for display
ipcMain.handle('api:getMaskedKey', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return null
  }
  // Show first 10 and last 4 characters
  if (apiKey.length > 14) {
    return apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4)
  }
  return '***'
})

// Save API key to .env file
ipcMain.handle('api:saveKey', async (event, newKey) => {
  const envPath = path.join(projectRoot, '.env')

  try {
    let envContent = ''

    // Read existing .env if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8')
    }

    // Update or add ANTHROPIC_API_KEY
    if (envContent.includes('ANTHROPIC_API_KEY=')) {
      envContent = envContent.replace(/ANTHROPIC_API_KEY=.*/g, `ANTHROPIC_API_KEY=${newKey}`)
    } else {
      envContent = envContent.trim() + `\nANTHROPIC_API_KEY=${newKey}\n`
    }

    fs.writeFileSync(envPath, envContent)

    // Update process.env
    process.env.ANTHROPIC_API_KEY = newKey

    return { success: true }
  } catch (error) {
    throw new Error(`Failed to save API key: ${error.message}`)
  }
})

// Test API connection
ipcMain.handle('api:testConnection', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { success: false, error: 'No API key configured' }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    if (response.ok) {
      return { success: true, message: 'API connection successful' }
    } else {
      const data = await response.json()
      return { success: false, error: data.error?.message || `HTTP ${response.status}` }
    }
  } catch (error) {
    return { success: false, error: error.message }
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
    arch: process.arch
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

// Terminal IPC Handlers
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
