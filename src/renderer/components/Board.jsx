import React, { useState, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import Card from './Card';
import CardStack from './CardStack';
import CompletedStack from './CompletedStack';
import CardDetail from './CardDetail';
import AddCardDialog from './AddCardDialog';
import AppendCardsDialog from './AppendCardsDialog';

// Droppable Cell Component
const DroppableCell = ({ id, children, isOver, canDrop, isEmpty }) => {
  const { setNodeRef } = useDroppable({ id });

  let dropIndicatorClass = '';
  if (isOver) {
    if (canDrop) {
      dropIndicatorClass = 'ring-2 ring-green-500 bg-green-500/10';
    } else {
      dropIndicatorClass = 'ring-2 ring-red-500 bg-red-500/10';
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[300px] p-3 border-r border-dark-border transition-all ${dropIndicatorClass}`}
    >
      {children}
    </div>
  );
};

const Board = ({ projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [activeCard, setActiveCard] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [confirmUnlockCard, setConfirmUnlockCard] = useState(null);
  const [unlockError, setUnlockError] = useState(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [expandedSubphases, setExpandedSubphases] = useState({}); // Track manually expanded blocked rows
  const [isAddCardDialogOpen, setIsAddCardDialogOpen] = useState(false);
  const [addCardSubphaseId, setAddCardSubphaseId] = useState(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [isAppendCardsDialogOpen, setIsAppendCardsDialogOpen] = useState(false);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    })
  );

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    loadProject();
  }, [projectId]);

  const loadProject = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Use Electron IPC to get project data from main process
      const projectData = await window.electron.getProject(projectId);

      if (!projectData) {
        setError('Project not found');
        if (!silent) setLoading(false);
        return;
      }

      setProject(projectData);
      if (!silent) setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load project');
      if (!silent) setLoading(false);
    }
  };

  const togglePhase = (phaseId) => {
    setCollapsedPhases(prev => ({
      ...prev,
      [phaseId]: !prev[phaseId]
    }));
  };

  const getCardsForCell = (subphaseId, status) => {
    if (!project) return [];

    // Find all cards for this subphase and status
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        if (subphase.id === subphaseId) {
          return subphase.cards.filter(card => card.status === status);
        }
      }
    }
    return [];
  };

  const findCardById = (cardId) => {
    if (!project) return null;

    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        const card = subphase.cards.find(c => c.id === cardId);
        if (card) return card;
      }
    }
    return null;
  };

  // Comparison function for session letters: A, B, C, C2, C3, D, D2... Z, AA, AA2, AB
  const compareSessionLetters = (a, b) => {
    const parse = (s) => {
      const match = s.match(/^([A-Z]+)(\d*)$/);
      if (!match) return { base: s, num: 0 };
      return { base: match[1], num: match[2] ? parseInt(match[2], 10) : 0 };
    };
    const pa = parse(a), pb = parse(b);
    // Compare base: shorter base first (A < AA), then alphabetical
    if (pa.base.length !== pb.base.length) return pa.base.length - pb.base.length;
    if (pa.base !== pb.base) return pa.base.localeCompare(pb.base);
    // Same base: sort by numeric suffix (C=0 < C2 < C3)
    return pa.num - pb.num;
  };

  // Get all cards from nested project structure
  const getAllCards = () => {
    if (!project) return [];
    const cards = [];
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        cards.push(...subphase.cards);
      }
    }
    return cards;
  };

  // Strip session letter prefix from git_commit_message (e.g. "A: ", "C2: ", "AA: ")
  const stripCommitPrefix = (msg) => {
    return msg.replace(/^[A-Z]+\d*:\s*/, '');
  };

  // Extract brief "built" summary from a DONE card
  const extractBuiltSummary = (card) => {
    const desc = card.description && card.description.trim();
    const commit = card.git_commit_message && card.git_commit_message.trim();

    if (desc && commit) {
      return `${desc} | ${stripCommitPrefix(commit)}`;
    }
    if (commit) {
      return stripCommitPrefix(commit);
    }
    if (desc) {
      return desc;
    }

    // Fallback: notes first line
    if (card.notes && card.notes.trim()) {
      return card.notes.trim().split('\n')[0].slice(0, 100);
    }
    // Fallback: extract from prompt_guide
    if (card.prompt_guide && card.prompt_guide.trim()) {
      const text = card.prompt_guide;
      const pathPattern = /(?:[\w.-]+\/)+[\w.-]+(?:\.(?:py|js|jsx|ts|tsx|sql|json|css|html|md|yaml|yml|sh|go|rs|rb|java))?/g;
      const pathMatches = text.match(pathPattern);
      const uniquePaths = pathMatches ? [...new Set(pathMatches)].slice(0, 3) : [];

      const actionWords = text.match(/\b(?:create|build|set up|implement|add|configure|define|initialize|migrate|endpoints?|routes?|schema|database|API|CRUD|auth\w*|component|service|model|middleware|handler)\b/gi);
      const uniqueActions = actionWords ? [...new Set(actionWords.map(w => w.toLowerCase()))].slice(0, 3) : [];

      const parts = [];
      if (uniquePaths.length > 0) parts.push(uniquePaths.join(', '));
      if (uniqueActions.length > 0) parts.push(uniqueActions.join(' '));

      if (parts.length > 0) return parts.join(', ');
    }
    return 'completed';
  };

  const handleExportForClaude = async () => {
    const allCards = getAllCards();
    if (allCards.length === 0) return;

    // Find highest session letter
    const letters = allCards
      .map(c => c.session_letter)
      .filter(Boolean)
      .sort(compareSessionLetters);
    const lastSessionLetter = letters[letters.length - 1] || 'none';

    // Group by status
    const groups = {
      'Done': [],
      'In Progress': [],
      'Not Started': [],
    };
    for (const card of allCards) {
      if (groups[card.status]) {
        groups[card.status].push(card);
      }
    }

    // Sort each group by session letter
    for (const status of Object.keys(groups)) {
      groups[status].sort((a, b) => compareSessionLetters(a.session_letter || '', b.session_letter || ''));
    }

    // Strip "Session X:" prefix from title since we already show the letter
    const cleanTitle = (title) => title.replace(/^Session\s+[A-Z]+\d*:\s*/i, '');

    // Build export text
    let lines = [];
    lines.push(`Project: ${project.name}`);
    lines.push(`Slug: ${project.slug}`);
    lines.push(`Last session letter: ${lastSessionLetter}`);
    lines.push('');

    // PHASES section - IDs are for use with add_to_phase / add_to_subphase in append JSON
    if (project.phases && project.phases.length > 0) {
      lines.push('PHASES (phase_id: name / subphase_id: name [cards]):');
      for (const phase of project.phases) {
        lines.push(`- ${phase.id}: ${phase.name}`);
        for (const subphase of phase.subphases || []) {
          const subphaseLetters = (subphase.cards || [])
            .map(c => c.session_letter)
            .filter(Boolean)
            .sort(compareSessionLetters);
          lines.push(`  - ${subphase.id}: ${subphase.name} [${subphaseLetters.join(', ')}]`);
        }
      }
      lines.push('');
    }

    // DONE section
    if (groups['Done'].length > 0) {
      lines.push('DONE:');
      for (const card of groups['Done']) {
        const deps = (card.depends_on_cards && card.depends_on_cards.length > 0)
          ? card.depends_on_cards.join(', ')
          : '';
        const built = extractBuiltSummary(card);
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}], built: ${built}`);
      }
      lines.push('');
    }

    // IN PROGRESS section
    if (groups['In Progress'].length > 0) {
      lines.push('IN PROGRESS:');
      for (const card of groups['In Progress']) {
        const deps = (card.depends_on_cards && card.depends_on_cards.length > 0)
          ? card.depends_on_cards.join(', ')
          : '';
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}]`);
      }
      lines.push('');
    }

    // NOT STARTED section
    if (groups['Not Started'].length > 0) {
      lines.push('NOT STARTED:');
      for (const card of groups['Not Started']) {
        const deps = (card.depends_on_cards && card.depends_on_cards.length > 0)
          ? card.depends_on_cards.join(', ')
          : '';
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}]`);
      }
      lines.push('');
    }

    // Available for dependency
    const allLetters = allCards
      .map(c => c.session_letter)
      .filter(Boolean)
      .sort(compareSessionLetters);
    lines.push(`Available for dependency: ${allLetters.join(', ')}`);

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy export:', err);
    }
  };

  const isCardBlocked = (card) => {
    if (!card) return false;

    // Check if card has dependencies
    if (!card.depends_on_cards || card.depends_on_cards.length === 0) {
      return false;
    }

    // Check if all dependencies are completed
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        for (const depCardLetter of card.depends_on_cards) {
          const depCard = subphase.cards.find(c => c.session_letter === depCardLetter);
          if (depCard && depCard.status !== 'Done') {
            return true;
          }
        }
      }
    }
    return false;
  };

  // Build dependency stacks for "Not Started" column
  // Returns: { stacks: Map<rootCardId, Card[]>, claimedCardIds: Set<cardId> }
  const dependencyData = useMemo(() => {
    if (!project) return { stacks: new Map(), claimedCardIds: new Set() };

    // Gather all cards and create lookups
    const allCards = [];
    const cardsByLetter = {};
    const cardsBySubphase = {};

    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        cardsBySubphase[subphase.id] = [];
        for (const card of subphase.cards) {
          allCards.push({ ...card, subphaseId: subphase.id });
          cardsByLetter[card.session_letter] = { ...card, subphaseId: subphase.id };
          cardsBySubphase[subphase.id].push(card);
        }
      }
    }

    // Get "Not Started" cards only
    const notStartedCards = allCards.filter(c => c.status === 'Not Started');


    // A card is a "stack root" if all its SAME-SUBPHASE dependencies are OUTSIDE "Not Started"
    // (i.e., Done, In Progress, or no dependencies)
    // Cross-subphase dependencies are ignored for stacking - those cards still show as blocked
    // but don't stack across subphase boundaries
    const isStackRoot = (card) => {
      if (!card.depends_on_cards || card.depends_on_cards.length === 0) {
        return true;
      }
      // Check if all SAME-SUBPHASE dependencies are outside "Not Started"
      return card.depends_on_cards.every(letter => {
        const depCard = cardsByLetter[letter];
        if (!depCard) return true; // Dependency doesn't exist
        // Cross-subphase dependencies don't affect stacking (card stays in its own row)
        if (depCard.subphaseId !== card.subphaseId) return true;
        // Same subphase: check if it's outside "Not Started"
        return depCard.status !== 'Not Started';
      });
    };

    // A card is actionable if all dependencies are Done
    const isActionable = (card) => {
      if (!card.depends_on_cards || card.depends_on_cards.length === 0) {
        return true;
      }
      return card.depends_on_cards.every(letter => {
        const depCard = cardsByLetter[letter];
        return depCard && depCard.status === 'Done';
      });
    };

    const stackRootCards = notStartedCards.filter(isStackRoot);
    const dependentCards = notStartedCards.filter(c => !isStackRoot(c));

    // Build stacks: each stack root card becomes a stack root
    // Find dependent cards that depend on each root card (directly or transitively)
    const stacks = new Map();
    const claimedCardIds = new Set();

    for (const rootCard of stackRootCards) {
      const stack = [rootCard];
      const stackLetters = new Set([rootCard.session_letter]);
      claimedCardIds.add(rootCard.id);

      // Iteratively find cards that depend on cards in this stack
      let foundNew = true;
      const maxIterations = 100; // Guard against circular dependencies
      let iterations = 0;

      while (foundNew && iterations < maxIterations) {
        foundNew = false;
        iterations++;

        for (const depCard of dependentCards) {
          if (claimedCardIds.has(depCard.id)) continue;

          // Only stack cards that are in the SAME subphase as the root card
          // Cross-subphase dependencies don't cause stacking
          if (depCard.subphaseId !== rootCard.subphaseId) continue;

          // Check if this card depends on any card in our stack
          const dependsOnStackCard = depCard.depends_on_cards?.some(
            letter => stackLetters.has(letter)
          );

          if (dependsOnStackCard) {
            stack.push(depCard);
            stackLetters.add(depCard.session_letter);
            claimedCardIds.add(depCard.id);
            foundNew = true;
          }
        }
      }

      stacks.set(rootCard.id, stack);
    }

    return { stacks, claimedCardIds };
  }, [project]);

  // Compute which subphases have actionable (non-blocked) cards
  // Used for auto-collapsing rows where all cards are blocked
  const subphaseActionableStatus = useMemo(() => {
    if (!project) return {};

    const status = {};

    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        // Get cards by status
        const notStartedCards = subphase.cards.filter(c => c.status === 'Not Started');
        const inProgressCards = subphase.cards.filter(c => c.status === 'In Progress');

        // In Progress cards are always actionable
        if (inProgressCards.length > 0) {
          status[subphase.id] = { hasActionable: true, blockedCount: 0, totalActiveCards: notStartedCards.length + inProgressCards.length };
          continue;
        }

        // For Not Started, check if any visible card is not blocked
        // Visible cards are: top card of each stack, and standalone cards
        let hasActionable = false;
        let blockedCount = 0;

        // Check stacks where root is in this subphase
        for (const [rootId, stack] of dependencyData.stacks) {
          const rootCard = stack[0];
          if (rootCard.subphaseId === subphase.id) {
            if (!isCardBlocked(rootCard)) {
              hasActionable = true;
            } else {
              blockedCount += stack.length; // All cards in this stack are effectively blocked
            }
          }
        }

        // Check standalone cards (not claimed by any stack)
        for (const card of notStartedCards) {
          if (!dependencyData.claimedCardIds.has(card.id)) {
            if (!isCardBlocked(card)) {
              hasActionable = true;
            } else {
              blockedCount++;
            }
          }
        }

        status[subphase.id] = {
          hasActionable,
          blockedCount,
          totalActiveCards: notStartedCards.length
        };
      }
    }

    return status;
  }, [project, dependencyData]);

  // Toggle expansion of a subphase row
  const toggleSubphaseExpanded = (subphaseId) => {
    setExpandedSubphases(prev => ({
      ...prev,
      [subphaseId]: !prev[subphaseId]
    }));
  };

  // Compute active phases (with non-completed cards) and all completed cards
  const boardDisplayData = useMemo(() => {
    if (!project) return { completedCards: [], activePhases: [], firstActiveSubphaseId: null };

    const completedCards = [];
    const activePhases = [];
    let firstActiveSubphaseId = null;

    for (const phase of project.phases) {
      const activeSubphases = [];

      for (const subphase of phase.subphases) {
        // Collect completed cards with phase context
        const doneCards = subphase.cards.filter(c => c.status === 'Done');
        completedCards.push(...doneCards.map(c => ({
          ...c,
          phaseName: phase.name,
          phaseShortName: phase.short_name,
          subphaseName: subphase.name,
          subphaseShortName: subphase.short_name,
          subphaseId: subphase.id
        })));

        // Check if subphase has active (non-Done) cards
        if (subphase.cards.some(c => c.status !== 'Done')) {
          activeSubphases.push(subphase);
          if (!firstActiveSubphaseId) firstActiveSubphaseId = subphase.id;
        }
      }

      if (activeSubphases.length > 0) {
        activePhases.push({ ...phase, subphases: activeSubphases });
      }
    }

    // Sort completed cards: most recent first (newest at top of stack)
    completedCards.sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at) : new Date(0);
      const dateB = b.completed_at ? new Date(b.completed_at) : new Date(0);
      return dateB - dateA;
    });

    return { completedCards, activePhases, firstActiveSubphaseId };
  }, [project]);

  const canDropCard = (cardId, newStatus) => {
    const card = findCardById(cardId);
    if (!card) return false;

    // Blocked cards cannot be moved to "In Progress"
    if (newStatus === 'In Progress' && isCardBlocked(card)) {
      return false;
    }

    return true;
  };

  const handleDragStart = (event) => {
    const cardId = parseInt(event.active.id);
    const card = findCardById(cardId);
    setActiveCard(card);
  };

  const handleDragOver = (event) => {
    const { over } = event;

    if (over) {
      // Handle the special done-column drop target
      if (over.id === 'done-column') {
        setDropTarget({ subphaseId: null, status: 'Done' });
      } else {
        const [subphaseId, status] = over.id.split('|');
        setDropTarget({ subphaseId: parseInt(subphaseId), status });
      }
    } else {
      setDropTarget(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    setActiveCard(null);
    setDropTarget(null);

    if (!over) return;

    const cardId = parseInt(active.id);
    const card = findCardById(cardId);

    // Determine the new status based on drop target
    let newStatus;
    if (over.id === 'done-column') {
      newStatus = 'Done';
    } else {
      const [, status] = over.id.split('|');
      newStatus = status;
    }

    if (!card || card.status === newStatus) return;

    // Validate drop
    if (!canDropCard(cardId, newStatus)) {
      console.log('Cannot drop: card is blocked and target is In Progress');
      return;
    }

    try {
      // Update status in database
      await window.electron.updateCardStatus(cardId, newStatus);

      // Reload project to get updated data (silent to preserve scroll position)
      await loadProject(true);
    } catch (err) {
      console.error('Failed to update card status:', err);
      setError('Failed to update card status');
    }
  };

  // Handle card click to open detail panel
  const handleCardClick = (card) => {
    setSelectedCard(card);
    setIsDetailOpen(true);
  };

  // Handle closing detail panel
  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    // Keep selectedCard for animation, clear after a brief delay
    setTimeout(() => {
      if (!isDetailOpen) setSelectedCard(null);
    }, 300);
  };

  // Handle marking card as done
  const handleMarkDone = async (cardId, progressNotes) => {
    try {
      await window.electron.updateCardStatus(cardId, 'Done');
      // TODO: Store progress notes if provided
      if (progressNotes) {
        console.log('Progress notes for card', cardId, ':', progressNotes);
        // Could save to card.notes field or a separate progress log
      }
      await loadProject(true);
      // Update selected card if it was the one marked done
      if (selectedCard?.id === cardId) {
        const updatedCard = findCardById(cardId);
        if (updatedCard) setSelectedCard({ ...updatedCard, status: 'Done' });
      }
    } catch (err) {
      console.error('Failed to mark card as done:', err);
      setError('Failed to update card status');
    }
  };

  // Handle status change from CardDetail
  const handleStatusChange = async (cardId, newStatus) => {
    try {
      await window.electron.updateCardStatus(cardId, newStatus);
      await loadProject(true);
      // Update selected card if it was the one changed
      if (selectedCard?.id === cardId) {
        const updatedCard = findCardById(cardId);
        if (updatedCard) setSelectedCard({ ...updatedCard, status: newStatus });
      }
    } catch (err) {
      console.error('Failed to update card status:', err);
      setError('Failed to update card status');
    }
  };

  // Handle card data updates (notes, prompt_guide, etc.) from CardDetail
  const handleCardUpdated = async (cardId) => {
    try {
      // Fetch fresh card data directly from database (avoids race condition with state)
      const freshCard = await window.electron.getCard(cardId);
      if (freshCard && selectedCard?.id === cardId) {
        setSelectedCard(freshCard);
      }
      // Also refresh project data in background
      await loadProject(true);
    } catch (err) {
      console.error('Failed to refresh card data:', err);
    }
  };

  const handleCardDeleted = async (cardId) => {
    handleCloseDetail();
    await loadProject(true);
  };

  // Open add card dialog for a specific subphase
  const handleOpenAddCard = (subphaseId) => {
    setAddCardSubphaseId(subphaseId);
    setIsAddCardDialogOpen(true);
  };

  // Handle creating a new card
  const handleCreateCard = async (subphaseId, cardData) => {
    try {
      await window.electron.createCard(subphaseId, cardData);
      await loadProject(true);
    } catch (err) {
      console.error('Failed to create card:', err);
      throw err;
    }
  };

  // Get all existing cards in the project for dependency selection
  const getAllProjectCards = () => {
    if (!project?.phases) return [];
    const cards = [];
    for (const phase of project.phases) {
      for (const subphase of phase.subphases || []) {
        for (const card of subphase.cards || []) {
          cards.push({
            session_letter: card.session_letter,
            title: card.title,
            status: card.status,
          });
        }
      }
    }
    return cards.sort((a, b) => {
      if (a.session_letter.length !== b.session_letter.length) {
        return a.session_letter.length - b.session_letter.length;
      }
      return a.session_letter.localeCompare(b.session_letter);
    });
  };

  // Show confirmation dialog for unlocking a card
  const handleUnlockClick = (card) => {
    setConfirmUnlockCard(card);
    setUnlockError(null);
  };

  // Actually unlock the card after confirmation
  const handleConfirmUnlock = async () => {
    if (!confirmUnlockCard) return;

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      await window.electron.clearCardDependencies(confirmUnlockCard.id);
      await loadProject(true);
      setConfirmUnlockCard(null);
    } catch (err) {
      console.error('Failed to unlock card:', err);
      setUnlockError(err.message || 'Failed to unlock card');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Cancel unlock confirmation
  const handleCancelUnlock = () => {
    setConfirmUnlockCard(null);
    setUnlockError(null);
  };

  // Handle unlocking a card (clearing its dependencies) - for modal use
  const handleUnlockCard = async (cardId) => {
    try {
      await window.electron.clearCardDependencies(cardId);
      await loadProject(true);
    } catch (err) {
      console.error('Failed to unlock card:', err);
      // Re-throw so the modal can handle the error display
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-text-secondary">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-dark-text-secondary">No project selected</div>
      </div>
    );
  }

  const columns = project.columns || ['Not Started', 'In Progress', 'Done'];
  // Filter out 'Done' for per-row rendering - it gets its own aggregated column
  const activeColumns = columns.filter(col => col !== 'Done');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-dark-bg">
        {/* Board Header */}
        <div className="flex-shrink-0 p-6 border-b border-dark-border">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-dark-text">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-dark-text-secondary mt-1">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setIsAppendCardsDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30 transition-colors"
                title="Append cards from JSON file"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Append Cards
              </button>
              <button
                onClick={handleExportForClaude}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 transition-colors"
                title="Copy project context for Claude"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                {exportCopied ? 'Copied!' : 'Export for Claude'}
              </button>
            </div>
          </div>
          {/* Directory Path */}
          <div className="flex items-center gap-2 text-xs">
            {project.directory_path ? (
              <>
                <button
                  onClick={async () => {
                    try {
                      await window.electron.openInExplorer(project.directory_path);
                    } catch (err) {
                      console.error('Failed to open folder:', err);
                    }
                  }}
                  className="flex items-center gap-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
                  title="Open in file explorer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="font-mono">{project.directory_path}</span>
                </button>
                <button
                  onClick={async () => {
                    const newPath = await window.electron.selectDirectory();
                    if (newPath) {
                      await window.electron.updateProjectPath(project.id, newPath);
                      await loadProject(true);
                    }
                  }}
                  className="text-dark-text-secondary hover:text-dark-text transition-colors"
                  title="Change project folder"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={async () => {
                  const newPath = await window.electron.selectDirectory();
                  if (newPath) {
                    await window.electron.updateProjectPath(project.id, newPath);
                    await loadProject(true);
                  }
                }}
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>Set project folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Board Content */}
        <div className="flex-1 overflow-auto scrollbar-dark">
          <div className="flex min-w-max">
            {/* Left side: Row headers + Not Started + In Progress columns */}
            <div className="flex-1">
              {/* Column Headers */}
              <div className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border">
                <div className="flex">
                  {/* Row header spacer */}
                  <div className="w-48 flex-shrink-0 p-4 border-r border-dark-border">
                    <span className="text-xs font-semibold text-dark-text-secondary uppercase">
                      Subphase
                    </span>
                  </div>

                  {/* Active column headers (Not Started, In Progress) */}
                  {activeColumns.map((column, idx) => (
                    <div
                      key={idx}
                      className="flex-1 min-w-[300px] p-4 border-r border-dark-border"
                    >
                      <h3 className="text-sm font-bold text-dark-text">{column}</h3>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase Sections - only render active phases (those with non-Done cards) */}
              {boardDisplayData.activePhases.length > 0 ? (
                boardDisplayData.activePhases.map((phase) => (
                  <div key={phase.id} className="border-b border-dark-border">
                    {/* Phase Header (Collapsible) */}
                    <div
                      className="bg-dark-surface sticky top-[57px] z-[9] cursor-pointer hover:bg-dark-hover transition-colors"
                      onClick={() => togglePhase(phase.id)}
                    >
                      <div className="flex items-center gap-3 p-4 border-b border-dark-border">
                        {/* Collapse/Expand Icon */}
                        <span className="text-dark-text-secondary text-sm">
                          {collapsedPhases[phase.id] ? '▶' : '▼'}
                        </span>

                        {/* Phase Name */}
                        <h2 className="text-lg font-bold text-dark-text">
                          {phase.short_name ? `${phase.short_name}: ` : ''}
                          {phase.name}
                        </h2>

                        {/* Phase Description */}
                        {phase.description && (
                          <span className="text-sm text-dark-text-secondary ml-2">
                            — {phase.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subphase Rows */}
                    {!collapsedPhases[phase.id] && phase.subphases && (
                      <div>
                        {phase.subphases.map((subphase) => {
                          // Check if this row should be auto-collapsed (all cards blocked)
                          const subphaseStatus = subphaseActionableStatus[subphase.id] || { hasActionable: true, blockedCount: 0 };
                          const isAutoCollapsed = !subphaseStatus.hasActionable && subphaseStatus.blockedCount > 0;
                          const isManuallyExpanded = expandedSubphases[subphase.id];
                          const isCollapsed = isAutoCollapsed && !isManuallyExpanded;

                          // Render collapsed row
                          if (isCollapsed) {
                            return (
                              <div
                                key={subphase.id}
                                className="flex border-b border-dark-border hover:bg-dark-surface/50 transition-colors cursor-pointer"
                                onClick={() => toggleSubphaseExpanded(subphase.id)}
                              >
                                {/* Collapsed Row Header */}
                                <div className="w-48 flex-shrink-0 p-3 border-r border-dark-border bg-dark-surface/50">
                                  <div className="flex items-center gap-2">
                                    {/* Chevron */}
                                    <span className="text-dark-text-secondary text-sm flex-shrink-0">▶</span>

                                    {/* Subphase short name badge */}
                                    <div className="flex-shrink-0 w-8 h-8 rounded bg-dark-bg/50 flex items-center justify-center font-bold text-xs text-dark-text-secondary border border-dark-border">
                                      {subphase.short_name || '—'}
                                    </div>

                                    {/* Subphase name */}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-dark-text-secondary truncate" title={subphase.name}>
                                        {subphase.name.replace(/^\d+\.\d+\s+/, '')}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Collapsed content area spans all columns */}
                                <div className="flex-1 p-3 flex items-center">
                                  <div className="flex items-center gap-2 text-dark-text-secondary">
                                    <span className="text-lg">🔒</span>
                                    <span className="text-sm">
                                      {subphaseStatus.blockedCount} blocked {subphaseStatus.blockedCount === 1 ? 'card' : 'cards'}
                                    </span>
                                    <span className="text-xs opacity-60">— click to expand</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Render expanded row (normal or manually expanded)
                          return (
                          <div key={subphase.id} className="flex border-b border-dark-border hover:bg-dark-surface/30 transition-colors">
                            {/* Row Header */}
                            <div className="w-48 flex-shrink-0 p-4 border-r border-dark-border bg-dark-surface">
                              <div className="flex items-center gap-2">
                                {/* Collapse chevron for manually expanded rows */}
                                {isAutoCollapsed && isManuallyExpanded && (
                                  <span
                                    className="text-dark-text-secondary text-sm flex-shrink-0 cursor-pointer hover:text-dark-text"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSubphaseExpanded(subphase.id);
                                    }}
                                    title="Collapse row"
                                  >
                                    ▼
                                  </span>
                                )}

                                {/* Subphase short name badge */}
                                <div className="flex-shrink-0 w-10 h-10 rounded bg-dark-bg flex items-center justify-center font-bold text-sm text-dark-text border border-dark-border">
                                  {subphase.short_name || '—'}
                                </div>

                                {/* Subphase name */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-dark-text truncate" title={subphase.name}>
                                    {subphase.name.replace(/^\d+\.\d+\s+/, '')}
                                  </div>
                                  {subphase.description && (
                                    <div className="text-xs text-dark-text-secondary truncate mt-1" title={subphase.description}>
                                      {subphase.description}
                                    </div>
                                  )}
                                </div>

                                {/* Add Card Button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAddCard(subphase.id);
                                  }}
                                  className="flex-shrink-0 w-7 h-7 rounded bg-dark-bg border border-dark-border hover:border-blue-500 hover:bg-blue-500/10 flex items-center justify-center text-dark-text-secondary hover:text-blue-400 transition-colors"
                                  title="Add card to this subphase"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Cells for active columns only (Not Started, In Progress) */}
                            {activeColumns.map((column, colIdx) => {
                              const cards = getCardsForCell(subphase.id, column);
                              const cellId = `${subphase.id}|${column}`;
                              const isOver = dropTarget?.subphaseId === subphase.id && dropTarget?.status === column;
                              const canDrop = activeCard ? canDropCard(activeCard.id, column) : true;

                              // For "Not Started" column, use dependency stacking
                              if (column === 'Not Started') {
                                // Find stacks where the root card belongs to this subphase
                                const stacksForCell = [];
                                for (const [rootId, stack] of dependencyData.stacks) {
                                  const rootCard = stack[0];
                                  if (rootCard.subphaseId === subphase.id) {
                                    stacksForCell.push(stack);
                                  }
                                }

                                // Find standalone cards (not claimed by any stack)
                                const standaloneCards = cards.filter(
                                  card => !dependencyData.claimedCardIds.has(card.id)
                                );

                                const hasContent = stacksForCell.length > 0 || standaloneCards.length > 0;
                                const totalCards = cards.length;
                                const allBlocked = totalCards > 0 && !hasContent;

                                return (
                                  <DroppableCell
                                    key={colIdx}
                                    id={cellId}
                                    isOver={isOver}
                                    canDrop={canDrop}
                                    isEmpty={!hasContent}
                                  >
                                    {hasContent ? (
                                      <div className="space-y-4">
                                        {/* Render dependency stacks */}
                                        {stacksForCell.map((stack) => {
                                          // Mark each card with its blocked status
                                          const cardsWithBlockedStatus = stack.map(card => ({
                                            ...card,
                                            isBlocked: isCardBlocked(card)
                                          }));
                                          return (
                                            <CardStack
                                              key={stack[0].id}
                                              cards={cardsWithBlockedStatus}
                                              onCardClick={handleCardClick}
                                              onUnlockCard={handleUnlockCard}
                                              onUnlockTopCard={handleUnlockClick}
                                            />
                                          );
                                        })}
                                        {/* Render standalone cards */}
                                        {standaloneCards.map((card) => {
                                          const cardWithBlocked = { ...card, isBlocked: isCardBlocked(card) };
                                          return (
                                            <Card
                                              key={card.id}
                                              card={cardWithBlocked}
                                              isDragging={activeCard?.id === card.id}
                                              onClick={handleCardClick}
                                              onUnlock={cardWithBlocked.isBlocked ? handleUnlockClick : undefined}
                                            />
                                          );
                                        })}
                                      </div>
                                    ) : allBlocked ? (
                                      <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg opacity-50">
                                        <span className="text-xs text-dark-text-secondary">All cards blocked</span>
                                      </div>
                                    ) : (
                                      <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
                                        <span className="text-xs text-dark-text-secondary">No cards</span>
                                      </div>
                                    )}
                                  </DroppableCell>
                                );
                              }

                              // For In Progress column, render normally
                              return (
                                <DroppableCell
                                  key={colIdx}
                                  id={cellId}
                                  isOver={isOver}
                                  canDrop={canDrop}
                                  isEmpty={cards.length === 0}
                                >
                                  {cards.length > 0 ? (
                                    <div className="space-y-2">
                                      {cards.map((card) => (
                                        <Card
                                          key={card.id}
                                          card={{ ...card, isBlocked: false }}
                                          isDragging={activeCard?.id === card.id}
                                          onClick={handleCardClick}
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="h-20 flex items-center justify-center border-2 border-dashed border-dark-border rounded-lg">
                                      <span className="text-xs text-dark-text-secondary">No cards</span>
                                    </div>
                                  )}
                                </DroppableCell>
                              );
                            })}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty state for phase with no subphases */}
                    {!collapsedPhases[phase.id] && (!phase.subphases || phase.subphases.length === 0) && (
                      <div className="p-8 text-center text-dark-text-secondary">
                        No subphases in this phase
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-dark-text-secondary">
                  {boardDisplayData.completedCards.length > 0
                    ? 'All tasks complete!'
                    : 'No phases in this project'}
                </div>
              )}
            </div>

            {/* Right side: Done column - single aggregated cell */}
            <div className="w-[300px] flex-shrink-0 border-l border-dark-border">
              {/* Done column header */}
              <div className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border p-4">
                <h3 className="text-sm font-bold text-dark-text">Done</h3>
              </div>

              {/* Done column content - single aggregated stack */}
              <DroppableCell
                id="done-column"
                isOver={dropTarget?.status === 'Done'}
                canDrop={true}
                isEmpty={boardDisplayData.completedCards.length === 0}
              >
                <CompletedStack
                  cards={boardDisplayData.completedCards}
                  onCardClick={handleCardClick}
                />
              </DroppableCell>
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeCard ? (
          <div className="opacity-50">
            <Card card={activeCard} />
          </div>
        ) : null}
      </DragOverlay>

      {/* Card Detail Panel */}
      <CardDetail
        card={selectedCard}
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        onMarkDone={handleMarkDone}
        onStatusChange={handleStatusChange}
        onCardUpdated={handleCardUpdated}
        onCardDeleted={handleCardDeleted}
        project={project}
      />

      {/* Add Card Dialog */}
      <AddCardDialog
        isOpen={isAddCardDialogOpen}
        onClose={() => {
          setIsAddCardDialogOpen(false);
          setAddCardSubphaseId(null);
        }}
        onSave={handleCreateCard}
        subphaseId={addCardSubphaseId}
        projectId={projectId}
        existingCards={getAllProjectCards()}
      />

      {/* Append Cards Dialog */}
      <AppendCardsDialog
        isOpen={isAppendCardsDialogOpen}
        onClose={() => setIsAppendCardsDialogOpen(false)}
        project={project}
        onSuccess={() => loadProject(true)}
      />

      {/* Unlock Confirmation Dialog */}
      {confirmUnlockCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <div
            className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm"
            onClick={handleCancelUnlock}
          />
          <div className="relative z-10 bg-dark-surface border border-dark-border rounded-lg shadow-2xl p-6 max-w-md">
            <h3 className="text-lg font-bold text-dark-text mb-4">Unlock Card?</h3>
            <p className="text-dark-text-secondary mb-2">
              Are you sure you want to unlock <span className="font-semibold text-dark-text">"{confirmUnlockCard.title}"</span>?
            </p>
            <p className="text-dark-text-secondary mb-6 text-sm">
              This will remove all dependencies for this card. It will become immediately actionable.
            </p>
            {unlockError && (
              <div className="mb-4 p-3 rounded bg-red-900/50 border border-red-700 text-red-300 text-sm">
                {unlockError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-dark-bg border border-dark-border text-dark-text hover:bg-dark-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-500 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Export toast notification */}
      {exportCopied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-purple-600/90 text-white text-sm font-medium rounded-lg shadow-lg backdrop-blur-sm border border-purple-400/30 transition-opacity duration-300">
          Project context copied to clipboard
        </div>
      )}
    </DndContext>
  );
};

export default Board;
