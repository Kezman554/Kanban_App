/**
 * Terminal Manager for node-pty
 * Handles spawning and managing terminal sessions in the main process
 */

const os = require('os');

// Try to load node-pty, handle if not available
let pty = null;
let ptyError = null;
try {
  pty = require('node-pty');
} catch (error) {
  ptyError = error;
  console.warn('node-pty not available:', error.message);
  console.warn('Terminal functionality will be limited. Run: npx electron-rebuild -f -w node-pty');
}

// Store active terminal sessions
const terminals = new Map();
let terminalIdCounter = 0;

/**
 * Get the default shell for the current platform
 */
function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * Create a new terminal session
 * @param {BrowserWindow} win - The browser window to send data to
 * @param {Object} options - Terminal options
 * @param {string} options.cwd - Working directory
 * @param {string} options.shell - Shell to use (optional)
 * @param {string[]} options.args - Shell arguments (optional)
 * @param {Object} options.env - Environment variables (optional)
 * @param {number} options.cols - Number of columns (default: 80)
 * @param {number} options.rows - Number of rows (default: 24)
 * @returns {number} Terminal ID
 */
function createTerminal(win, options = {}) {
  // Check if node-pty is available
  if (!pty) {
    throw new Error(
      'node-pty is not available. Please run: npx electron-rebuild -f -w node-pty\n' +
      'This requires Visual Studio Build Tools on Windows.\n' +
      'Original error: ' + (ptyError?.message || 'Unknown')
    );
  }

  const terminalId = ++terminalIdCounter;

  const shell = options.shell || getDefaultShell();
  const args = options.args || [];
  const cwd = options.cwd || process.cwd();
  const cols = options.cols || 80;
  const rows = options.rows || 24;

  // Merge environment variables
  const env = {
    ...process.env,
    ...options.env,
    TERM: 'xterm-256color',
  };

  console.log(`Creating terminal ${terminalId}: shell=${shell}, cwd=${cwd}`);

  try {
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
      useConpty: process.platform === 'win32', // Use ConPTY on Windows
    });

    // Store terminal info
    terminals.set(terminalId, {
      pty: ptyProcess,
      win,
    });

    // Forward data from pty to renderer
    ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', { terminalId, data });
      }
    });

    // Handle pty exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Terminal ${terminalId} exited: code=${exitCode}, signal=${signal}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', { terminalId, exitCode, signal });
      }
      terminals.delete(terminalId);
    });

    return terminalId;
  } catch (error) {
    console.error(`Failed to create terminal ${terminalId}:`, error);
    throw error;
  }
}

/**
 * Write data to a terminal
 * @param {number} terminalId - Terminal ID
 * @param {string} data - Data to write
 */
function writeToTerminal(terminalId, data) {
  const terminal = terminals.get(terminalId);
  if (terminal && terminal.pty) {
    terminal.pty.write(data);
  } else {
    console.warn(`Terminal ${terminalId} not found`);
  }
}

/**
 * Resize a terminal
 * @param {number} terminalId - Terminal ID
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 */
function resizeTerminal(terminalId, cols, rows) {
  const terminal = terminals.get(terminalId);
  if (terminal && terminal.pty) {
    try {
      terminal.pty.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize terminal ${terminalId}:`, error);
    }
  }
}

/**
 * Kill a terminal session
 * @param {number} terminalId - Terminal ID
 */
function killTerminal(terminalId) {
  const terminal = terminals.get(terminalId);
  if (terminal && terminal.pty) {
    try {
      terminal.pty.kill();
    } catch (error) {
      console.error(`Failed to kill terminal ${terminalId}:`, error);
    }
    terminals.delete(terminalId);
  }
}

/**
 * Kill all terminal sessions
 */
function killAllTerminals() {
  for (const [terminalId, terminal] of terminals) {
    try {
      if (terminal.pty) {
        terminal.pty.kill();
      }
    } catch (error) {
      console.error(`Failed to kill terminal ${terminalId}:`, error);
    }
  }
  terminals.clear();
}

/**
 * Get info about active terminals
 * @returns {number[]} Array of active terminal IDs
 */
function getActiveTerminals() {
  return Array.from(terminals.keys());
}

/**
 * Check if node-pty is available
 * @returns {Object} Status object with available flag and error message
 */
function isPtyAvailable() {
  return {
    available: pty !== null,
    error: ptyError?.message || null,
  };
}

module.exports = {
  createTerminal,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
  killAllTerminals,
  getActiveTerminals,
  getDefaultShell,
  isPtyAvailable,
};
