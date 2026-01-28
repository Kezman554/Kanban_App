import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

/**
 * Context for managing multiple terminal sessions across the app.
 * Each 'In Progress' card can have its own terminal session.
 */
const TerminalSessionContext = createContext(null);

export function TerminalSessionProvider({ children }) {
  // Map of cardId -> session info { command, status: 'running'|'exited', exitCode, cardTitle, sessionLetter }
  const [sessions, setSessions] = useState(new Map());

  // Currently active/visible terminal cardId
  const [activeCardId, setActiveCardId] = useState(null);

  // Auto-fix activeCardId if it points to a non-existent session
  useEffect(() => {
    if (activeCardId !== null && !sessions.has(activeCardId)) {
      const sessionIds = Array.from(sessions.keys());
      setActiveCardId(sessionIds.length > 0 ? sessionIds[0] : null);
    }
  }, [sessions, activeCardId]);

  // Ref to track terminal component instances for each card
  const terminalRefs = useRef(new Map());

  /**
   * Create a new terminal session for a card
   */
  const createSession = useCallback((cardId, { command, cardTitle, sessionLetter, cwd }) => {
    setSessions(prev => {
      const next = new Map(prev);
      next.set(cardId, {
        command,
        cardTitle,
        sessionLetter,
        cwd,
        status: 'running',
        exitCode: null,
        createdAt: Date.now(),
      });
      return next;
    });
    setActiveCardId(cardId);
  }, []);

  /**
   * Update session status when terminal exits
   */
  const updateSessionStatus = useCallback((cardId, exitCode) => {
    setSessions(prev => {
      const next = new Map(prev);
      const session = next.get(cardId);
      if (session) {
        next.set(cardId, {
          ...session,
          status: 'exited',
          exitCode,
        });
      }
      return next;
    });
  }, []);

  /**
   * Close/remove a terminal session
   */
  const closeSession = useCallback((cardId) => {
    setSessions(prev => {
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
    // activeCardId cleanup is handled by the useEffect above
  }, []);

  /**
   * Switch to a specific terminal by cardId
   */
  const switchToSession = useCallback((cardId) => {
    if (sessions.has(cardId)) {
      setActiveCardId(cardId);
    }
  }, [sessions]);

  /**
   * Check if a card has an active terminal session
   */
  const hasActiveSession = useCallback((cardId) => {
    return sessions.has(cardId);
  }, [sessions]);

  /**
   * Get session info for a card
   */
  const getSession = useCallback((cardId) => {
    return sessions.get(cardId);
  }, [sessions]);

  /**
   * Get all active sessions as array
   */
  const getAllSessions = useCallback(() => {
    return Array.from(sessions.entries()).map(([cardId, session]) => ({
      cardId,
      ...session,
    }));
  }, [sessions]);

  /**
   * Register a terminal ref for a card
   */
  const registerTerminalRef = useCallback((cardId, ref) => {
    terminalRefs.current.set(cardId, ref);
  }, []);

  /**
   * Unregister a terminal ref
   */
  const unregisterTerminalRef = useCallback((cardId) => {
    terminalRefs.current.delete(cardId);
  }, []);

  const value = {
    sessions,
    activeCardId,
    createSession,
    updateSessionStatus,
    closeSession,
    switchToSession,
    hasActiveSession,
    getSession,
    getAllSessions,
    registerTerminalRef,
    unregisterTerminalRef,
  };

  return (
    <TerminalSessionContext.Provider value={value}>
      {children}
    </TerminalSessionContext.Provider>
  );
}

export function useTerminalSessions() {
  const context = useContext(TerminalSessionContext);
  if (!context) {
    throw new Error('useTerminalSessions must be used within a TerminalSessionProvider');
  }
  return context;
}

export default TerminalSessionContext;
