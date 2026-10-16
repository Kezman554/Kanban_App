# CLAUDE.md - Kanban App Project
## What This Is

A desktop Kanban project management app for managing projects and tasks. Can be used for any project type - software development, content creation, personal projects, etc. Includes optional integration with Claude Code for AI-assisted development workflows.

*Differentiator:* It pulls the task cards and their pre-written prompts from the project JSON, hands each prompt to a Claude Code session (Start Session copies it and moves the card to In Progress), and tracks progress across development projects. Cards are authored outside the app; there is no in-app AI generation.

## Tech Stack

•	Framework: Electron 28+
•	Frontend: React 18+ with Vite
•	Styling: Tailwind CSS
•	Database: SQLite via better-sqlite3
•	Drag & Drop: @dnd-kit/core

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

## Running the App

```bash
cd C:\Users\Nick\Desktop\KanbanBuild
npm run dev
```

## Windows shell note

Never redirect with `> nul` in PowerShell — `nul` is a reserved device name on Windows but PowerShell treats it as a literal filename, so the redirect creates a junk file in the working directory. Use `| Out-Null` (or `2>&1 | Out-Null` to also swallow stderr) in PowerShell, or `> /dev/null` only inside a true bash context.

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
- **Commit locally, frequently and without asking:** commit after each completed piece of work (a feature, a fix, a data repair script, a docs update) rather than accumulating one big diff at the end of a session.
- **Never push to GitHub without Nick's explicit permission** — ask each time; permission for one push does not carry over to the next.

## Progress Log

After completing any significant task (feature, bug fix, investigation with findings, data repair), append a session entry to `docs/progress.txt` without being asked. Follow the existing format (`Session Progress - YYYY-MM-DD` header, numbered sections, "Known gaps / followups"). Date entries by the day the work happened. Small tweaks don't need an entry.
## Design

Tokens live in one block at the top of `src/renderer/index.css` (`@theme static` for light, `:root[data-theme="dark"]` for dark). The rules the code can't enforce:

- **No black anywhere.** Darkest colour is brown (`#3A2F22` ink, `rgba(18,12,6,…)` for dark shadows and dim). Tailwind's stock shadows are cleared because they are black-based.
- **Colour means "can be picked up".** A blocked card is never coloured: dashed `border-dash`, `bg-blocked`, lock, letter, "waits on X". The same goes for blocked rows, blocked roadmap chips, the blocked card's header band and unmet dependency rows.
- **Card colour comes from the id and is never stored:** `paletteFor(card.id)` (`utils/palette.js`), worked out wherever a card is drawn. Subphase badges use `paletteFor(subphase.id)` and project dots `paletteFor(project.id)`.
- **The theme choice lives in the browser** (`localStorage` key `kanban-theme`, `utils/theme.js`), never in the database or exports. Each browser picks its own.
- **Danger is shown by wording and outline, never by colour alone.** Buttons say what they do ("Delete card E", "Sync failed"); error boxes are an outline plus words on a plain panel. The delete confirmation button may be `bg-danger` with cream text.
- **No hex or rgb() outside the token block, and no stock Tailwind colours** (the stock palette is cleared). Palette colours used from inline styles are written as `var(--color-pal-…)`.
- **Fredoka only**, bundled with `@fontsource/fredoka` (400–700); every font family resolves to it. Icons are Lucide via `components/icons.jsx` (aria-hidden; the label goes on the button).
- **Nothing about the look touches the database**: no schema, export or vault-summary change for visual work.
- Contrast: text at least 4.5:1 and non-text at least 3:1 in both modes. Coloured text on a translucent tint fails in dark mode, so message boxes use a plain panel. Teal `#22707B` is under 3:1 on the dark page, so outlines and focus borders use `active-ring` (aqua in dark).
- Tailwind bakes a literal shadow colour into the utility, so shadow colours go through per-mode variables (`--shadow-card-tint`, `--recess-tint`).
- **App icon:** `public/favicon.svg` is the single source (four palette tiles with a thick ink outline; the 5-unit stroke keeps it readable at 16px, so don't thin it). `npm run icons` regenerates `favicon-32.png`, `apple-touch-icon.png` and the desktop window icon `assets/app-icon.png` from it. Vite's `publicDir` is the top-level `public/`, so the icon's hex stays out of `src/renderer`.

## Removed features
In-app AI prompt generation (and its API-key settings) and the embedded terminal (node-pty / xterm) were removed on 2026-10-12. The app reads no `.env`.

