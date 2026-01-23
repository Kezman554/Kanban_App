import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const Terminal = ({
  initialCommand,
  cwd,
  onExit,
  onReady,
  className = '',
}) => {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalIdRef = useRef(null);
  const cleanupRef = useRef([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasExited, setHasExited] = useState(false);
  const [exitInfo, setExitInfo] = useState(null);
  const [ptyStatus, setPtyStatus] = useState({ available: true, error: null, checked: false });

  // Check if PTY is available
  useEffect(() => {
    const checkPty = async () => {
      try {
        const status = await window.electron.terminal.isAvailable();
        setPtyStatus({ ...status, checked: true });
      } catch (error) {
        setPtyStatus({ available: false, error: error.message, checked: true });
      }
    };
    checkPty();
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;
    if (!ptyStatus.checked || !ptyStatus.available) return;

    // Create xterm instance
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#3a3a3a',
        black: '#1a1a1a',
        red: '#f44336',
        green: '#4caf50',
        yellow: '#ffeb3b',
        blue: '#2196f3',
        magenta: '#9c27b0',
        cyan: '#00bcd4',
        white: '#e0e0e0',
        brightBlack: '#616161',
        brightRed: '#ef5350',
        brightGreen: '#66bb6a',
        brightYellow: '#ffee58',
        brightBlue: '#42a5f5',
        brightMagenta: '#ab47bc',
        brightCyan: '#26c6da',
        brightWhite: '#fafafa',
      },
      allowTransparency: true,
      scrollback: 10000,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Add web links addon
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    // Open terminal in container
    term.open(containerRef.current);
    terminalRef.current = term;

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    // Start the pty process
    startPtyProcess(term, fitAddon);

    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, [ptyStatus.checked, ptyStatus.available]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Remove all event listeners
    cleanupRef.current.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    });
    cleanupRef.current = [];

    // Kill the terminal process
    if (terminalIdRef.current !== null) {
      try {
        window.electron.terminal.kill(terminalIdRef.current);
      } catch (e) {
        console.error('Error killing terminal:', e);
      }
      terminalIdRef.current = null;
    }

    // Dispose xterm
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
  }, []);

  // Start the PTY process
  const startPtyProcess = async (term, fitAddon) => {
    try {
      // Get dimensions
      const cols = term.cols;
      const rows = term.rows;

      // Create terminal in main process
      const terminalId = await window.electron.terminal.create({
        cwd: cwd || process.cwd?.() || undefined,
        cols,
        rows,
      });

      terminalIdRef.current = terminalId;
      setIsConnected(true);

      // Handle data from pty
      const removeDataListener = window.electron.terminal.onData((id, data) => {
        if (id === terminalId && terminalRef.current) {
          terminalRef.current.write(data);
        }
      });
      cleanupRef.current.push(removeDataListener);

      // Handle pty exit
      const removeExitListener = window.electron.terminal.onExit((id, exitCode, signal) => {
        if (id === terminalId) {
          setHasExited(true);
          setExitInfo({ exitCode, signal });
          if (terminalRef.current) {
            terminalRef.current.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
          }
          if (onExit) {
            onExit(exitCode, signal);
          }
        }
      });
      cleanupRef.current.push(removeExitListener);

      // Handle input from user
      const onDataDisposable = term.onData((data) => {
        if (terminalIdRef.current !== null && !hasExited) {
          window.electron.terminal.write(terminalIdRef.current, data);
        }
      });
      cleanupRef.current.push(() => onDataDisposable.dispose());

      // Send initial command if provided
      if (initialCommand) {
        // Wait a bit for the shell to be ready
        setTimeout(() => {
          if (terminalIdRef.current !== null) {
            window.electron.terminal.write(terminalIdRef.current, initialCommand + '\r');
          }
        }, 500);
      }

      // Notify ready
      if (onReady) {
        onReady(terminalId);
      }
    } catch (error) {
      console.error('Failed to start PTY process:', error);
      if (terminalRef.current) {
        terminalRef.current.write(`\x1b[31mFailed to start terminal: ${error.message}\x1b[0m\r\n`);
      }
    }
  };

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          if (terminalIdRef.current !== null) {
            window.electron.terminal.resize(terminalIdRef.current, cols, rows);
          }
        } catch (e) {
          // Ignore resize errors during cleanup
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Focus terminal when clicked
  const handleClick = () => {
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  };

  // Show loading state while checking PTY availability
  if (!ptyStatus.checked) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center h-full bg-dark-bg">
          <span className="text-dark-text-secondary">Initializing terminal...</span>
        </div>
      </div>
    );
  }

  // Show error state if PTY is not available
  if (!ptyStatus.available) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-dark-surface border-b border-dark-border">
          <span className="text-dark-text font-medium">Terminal</span>
          <span className="w-2 h-2 rounded-full bg-red-500" title="Not available" />
        </div>
        <div className="flex-1 flex items-center justify-center bg-dark-bg p-6">
          <div className="max-w-md text-center">
            <div className="text-4xl mb-4">Terminal Unavailable</div>
            <p className="text-dark-text mb-4">
              The terminal requires native module compilation.
            </p>
            <div className="bg-dark-surface p-4 rounded-lg text-left mb-4">
              <p className="text-sm text-dark-text-secondary mb-2">To enable the terminal:</p>
              <ol className="text-sm text-dark-text space-y-2 list-decimal list-inside">
                <li>Install Visual Studio Build Tools</li>
                <li>Stop the dev server</li>
                <li>Run: <code className="bg-dark-bg px-2 py-1 rounded">npx electron-rebuild -f -w node-pty</code></li>
                <li>Restart the app</li>
              </ol>
            </div>
            {ptyStatus.error && (
              <p className="text-xs text-red-400 mt-2">
                Error: {ptyStatus.error}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-surface border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-dark-text font-medium">Terminal</span>
          {isConnected && !hasExited && (
            <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
          )}
          {hasExited && (
            <span className="text-xs text-dark-text-secondary">
              (exited: {exitInfo?.exitCode})
            </span>
          )}
        </div>
        {cwd && (
          <span className="text-xs text-dark-text-secondary truncate max-w-[300px]" title={cwd}>
            {cwd}
          </span>
        )}
      </div>

      {/* Terminal Container */}
      <div
        ref={containerRef}
        className="flex-1 bg-dark-bg p-2 overflow-hidden"
        onClick={handleClick}
        style={{ minHeight: '200px' }}
      />

      {/* Restart Button (when exited) */}
      {hasExited && (
        <div className="px-4 py-2 bg-dark-surface border-t border-dark-border">
          <button
            onClick={() => {
              setHasExited(false);
              setExitInfo(null);
              if (terminalRef.current) {
                terminalRef.current.clear();
              }
              startPtyProcess(terminalRef.current, fitAddonRef.current);
            }}
            className="px-4 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            Restart Terminal
          </button>
        </div>
      )}
    </div>
  );
};

export default Terminal;
