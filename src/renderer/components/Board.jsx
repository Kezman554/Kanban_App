import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import { copyText } from '../utils/clipboard.js';
import Card from './Card';
import CardStack from './CardStack';
import CompletedStack from './CompletedStack';
import CardDetail from './CardDetail';
import AddCardDialog from './AddCardDialog';
import AppendCardsDialog from './AppendCardsDialog';
import EditProjectDialog from './EditProjectDialog';
import {
  buildCardStatusByLetter,
  buildCardInfoByLetter,
  getWaitsOnLabel,
  getBlockedReason,
  isCardBlocked as isCardBlockedShared,
} from '../utils/cardBlocking';
import { phaseTitle, subphaseTitle } from '../utils/labels';
import SubphaseBadge from './SubphaseBadge';
import {
  Lock, Pencil, Plus, ClipboardCopy, Upload, Folder, Copy, Check, ChevronRight, ChevronDown,
} from './icons';

// Header buttons: palette fills with the card outline and offset shadow
const headerButton = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border-[1.5px] border-card-line shadow-card hover:brightness-95 transition';

// Droppable Cell Component
const DroppableCell = ({ id, children, isOver, canDrop, isEmpty, className = '' }) => {
  const { setNodeRef } = useDroppable({ id });

  let dropIndicatorClass = '';
  if (isOver) {
    if (canDrop) {
      dropIndicatorClass = 'ring-2 ring-success-text bg-progress/25';
    } else {
      dropIndicatorClass = 'ring-2 ring-danger-text bg-danger/10';
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[300px] p-3 transition-colors ${className} ${dropIndicatorClass}`}
    >
      {children}
    </div>
  );
};

// Column title fills, keyed by column name. Deep, solid colours with cream
// text so the titles read as labels, never as (pastel) cards.
const COLUMN_TONES = {
  'Not Started': 'bg-pal-lilac-deep',
  'In Progress': 'bg-primary',
  'Done': 'bg-done',
};

// Column title: a deep-coloured pill (cards are pastel, 14px corners, with an
// offset shadow) with the card count in a cream badge
const ColumnLabel = ({ name, count }) => (
  <h3
    className={`inline-flex items-center gap-[10px] pl-[21px] pr-2 py-[5px] rounded-full text-[15.6px] leading-[21px] font-bold uppercase tracking-wider text-cream ${
      COLUMN_TONES[name] || 'bg-pal-lilac-deep'
    }`}
  >
    {name}
    <span className="min-w-[31px] px-2 py-[3px] rounded-full bg-cream text-card-ink text-center tracking-normal">
      {count}
    </span>
  </h3>
);

// A divider drawn as a pseudo-element so it can stop short of the page edges
// (the caller adds after:left-* / after:right-*)
const INSET_RULE = 'after:absolute after:bottom-0 after:h-px after:bg-divider';

// How far down the visible board area the Done pile sits, as a fraction of its
// height. It sticks there while the board scrolls; tune it here.
const DONE_PILE_FROM_TOP = 1 / 3;
// Height of the sticky column header row (h-12) and the drop cell's padding
// (p-3): the pile never sits higher than just under the header
const COLUMN_HEADER_PX = 48;
const DONE_CELL_PADDING_PX = 12;

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
  // Vault export (Sync to Vault): phase drives the button + a visible status
  // line so success ("Exported N cards…") and failures are never silent.
  const [vaultSyncStatus, setVaultSyncStatus] = useState({ phase: 'idle', message: '' });
  const [isAppendCardsDialogOpen, setIsAppendCardsDialogOpen] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  // Visible height of the scrolling board area, for placing the Done pile
  const boardScrollRef = useRef(null);
  const [boardHeight, setBoardHeight] = useState(0);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    })
  );

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBoardHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, project === null]);

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

    // Find highest session letter - never below the project's high-water
    // mark, so a deleted card's letter is not offered again
    const letters = allCards
      .map(c => c.session_letter)
      .concat(project.session_letter_high_water || [])
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

    // Format cross-project dependencies as ", external deps: [slug/letter: description, ...]"
    // so a Claude chat can see blockers from other projects. Empty string when none.
    const formatExternalDeps = (card) => {
      const deps = card.external_dependencies || [];
      if (deps.length === 0) return '';
      const parts = deps.map(d => {
        const label = `${d.project_slug}/${d.card_letter}`;
        const desc = d.description ? `: ${d.description}` : '';
        const mark = d.resolved ? ' (done)' : '';
        return `${label}${desc}${mark}`;
      });
      return `, external deps: [${parts.join(', ')}]`;
    };

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
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}]${formatExternalDeps(card)}, built: ${built}`);
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
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}]${formatExternalDeps(card)}`);
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
        lines.push(`- ${card.session_letter}: ${cleanTitle(card.title)} → depends on [${deps}]${formatExternalDeps(card)}`);
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
      await copyText(text);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy export:', err);
    }
  };

  const handleSyncToVault = async () => {
    if (vaultSyncStatus.phase === 'running') return; // guard double-clicks
    setVaultSyncStatus({ phase: 'running', message: '' });
    try {
      const result = await window.electron.exportToVault();
      const message = (result && result.message) || 'Exported to vault.';
      setVaultSyncStatus({ phase: 'done', message });
      setTimeout(() => setVaultSyncStatus({ phase: 'idle', message: '' }), 5000);
    } catch (err) {
      console.error('Failed to sync to vault:', err);
      setVaultSyncStatus({ phase: 'error', message: err.message || 'Vault export failed.' });
      setTimeout(() => setVaultSyncStatus({ phase: 'idle', message: '' }), 8000);
    }
  };

  // Blocked check shared with RoadmapView / AllProjectsView (utils/cardBlocking)
  const cardStatusByLetter = useMemo(() => buildCardStatusByLetter(project), [project]);
  const isCardBlocked = (card) => isCardBlockedShared(card, cardStatusByLetter);
  const cardInfoByLetter = useMemo(() => buildCardInfoByLetter(project), [project]);

  // A card as drawn on the board: its blocked state and, when blocked, the
  // short "waits on X (2.1)" label naming blockers in other subphases
  const withBlockedState = (card, subphaseId) => {
    const isBlocked = isCardBlocked(card);
    return {
      ...card,
      isBlocked,
      waitsOn: isBlocked ? getWaitsOnLabel(card, cardInfoByLetter, subphaseId) : null,
      blockedReason: isBlocked ? getBlockedReason(card, cardStatusByLetter) : null,
    };
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
    if (!project) return { completedCards: [], activePhases: [], firstActiveSubphaseId: null, statusCounts: {} };

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
        // "x of y done" counts every card in the phase, done subphases included
        const phaseCards = phase.subphases.flatMap(s => s.cards);
        activePhases.push({
          ...phase,
          subphases: activeSubphases,
          doneCount: phaseCards.filter(c => c.status === 'Done').length,
          totalCount: phaseCards.length,
        });
      }
    }

    // Sort completed cards: most recent first (newest at top of stack)
    completedCards.sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at) : new Date(0);
      const dateB = b.completed_at ? new Date(b.completed_at) : new Date(0);
      return dateB - dateA;
    });

    // Card counts for the column headers
    const statusCounts = {};
    for (const phase of project.phases) {
      for (const subphase of phase.subphases) {
        for (const card of subphase.cards) statusCounts[card.status] = (statusCounts[card.status] || 0) + 1;
      }
    }

    return { completedCards, activePhases, firstActiveSubphaseId, statusCounts };
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

  // Handle marking card as done. Resolves true once the status is stored
  // and the board reloaded (so the card is already in Done when CardDetail
  // closes), false if it was not - CardDetail then stays open and reports it.
  const handleMarkDone = async (cardId) => {
    try {
      await window.electron.updateCardStatus(cardId, 'Done');
    } catch (err) {
      console.error('Failed to mark card as done:', err);
      return false;
    }
    await loadProject(true);
    return true;
  };

  // Handle status change from CardDetail. Resolves true once the status is
  // stored, false if it was not - Start Session closes the view only on true.
  // No setError on failure: that swaps the whole board (open card included)
  // for an error screen, and CardDetail reports the failure itself.
  const handleStatusChange = async (cardId, newStatus) => {
    try {
      await window.electron.updateCardStatus(cardId, newStatus);
    } catch (err) {
      console.error('Failed to update card status:', err);
      return false;
    }
    await loadProject(true);
    // Update selected card if it was the one changed
    if (selectedCard?.id === cardId) {
      const updatedCard = findCardById(cardId);
      if (updatedCard) setSelectedCard({ ...updatedCard, status: newStatus });
    }
    return true;
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

  // Open add card dialog, pre-selecting the subphase it was opened from. null
  // (the empty-board button) opens it with no destination chosen.
  const handleOpenAddCard = (subphaseId = null) => {
    setAddCardSubphaseId(subphaseId);
    setIsAddCardDialogOpen(true);
  };

  // Handle creating a new card. placement is one of the append importer's
  // three legal placements, so the dialog can create the card's phase and/or
  // subphase in the same transaction as the card.
  const handleCreateCard = async (placement, cardData) => {
    try {
      await window.electron.createCardAt(projectId, placement, cardData);
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
        <div className="text-muted">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-danger-text">Error: {error}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">No project selected</div>
      </div>
    );
  }

  // Where the Done pile sticks: a fraction of the visible board, never above
  // the header row
  const donePileTop = Math.max(
    COLUMN_HEADER_PX + DONE_CELL_PADDING_PX,
    Math.round(boardHeight * DONE_PILE_FROM_TOP)
  );

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
      <div className="h-full flex flex-col bg-page">
        {/* Board Header */}
        <div className={`relative flex-shrink-0 p-6 ${INSET_RULE} after:left-6 after:right-6`}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
                <span
                  title="Short label used in summary exports. Defaults to the first word of the project name if blank."
                  className="flex items-center gap-1.5 px-2 py-0.5 text-xs rounded border border-line bg-panel text-muted"
                >
                  <span className="font-medium">Short:</span>
                  <span className={project.short_name ? 'text-ink' : 'italic'}>
                    {project.short_name || 'not set'}
                  </span>
                </span>
              </div>
              {project.description && (
                <p className="text-sm text-muted mt-1">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setIsEditProjectOpen(true)}
                className={`${headerButton} bg-pal-lilac text-card-ink`}
                title="Edit name, short name, description and file path"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setIsAppendCardsDialogOpen(true)}
                className={`${headerButton} bg-pal-marigold text-card-ink`}
                title="Append cards from JSON file"
              >
                <Plus className="w-3.5 h-3.5" />
                Append Cards
              </button>
              <button
                onClick={handleExportForClaude}
                className={`${headerButton} bg-pal-mint text-card-ink`}
                title="Copy project context for Claude"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                {exportCopied ? 'Copied!' : 'Export project JSON'}
              </button>
              {/* A failed sync says so in words and swaps to a danger outline */}
              <button
                onClick={handleSyncToVault}
                disabled={vaultSyncStatus.phase === 'running'}
                className={`${headerButton} disabled:opacity-60 disabled:cursor-wait ${
                  vaultSyncStatus.phase === 'error'
                    ? 'bg-panel text-danger-text !border-danger-text'
                    : 'bg-primary text-on-primary'
                }`}
                title={vaultSyncStatus.message || 'Export all projects to Obsidian vault'}
              >
                <Upload className="w-3.5 h-3.5" />
                {vaultSyncStatus.phase === 'running'
                  ? 'Syncing…'
                  : vaultSyncStatus.phase === 'done'
                  ? 'Synced!'
                  : vaultSyncStatus.phase === 'error'
                  ? 'Sync failed'
                  : 'Sync to Vault'}
              </button>
              {vaultSyncStatus.message && (
                <span
                  className={`text-xs ${
                    vaultSyncStatus.phase === 'error' ? 'text-danger-text' : 'text-success-text'
                  }`}
                >
                  {vaultSyncStatus.message}
                </span>
              )}
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
                  className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors"
                  title="Open in file explorer"
                >
                  <Folder className="w-4 h-4" />
                  <span>{project.directory_path}</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      await copyText(project.directory_path);
                      setPathCopied(true);
                      setTimeout(() => setPathCopied(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy path:', err);
                    }
                  }}
                  className={`transition-colors ${pathCopied ? 'text-success-text' : 'text-muted hover:text-ink'}`}
                  title={pathCopied ? 'Copied!' : 'Copy path to clipboard'}
                >
                  {pathCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditProjectOpen(true)}
                className="flex items-center gap-1.5 text-link hover:text-link transition-colors"
              >
                <Folder className="w-4 h-4" />
                <span>Set project folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Board Content */}
        <div ref={boardScrollRef} className="flex-1 overflow-auto scrollbar-themed">
          <div className="flex min-w-fit">
            {/* Left side: Not Started + In Progress, full width */}
            <div className="flex-1">
              {/* Column Headers */}
              <div className={`sticky top-0 z-10 h-12 flex bg-page ${INSET_RULE} after:left-6 after:right-0`}>
                {activeColumns.map((column, idx) => (
                  <div key={idx} className="flex-1 min-w-[300px] px-4 flex items-center justify-center">
                    <ColumnLabel name={column} count={boardDisplayData.statusCounts[column] || 0} />
                  </div>
                ))}
              </div>

              {/* Phase Sections - only render active phases (those with non-Done cards) */}
              {boardDisplayData.activePhases.length > 0 ? (
                boardDisplayData.activePhases.map((phase) => (
                  <div key={phase.id} className="pb-3">
                    {/* Phase Header (Collapsible) */}
                    <div
                      className={`group bg-page sticky top-12 z-[9] cursor-pointer ${INSET_RULE} after:left-6 after:right-6`}
                      onClick={() => togglePhase(phase.id)}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Collapse/Expand Icon */}
                        <span className="text-muted group-hover:text-ink transition-colors">
                          {collapsedPhases[phase.id]
                            ? <ChevronRight className="w-5 h-5" />
                            : <ChevronDown className="w-5 h-5" />}
                        </span>

                        {/* Phase Name: "9 · Testing & Release" */}
                        <h2 className="text-lg font-bold text-ink whitespace-nowrap">
                          {phaseTitle(phase)}
                        </h2>

                        <span className="text-sm text-muted whitespace-nowrap">
                          {phase.doneCount} of {phase.totalCount} done
                        </span>

                        {/* Phase Description */}
                        {phase.description && (
                          <span className="flex-1 w-0 text-sm text-muted truncate" title={phase.description}>
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
                          const subphaseName = subphaseTitle(subphase);

                          // Collapsed row: one dashed row (never coloured - nothing to pick up)
                          if (isCollapsed) {
                            return (
                              <div key={subphase.id} className="px-3 pt-3">
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] border-[1.5px] border-dashed border-dash text-left hover:bg-hover transition-colors"
                                  onClick={() => toggleSubphaseExpanded(subphase.id)}
                                  aria-expanded="false"
                                >
                                  <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                                  <SubphaseBadge subphase={subphase} />
                                  <span className="text-sm font-semibold text-ink truncate" title={subphase.name}>
                                    {subphaseName}
                                  </span>
                                  <Lock className="w-4 h-4 text-muted flex-shrink-0" />
                                  <span className="text-sm text-muted whitespace-nowrap">
                                    {subphaseStatus.blockedCount} blocked {subphaseStatus.blockedCount === 1 ? 'card' : 'cards'} — click to expand
                                  </span>
                                </button>
                              </div>
                            );
                          }

                          // Expanded row (normal or manually expanded): tab, then the cells
                          return (
                          <div key={subphase.id} className="pt-3">
                            {/* Subphase tab: badge, name, then a faint rule to the right */}
                            <div className="flex items-center gap-2 px-4">
                              {/* Collapse chevron for manually expanded rows */}
                              {isAutoCollapsed && isManuallyExpanded && (
                                <button
                                  type="button"
                                  className="text-muted hover:text-ink flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubphaseExpanded(subphase.id);
                                  }}
                                  title="Collapse row"
                                  aria-label="Collapse row"
                                  aria-expanded="true"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              )}
                              <SubphaseBadge subphase={subphase} />
                              <span
                                className="text-sm font-semibold text-ink whitespace-nowrap"
                                title={subphase.description ? `${subphase.name} — ${subphase.description}` : subphase.name}
                              >
                                {subphaseName}
                              </span>
                              <span className="flex-1 h-px bg-divider ml-1" aria-hidden="true" />

                              {/* Add Card Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAddCard(subphase.id);
                                }}
                                className="flex-shrink-0 w-7 h-7 rounded-full border-[1.5px] border-line flex items-center justify-center text-muted hover:text-ink hover:bg-hover transition-colors"
                                title="Add card to this subphase"
                                aria-label={`Add card to ${subphaseName}`}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex">
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
                                      <div className="flex flex-col gap-4">
                                        {/* Render dependency stacks */}
                                        {stacksForCell.map((stack) => (
                                          <CardStack
                                            key={stack[0].id}
                                            cards={stack.map(card => withBlockedState(card, subphase.id))}
                                            onCardClick={handleCardClick}
                                            onUnlockCard={handleUnlockCard}
                                            onUnlockTopCard={handleUnlockClick}
                                          />
                                        ))}
                                        {/* Render standalone cards */}
                                        {standaloneCards.map((card) => {
                                          const cardWithBlocked = withBlockedState(card, subphase.id);
                                          return (
                                            <Card
                                              key={card.id}
                                              card={cardWithBlocked}
                                              isDragging={activeCard?.id === card.id}
                                              onClick={handleCardClick}
                                              onUnlock={cardWithBlocked.isBlocked ? handleUnlockClick : undefined}
                                              tilt
                                            />
                                          );
                                        })}
                                      </div>
                                    ) : allBlocked ? (
                                      <div className="h-16 flex items-center justify-center border-[1.5px] border-dashed border-dash rounded-[14px]">
                                        <span className="text-xs text-muted">All cards blocked</span>
                                      </div>
                                    ) : (
                                      <div className="h-16 flex items-center justify-center border-[1.5px] border-divider rounded-[14px]">
                                        <span className="text-xs text-muted">No cards</span>
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
                                    <div className="flex flex-col gap-3">
                                      {cards.map((card) => (
                                        <Card
                                          key={card.id}
                                          card={{ ...card, isBlocked: false }}
                                          isDragging={activeCard?.id === card.id}
                                          onClick={handleCardClick}
                                          tilt
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="h-16 flex items-center justify-center border-[1.5px] border-divider rounded-[14px]">
                                      <span className="text-xs text-muted">No cards</span>
                                    </div>
                                  )}
                                </DroppableCell>
                              );
                            })}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty state for phase with no subphases */}
                    {!collapsedPhases[phase.id] && (!phase.subphases || phase.subphases.length === 0) && (
                      <div className="p-8 text-center text-muted">
                        No subphases in this phase
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted">
                  {boardDisplayData.completedCards.length > 0
                    ? 'All tasks complete!'
                    : 'No phases in this project'}
                  {/* With no active subphase there is no per-subphase "+" button,
                      so this is the only way to hand-add a card. Opens with no
                      destination chosen. */}
                  <div className="mt-4">
                    <button
                      onClick={() => handleOpenAddCard(null)}
                      className="px-4 py-2 rounded-lg bg-primary text-on-primary border-[1.5px] border-card-line shadow-card hover:brightness-110 text-sm font-medium transition"
                    >
                      + Add Card
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Done column - single aggregated cell */}
            <div className="w-[360px] flex-shrink-0 flex flex-col">
              {/* Done column header */}
              <div className={`sticky top-0 z-10 h-12 px-4 flex items-center justify-center bg-page ${INSET_RULE} after:left-0 after:right-6`}>
                <ColumnLabel name="Done" count={boardDisplayData.completedCards.length} />
              </div>

              {/* Done column content - one drop cell the height of the column,
                  so the pile can stick a third of the way down the board */}
              <DroppableCell
                id="done-column"
                isOver={dropTarget?.status === 'Done'}
                canDrop={true}
                isEmpty={boardDisplayData.completedCards.length === 0}
              >
                <CompletedStack
                  cards={boardDisplayData.completedCards}
                  onCardClick={handleCardClick}
                  pileStyle={{
                    position: 'sticky',
                    top: donePileTop,
                    marginTop: donePileTop - COLUMN_HEADER_PX - DONE_CELL_PADDING_PX,
                  }}
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

      {/* Edit Project Dialog */}
      <EditProjectDialog
        isOpen={isEditProjectOpen}
        project={project}
        onClose={() => setIsEditProjectOpen(false)}
        onSaved={() => loadProject(true)}
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
        phases={project?.phases || []}
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
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={handleCancelUnlock}
          />
          <div className="relative z-10 bg-panel border-[1.5px] border-line rounded-[20px] shadow-card p-6 max-w-md">
            <h3 className="text-lg font-bold text-ink mb-4">Unlock Card?</h3>
            <p className="text-muted mb-2">
              Are you sure you want to unlock <span className="font-semibold text-ink">"{confirmUnlockCard.title}"</span>?
            </p>
            <p className="text-muted mb-6 text-sm">
              This will remove all dependencies for this card. It will become immediately actionable.
            </p>
            {unlockError && (
              <div className="mb-4 p-3 rounded bg-panel border border-danger-text text-danger-text text-sm">
                {unlockError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-page border border-line text-ink hover:bg-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlock}
                disabled={isUnlocking}
                className="px-4 py-2 rounded bg-pal-marigold hover:brightness-95 text-card-ink border border-card-line font-semibold transition-colors disabled:opacity-50"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Export toast notification */}
      {exportCopied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-pal-mint text-card-ink text-sm font-semibold rounded-full shadow-card border-[1.5px] border-card-line flex items-center gap-2 transition-opacity duration-300">
          <Check className="w-4 h-4" />
          Project context copied to clipboard
        </div>
      )}
    </DndContext>
  );
};

export default Board;
