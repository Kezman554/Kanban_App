import React from 'react';
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
      title: 'Session E: Decide on Terminal Integration Approach',
      description: 'Need to decide between xterm.js, node-pty, or another terminal emulation library.',
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
      title: 'Session F: Implement API Integration',
      description: 'Integrate with Anthropic API for prompt generation and Claude Code launching.',
      success_criteria: 'API calls work correctly with proper error handling',
      resource: 'anthropic_api',
      status: 'Not Started',
      depends_on_cards: ['C', 'D'],
      complexity: 'high',
      is_placeholder: false,
      likely_needs_expansion: true,
      isBlocked: true,
      blockedReason: 'Waiting on cards: C, D',
      prompt_guide: 'Set up Anthropic API client and implement prompt generation...',
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
        <p className="text-dark-text-secondary">
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
      <div className="mt-8 p-4 bg-dark-surface rounded-lg border border-dark-border">
        <h2 className="text-xl font-bold mb-4">Legend</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Status Colors</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="text-gray-300">Not Started</span> - Gray badge</li>
              <li>• <span className="text-blue-300">In Progress</span> - Blue border & badge</li>
              <li>• <span className="text-green-300">Done</span> - Checkmark, muted, green badge</li>
              <li>• <span className="text-red-300">Blocked</span> - Lock icon, greyed out, red badge</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Resource Icons</h3>
            <ul className="space-y-1 text-sm">
              <li>🤖 Claude Subscription</li>
              <li>🔧 Anthropic API</li>
              <li>✋ Manual Task (no AI needed)</li>
              <li>❓ To Be Confirmed (approach uncertain)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Complexity Levels</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="text-green-300">Low</span> - Simple task</li>
              <li>• <span className="text-yellow-300">Medium</span> - Moderate complexity</li>
              <li>• <span className="text-red-300">High</span> - Complex, may need breakdown</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-dark-text-secondary mb-2">Special Indicators</h3>
            <ul className="space-y-1 text-sm">
              <li>• <span className="text-purple-300">Manual</span> - Human-only task</li>
              <li>• <span className="text-orange-300">TBC</span> - Dashed border, needs decision</li>
              <li>• <span className="text-yellow-300">Placeholder</span> - Will be expanded later</li>
              <li>• <span className="text-indigo-300">May Expand</span> - Likely needs sub-tasks</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CardTestPage;
