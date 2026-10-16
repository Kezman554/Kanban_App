import React from 'react';
import { Bot, Wrench, Hand, CircleHelp } from '../components/icons';
import Card from '../components/Card';

function CardTestPage() {
  // Sample cards showcasing all states and features
  const sampleCards = [
    {
      id: 1,
      session_letter: 'A',
      title: 'Session A: Initialize Repository',
      description: 'Set up the project repository with initial structure, README, and configuration files.',
      success_criteria: 'Repository exists on GitHub with correct structure and initial commit',
      resource: 'claude_sub',
      status: 'Done',
      depends_on_cards: [],
      complexity: 'low',
      is_placeholder: false,
      likely_needs_expansion: false,
      prompt_guide: 'Initialize a new project repository with standard structure...',
      checkpoint: 'Verify repository is accessible and has initial files',
      completed_at: '2026-01-19T10:30:00Z'
    },
    {
      id: 2,
      session_letter: 'B',
      title: 'Session B: Setup Database Schema',
      description: 'Create SQLite database schema with all required tables and relationships.',
      success_criteria: 'Database tables created with proper foreign keys and indexes',
      resource: 'claude_sub',
      status: 'In Progress',
      depends_on_cards: ['A'],
      complexity: 'medium',
      is_placeholder: false,
      likely_needs_expansion: false,
      prompt_guide: 'Create database schema using better-sqlite3...',
      checkpoint: 'Run tests to verify all tables exist'
    },
    {
      id: 3,
      session_letter: 'C',
      title: 'Session C: Build Main UI Components',
      description: 'Create the core UI components including kanban board, cards, and drag-and-drop functionality.',
      success_criteria: 'UI renders correctly and is interactive',
      resource: 'claude_sub',
      status: 'Not Started',
      depends_on_cards: ['A', 'B'],
      complexity: 'high',
      is_placeholder: false,
      likely_needs_expansion: true,
      prompt_guide: 'Build React components for the kanban board...',
      checkpoint: 'Manually test UI interactions'
    },
    {
      id: 4,
      session_letter: 'D',
      title: 'Session D: Manual Research Phase',
      description: 'Research best practices for project management workflows and gather user requirements.',
      success_criteria: 'Document created with research findings and user stories',
      resource: 'none',
      status: 'Not Started',
      depends_on_cards: [],
      complexity: 'low',
      is_placeholder: false,
      likely_needs_expansion: false,
      checkpoint: 'Review research document for completeness'
    },
    {
      id: 5,
      session_letter: 'E',
      title: 'Session E: Decide on Hosting Approach',
      description: 'Need to decide between a static host, a container on the Pi, or a managed platform.',
      success_criteria: 'Decision made and documented with rationale',
      resource: 'tbc',
      status: 'Not Started',
      depends_on_cards: [],
      complexity: 'medium',
      is_placeholder: true,
      likely_needs_expansion: false,
      checkpoint: 'Decision document approved'
    },
    {
      id: 6,
      session_letter: 'F',
      title: 'Session F: Summarise Session Logs',
      description: 'Use the Anthropic API to summarise each session log into a short changelog entry.',
      success_criteria: 'API calls work correctly with proper error handling',
      resource: 'anthropic_api',
      status: 'Not Started',
      depends_on_cards: ['C', 'D'],
      complexity: 'high',
      is_placeholder: false,
      likely_needs_expansion: true,
      isBlocked: true,
      blockedReason: 'Waiting on cards: C, D',
      prompt_guide: 'Set up an Anthropic API client and summarise each log file...',
      checkpoint: 'Test API calls with sample data'
    },
    {
      id: 7,
      session_letter: 'G',
      title: 'Session G: Write Comprehensive Tests',
      description: 'Create unit tests, integration tests, and end-to-end tests for all components.',
      success_criteria: 'All tests pass with >80% code coverage',
      resource: 'claude_sub',
      status: 'Not Started',
      depends_on_cards: ['C', 'F'],
      complexity: 'medium',
      is_placeholder: false,
      likely_needs_expansion: false,
      isBlocked: true,
      blockedReason: 'Waiting on cards: C, F',
      checkpoint: 'npm test passes without errors'
    },
    {
      id: 8,
      session_letter: 'AA',
      title: 'Session AA: Polish and Optimize',
      description: 'Final polish pass: optimize performance, improve UX, fix edge cases.',
      success_criteria: 'App feels snappy and handles edge cases gracefully',
      resource: 'claude_sub',
      status: 'Not Started',
      depends_on_cards: ['G'],
      complexity: 'low',
      is_placeholder: false,
      likely_needs_expansion: false,
      isBlocked: true,
      blockedReason: 'Waiting on card: G'
    }
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Card Component Test View</h1>
        <p className="text-muted">
          Showcasing all card states and features
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sampleCards.map((card) => (
          <Card
            key={card.id}
            card={card}
            onClick={(card) => console.log('Card clicked:', card)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 p-4 bg-panel rounded-[14px] border-[1.5px] border-line">
        <h2 className="text-xl font-bold mb-4">Legend</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-muted mb-2">Card States</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="font-semibold">Ready</span> - Coloured: its palette colour comes from the card id</li>
              <li>• <span className="font-semibold">In Progress</span> - Coloured, in the In Progress column</li>
              <li>• <span className="font-semibold">Done</span> - Panel colour with a green tick</li>
              <li>• <span className="font-semibold">Blocked</span> - Never coloured: dashed, lock, "waits on X"</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted mb-2">Resource Icons</h3>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2"><Bot className="w-4 h-4" /> Claude Subscription</li>
              <li className="flex items-center gap-2"><Wrench className="w-4 h-4" /> Anthropic API</li>
              <li className="flex items-center gap-2"><Hand className="w-4 h-4" /> Manual Task (no AI needed)</li>
              <li className="flex items-center gap-2"><CircleHelp className="w-4 h-4" /> To Be Confirmed (approach uncertain)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted mb-2">Complexity Levels</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="font-semibold">Low</span> - Simple task (chip shown)</li>
              <li>• <span className="font-semibold">Medium</span> - Moderate complexity (no chip)</li>
              <li>• <span className="font-semibold">High</span> - Complex, may need breakdown (chip shown)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted mb-2">Special Indicators</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="font-semibold">Manual</span> - Human-only task</li>
              <li>• <span className="font-semibold">TBC</span> - Approach not decided yet</li>
              <li>• <span className="font-semibold">Placeholder</span> - Will be expanded later</li>
              <li>• <span className="font-semibold">May Expand</span> - Likely needs sub-tasks</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CardTestPage;
