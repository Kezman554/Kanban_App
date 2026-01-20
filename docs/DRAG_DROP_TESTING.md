# Drag and Drop Testing Guide

## Overview
The Board component now supports drag and drop functionality using @dnd-kit/core. This allows cards to be moved between different status columns with database persistence.

## Features Implemented

### 1. Draggable Cards
- Each card has a drag handle (⋮⋮) on the left side
- Hover over the drag handle shows "Drag to move card" tooltip
- Cursor changes to grab/grabbing during drag operations
- Card becomes semi-transparent (50% opacity) while being dragged

### 2. Droppable Columns
- Each column cell (Not Started, In Progress, Done) is a drop zone
- Drop zones are organized by subphase and status

### 3. Ghost Preview
- A semi-transparent preview of the card follows the cursor during dragging
- Implemented using DragOverlay component

### 4. Database Updates
- When a card is dropped in a new status column, it updates the database
- The updateCardStatus IPC handler is called with the new status
- The board automatically reloads to reflect the updated status

### 5. Blocked Card Validation
- Cards with incomplete dependencies cannot be moved to "In Progress"
- A card is considered blocked if:
  - It has depends_on_cards array with values
  - Any of those dependency cards are not in "Done" status

### 6. Visual Feedback
- **Valid Drop**: Green ring (ring-green-500) + light green background
- **Invalid Drop**: Red ring (ring-red-500) + light red background
- Drop zones highlight when hovering with a card

### 7. Persistence
- All status changes are persisted to the SQLite database
- After dropping a card, the board reloads from the database
- Status persists across app restarts

## Testing Instructions

### Test 1: Basic Drag and Drop
1. Open the app and select "LOTR YouTube Channel" project
2. Find a card in "Not Started" column (e.g., Card M - "Session M: Brainstorm Channel Name")
3. Click and drag the ⋮⋮ handle
4. Drag over to "In Progress" column
5. Release the card
6. **Expected**: Card moves to In Progress, visual feedback shows, database updates

### Test 2: Valid Drop Visual Feedback
1. Start dragging any card from "Not Started"
2. Hover over "In Progress" column
3. **Expected**: Column shows green ring + green background tint

### Test 3: Invalid Drop - Blocked Cards
1. Find Card B "Session B: Manual Transcript Workflow" (depends on Card A)
2. Verify Card A is NOT in "Done" status
3. Try to drag Card B to "In Progress"
4. **Expected**: Column shows red ring + red background tint
5. Drop the card
6. **Expected**: Card does NOT move, stays in original position

### Test 4: Blocked Card Can Move to Done
1. Find a blocked card (e.g., Card B with dependencies)
2. Drag it to "Done" column
3. **Expected**: Shows green ring (allowed)
4. Drop the card
5. **Expected**: Card moves to Done successfully

### Test 5: Persistence After Refresh
1. Drag a card to a different status (e.g., Card M to "In Progress")
2. Close the Electron app completely
3. Reopen the app
4. Navigate to the LOTR project board
5. **Expected**: Card M is still in "In Progress" column

### Test 6: Ghost Preview
1. Start dragging any card
2. **Expected**: Semi-transparent copy of card follows cursor
3. **Expected**: Original card in board becomes 50% opacity

### Test 7: Click vs Drag
1. Click (without dragging) on a card
2. **Expected**: Card expands to show details (no drag initiated)
3. Click on the ⋮⋮ drag handle and move mouse >8px
4. **Expected**: Drag operation starts

### Test 8: Move Between Subphases
1. Note: Cards can only move between statuses, NOT between subphases
2. Drag a card from Subphase 1.1 "Not Started" to Subphase 1.2 "Not Started"
3. **Expected**: This should NOT work (cards stay in their subphase)
4. Drag the same card to a different status in the SAME subphase
5. **Expected**: This SHOULD work

## Known Behaviors

### Activation Threshold
- Drag requires 8px of mouse movement before activating
- This prevents accidental drags when clicking

### Status Column Mapping
- Cards can only be in one of three statuses: "Not Started", "In Progress", "Done"
- These are configurable per project in the database (project.columns field)

### Dependency Checking
- Dependencies are checked by session_letter (e.g., card depends on "A")
- All project cards are searched to find the dependency
- If ANY dependency is not "Done", card is considered blocked

## Manual Testing Checklist

- [ ] Cards have visible drag handles
- [ ] Drag handle shows grab cursor on hover
- [ ] Dragging creates ghost preview
- [ ] Original card becomes transparent during drag
- [ ] Valid drops show green visual feedback
- [ ] Invalid drops show red visual feedback
- [ ] Blocked cards cannot move to "In Progress"
- [ ] Blocked cards CAN move to other statuses
- [ ] Non-blocked cards can move freely
- [ ] Status updates persist in database
- [ ] Board reloads after successful drop
- [ ] Status persists after app restart
- [ ] Click (without drag) still expands card
- [ ] Drag works across all phases and subphases

## Console Verification

Open DevTools (F12) and check console for:
- "Cannot drop: card is blocked and target is In Progress" - when trying invalid drop
- No errors during successful drops
- Database update confirmation (if logging enabled)

## Database Verification

You can verify database updates directly:

```bash
cd data
sqlite3 kanban.db
SELECT id, session_letter, title, status FROM cards WHERE session_letter = 'M';
```

Change the status via drag and drop, then run the query again to confirm the update.
