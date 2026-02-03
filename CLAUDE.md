# CLAUDE.md - Kanban App Project
## What This Is

A desktop Kanban project management app for managing projects and tasks. Can be used for any project type - software development, content creation, personal projects, etc. Includes optional integration with Claude Code for AI-assisted development workflows.

*Differentiator:* It pulls the task cards and their pre written prompts from the project JSON, integrates with Claude Code and the Anthropic API to generate further contextual prompts and track progress across development projects.

## Tech Stack

•	Framework: Electron 28+
•	Frontend: React 18+ with Vite
•	Styling: Tailwind CSS
•	Database: SQLite via better-sqlite3
•	Drag & Drop: @dnd-kit/core
•	Future: xterm.js for embedded terminal

## Project Location
```
C:\Users\Nick\Desktop\KanbanBuild
```
Important: Do NOT move to OneDrive - causes path/sync issues.

## Port Configuration

- **Preferred port:** 8502 (configured in vite.config.js)
- **Note:** If 8502 is in use, Vite will auto-increment (8503, 8504, etc.)

## Database Schema

Main tables:
- **projects** - id, name, slug, description, prd_path, github_repo, directory_path, columns (JSON)
- **phases** - id, project_id, name, short_name, description, display_order
- **subphases** - id, phase_id, name, short_name, description, display_order
- **cards** - id, subphase_id, session_letter, title, description, success_criteria, resource, status, depends_on_cards (JSON), complexity, etc.
- **resources** - id, slug, name, is_available

## Project File Location Conventions

When a project has a `directory_path` set, the app uses these conventions to find related files:
- **PRD location:** `{directory_path}/docs/{prd_path}` where prd_path comes from project JSON
- **Progress file:** `{directory_path}/docs/progress.txt` (fixed location)
- **CLAUDE.md:** `{directory_path}/CLAUDE.md` (root level, not in docs)

## Key Design Decisions

1. **3D Stacked Board:** Cards stack within cells (subphase × status). Top card visible, others peek underneath.

2. **Card Types:**
   - Standard (claude_sub) - Claude Code work
   - Manual (none) - Human tasks
   - API (anthropic_api) - Uses API credits
   - TBC (tbc) - Approach not yet decided

3. **Dependencies:** Cards can depend on specific cards, entire subphases, or entire phases.

4. **Resource Tracking:** Each card tagged with what it consumes (subscription tokens vs API credits vs manual).

5. **Progress Tracking:** progress.json updated after each Claude Code session to track what's actually built.

## Environment Variables

Required in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Running the App

```bash
cd C:\Users\Nick\Desktop\KanbanBuild
npm run dev
```

## Common Issues

### Blank window on launch
- Check DevTools Console for errors
- Usually a Vite/Tailwind configuration issue
- Ensure you're in the project root, not a subfolder

### Port already in use
- Previous instance didn't close cleanly
- Run: `taskkill /F /IM node.exe` and `taskkill /F /IM electron.exe`
- Then restart with `npm run dev`

### "Cannot find module" errors
- Check import paths are correct (especially after file moves)
- Run `npm install` to ensure dependencies are present

### Tailwind classes not working
- Tailwind v4 uses different PostCSS config than v3
- Check postcss.config.js and tailwind.config.js are compatible

## Test Data

The app includes LOTR YouTube Channel project as test data (imported from `docs/lotr-youtube_kanban.json`). This is Nick's real project used for testing - don't modify it carelessly once Claude Code integration is built.
## Related Documents
- **KANBAN_APP_DESIGN_SUMMARY.md** - Full design specification
- **KANBAN_APP_BUILD_GUIDE_v2.pdf** - Step-by-step build guide with session prompts
- **lotr-youtube_kanban.json** - Example kanban JSON structure
## Git Repository
```
https://github.com/Kezman554/Kanban_App.git
```
Do not push to GitHub unless explicitly asked. Wait for manual testing and approval. Nick will manually push git commits in most cases
## Terminal error
Embedded terminal disabled - node-pty won't compile with VS Build Tools 2026 (folder naming issue). Revisit when node-gyp updates.

