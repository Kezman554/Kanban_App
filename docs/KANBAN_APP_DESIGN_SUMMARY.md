# Kanban Project Management App - Design Summary

## Overview

A visual project management application designed to orchestrate Claude Code sessions. It serves as a command centre for breaking projects into tasks, tracking dependencies, launching Claude Code with contextual prompts, and managing work across multiple projects.

**Key differentiator:** Not just a task board — it integrates directly with Claude Code, generating contextual prompts and launching terminal sessions from cards.

---

## Core Concepts

### Projects
A project is a complete body of work with a defined goal (e.g., "Launch LOTR YouTube Channel", "Build Kanban App").

Each project has:
- Name, description, slug
- GitHub repository reference
- PRD document
- Phases containing the work breakdown
- Progress tracking file

### Phases
Major milestones within a project. Ordered by priority, not strict dependency.

Examples: Foundation, Core Features, Polish, Launch, Post-Launch

### Subphases
Logical groupings within a phase (1.1, 1.2, 1.3, etc.). Each subphase becomes a **row** on the kanban board.

### Cards (Sessions)
The atomic unit of work. Each card represents roughly one Claude Code context window (1-2 hours of work).

Cards are lettered sequentially across the project: A, B, C... Z, AA, AB...

---

## Visual Layout

### The 3D Stacked Board

```
         NOT STARTED              IN PROGRESS              DONE
         
1.1      [Card C]                 [Card B]                 [Card A ✓]
         [Card D] ← stack
         [Card E]
         
1.2      [Card F]                                          
         [Card G]
         
2.1      [Card H] 🔒                                       
         blocked
```

- **Rows** = Subphases (single project) or Projects (all projects view)
- **Columns** = Status (default: Not Started, In Progress, Done — customizable)
- **Stacks** = Cards queue within each cell, top card visible
- Moving a card reveals the next one underneath

### View Modes

1. **Single Project** — One project, subphases as rows
2. **Selected Projects** — Pick 2-3 projects, each as a row
3. **All Projects** — Every project as a row, see top actionable card per project

### Roadmap View

Toggle to see the traditional markdown roadmap format with live progress:
- Checkboxes reflect actual card status
- Current card highlighted
- Phase progress auto-calculated

---

## Card Types

### Standard Card
Clear task, known approach. Has prompt generated when activated.

### Manual Card (`resource: "none"`)
Human-only tasks: research, sign-ups, creative work, decisions.
- Shown with distinct styling (e.g., ✋ icon)
- Contains step-by-step guidance instead of Claude Code prompt
- Critical for not forgetting prep steps

### TBC/Placeholder Card (`resource: "tbc"`)
Approach uncertain, decision pending.
- Shows what decision is needed
- Lists options being considered
- "Expand & Plan" button to break down once decided

### Complex Card
Known approach but likely needs expansion.
- Flagged with `complexity: "high"` and `likely_needs_expansion: true`
- Shows expansion hints
- "Review before starting" prompt

---

## Card Data Structure

```json
{
  "id": "card-a",
  "session_letter": "A",
  "title": "Session A: Initialize Repository",
  "description": "Set up project foundation...",
  "success_criteria": "Repo exists on GitHub with correct structure",
  "resource": "claude_sub | anthropic_api | none | tbc",
  "status": "Not Started | In Progress | Done",
  
  "depends_on_cards": ["B", "C"],
  "depends_on_subphase": "subphase-1-1",
  "depends_on_phase": 1,
  
  "is_placeholder": false,
  "decision_needed": null,
  "options_considered": [],
  
  "complexity": "low | medium | high",
  "likely_needs_expansion": false,
  "expansion_hints": [],
  "review_before_starting": false,
  
  "parent_card_id": null,
  "is_expanded": false,
  
  "prompt_guide": null,
  "checkpoint": null,
  "git_commit_message": null,
  
  "completed_at": null
}
```

---

## Dependencies

Cards can depend on:
1. **Specific cards** — `depends_on_cards: ["A", "B"]`
2. **Entire subphase** — `depends_on_subphase: "subphase-1-1"` (all cards must be Done)
3. **Entire phase** — `depends_on_phase: 1` (all cards must be Done)

**Blocked cards:**
- Shown with lock icon 🔒
- Display what they're waiting on
- Unclickable until dependencies clear

**Workable cards:**
- Status = "Not Started" AND not blocked
- Highlighted as available for work

---

## Resource Filtering

Each card tagged with what it consumes:
- `claude_sub` — Claude subscription tokens (Code, Desktop chat)
- `anthropic_api` — Your API credits
- `none` — No AI needed

**Filter toggle:** "Show tasks I can do without Claude subscription"

When tokens depleted, instantly see what's still workable across all projects.

---

## Card Interaction Flow

### 1. Click Card
Card expands to show:
- **Explainer** — What this achieves and why
- **Prompt** — Generated Claude Code prompt (if not TBC/manual)
- **Checkpoint** — How to verify completion
- Buttons: Copy Prompt, Edit, Start

### 2. Generate Prompt (if needed)
If `prompt_guide` is null, calls the Prompt Generator skill via API:
- Reads card data, PRD, progress.json
- Identifies relevant docs from what's been built
- Generates contextual prompt with:
  - Doc references
  - Context from previous sessions
  - Implementation instructions
  - Testing requirements
  - Commit message
  - Progress update instructions

### 3. Review/Edit
You can edit the prompt before starting.

### 4. Click Start
- Card moves to "In Progress"
- Embedded terminal opens within the card
- Claude Code launches with the prompt

### 5. Work
- Claude Code runs in the embedded terminal (xterm.js)
- You can interact with it normally
- Multiple cards can run simultaneously (multiple terminals)

### 6. Complete
- Claude Code commits and exits
- Updates progress.json with what was built
- App detects process ended
- Prompt: "Mark as Done?"
- Card moves to Done, reveals next in stack

---

## Auto-Pilot Mode

Toggle on → app chains through cards automatically.

**Logic:**
1. Card completes → mark Done → find next workable card
2. Priority: same subphase → same phase → other phases
3. Skip manual cards (need human)
4. Skip cards requiring depleted resources

**Stops when:**
- Token limit hit (Claude Code exits with rate limit)
- Manual card reached
- Dependency blocked
- No more workable cards

You return, review what completed, resume when ready.

---

## Embedded Terminal

Each "In Progress" card has its own terminal panel (xterm.js).

- Full terminal emulation — Claude Code runs natively
- No output parsing needed
- You interact normally (approve commands, answer questions)
- Process exit detected → prompt to mark done

**Why not full Claude Code wrapper?**
- Simpler implementation
- No need to parse terminal formatting
- Maintains approval flow
- Works with Claude Code as-is

---

## Card Expansion (Mini-Kanban)

Any card can be expanded into its own sub-board:

1. Click "Expand" on a card
2. Describe how to break it down (or let skill generate)
3. Card becomes a container with sub-cards
4. Sub-cards have their own statuses
5. Parent card shows progress: "3/6 complete"
6. When all sub-cards Done, parent auto-completes

Useful for:
- TBC cards once decision is made
- Complex cards that grew bigger than expected
- Mid-project pivots requiring replanning

---

## Progress Tracking (progress.json)

Lives in project root. Updated after each Claude Code session.

```json
{
  "project": "kanban-app",
  "last_updated": "2025-01-17T20:00:00Z",
  "completed_sessions": [
    {
      "session": "A",
      "title": "Initialize Repository",
      "completed_at": "2025-01-15T14:30:00Z",
      "commit_hash": "abc123f",
      "files_created": ["src/main.js", "package.json"],
      "files_modified": [],
      "docs_created": [],
      "notes": "Used Electron 28 with React 18"
    }
  ],
  "current_structure": {
    "docs": ["DATA_MODEL.md"],
    "src": ["main.js", "database/schema.js"]
  }
}
```

**Used by Prompt Generator to:**
- See what's been built (not just planned)
- Identify relevant docs to reference
- Build context from previous sessions
- Adapt to actual project state vs plan

---

## Skills Integration

### Skill 1: Project Kickoff (`kanban-project-kickoff.skill`)

**Triggers:** "break down this project", "create a roadmap"

**Process:**
1. Clarify project goals
2. Ask for GitHub repo name
3. Ask which APIs needed
4. Identify uncertain areas (TBC items)
5. Generate PRD
6. Break into phases → subphases → cards
7. Flag complex cards, create manual step cards
8. Output: PRD.md, kanban.json, progress.json

**Key behaviours:**
- Thinks hard about granularity
- Creates explicit manual cards (don't forget prep steps)
- Marks uncertain items as TBC
- Flags cards likely needing expansion

### Skill 2: Prompt Generator (`kanban-prompt-generator.skill`)

**Triggers:** Called by kanban app when card activated

**Input:**
- Card data
- PRD document
- progress.json

**Process:**
1. Read progress.json to see what exists
2. Match card keywords to available docs
3. Identify relevant previous work
4. Generate prompt with:
   - Doc references
   - Context from previous sessions
   - Implementation steps
   - Testing instructions
   - Commit message
   - Progress update instructions
   - Checkpoint

**Output:** Complete Claude Code prompt ready to run

---

## Project Setup Flow

### New Project

1. Discuss project in Claude Desktop
2. Invoke kickoff skill: "Break this down for my kanban"
3. Answer clarifying questions (repo name, APIs, uncertain areas)
4. Receive: PRD.md, kanban.json, progress.json
5. Import into kanban app
6. Start working through cards

### Existing Project (Import)

1. Create kanban.json with current state
2. Mark completed cards as Done with timestamps
3. Initialize progress.json with what's been built
4. Import into kanban app
5. Continue from current position

---

## File Structure

### Per Project

```
project-folder/
├── project-name_PRD.md
├── project-name_kanban.json    # Import into app
├── project-name_progress.json  # Updated by Claude Code
├── .env.example
├── .env                        # Not committed
├── .gitignore
├── docs/
│   ├── DATA_MODEL.md
│   ├── PIPELINE.md
│   └── ...
└── src/
    └── ...
```

### Kanban App

```
kanban-app/
├── src/
│   ├── main.js              # Electron main
│   ├── renderer/
│   │   ├── App.jsx          # React app
│   │   ├── components/
│   │   │   ├── Board.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Stack.jsx
│   │   │   ├── Terminal.jsx # xterm.js wrapper
│   │   │   └── ...
│   │   └── pages/
│   │       ├── ProjectView.jsx
│   │       ├── AllProjectsView.jsx
│   │       └── RoadmapView.jsx
│   └── database/
│       └── schema.js        # SQLite for app data
├── package.json
└── ...
```

---

## Tech Stack (Recommended)

- **Framework:** Electron + React
- **Terminal:** xterm.js
- **Database:** SQLite (via better-sqlite3)
- **Styling:** Tailwind CSS
- **State:** React Context or Zustand

**Why Electron:**
- Full system access (spawn processes)
- Cross-platform
- Familiar web tech (React)
- Mature ecosystem

**Alternatives:**
- Tauri + React (lighter, Rust backend)
- Python + PyQt (if staying in Python ecosystem)

---

## API Integration

### Prompt Generation

```javascript
// When card is activated and needs prompt generated
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2024-01-01'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: promptGeneratorSkillInstructions,
    messages: [{
      role: 'user',
      content: `Generate prompt for this card:\n${JSON.stringify(cardData)}\n\nPRD:\n${prdContent}\n\nProgress:\n${JSON.stringify(progressJson)}`
    }]
  })
});
```

**Estimated cost:** ~$0.015-0.02 per card (Sonnet)

---

## Future Considerations

### Alfred Integration
- External read/write to kanban data
- Alfred could suggest next tasks
- Voice-triggered card actions

### Additional Features (Post-MVP)
- Time tracking per card
- Analytics dashboard
- Template projects
- Team collaboration (shared boards)
- GitHub integration (auto-detect commits)

---

## MVP Scope

For first working version, focus on:

1. ✅ Single project view with stacks
2. ✅ Card states and dependencies
3. ✅ Embedded terminal per card
4. ✅ Prompt generation via API
5. ✅ Manual card support
6. ✅ Progress.json updates

Defer:
- All projects view
- Auto-pilot mode
- Card expansion (mini-kanban)
- Roadmap view
- Resource filtering

These can be added incrementally after core works.

---

## Summary

The kanban app bridges planning and execution:

1. **Plan** with kickoff skill → structured breakdown
2. **Visualise** with 3D stacked board → see what's workable
3. **Execute** with embedded terminals → Claude Code in context
4. **Track** with progress.json → reality, not just plans
5. **Adapt** with card expansion → flexibility for changes

It's project management designed for how you actually work with Claude Code.
