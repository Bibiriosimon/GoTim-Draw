# GOTIM DRAWER Upgrade TODO

This file tracks the staged upgrade from demo canvas to practical agent-controlled visual workspace.

## Stage 1: Control Loop Foundation

Goal: make the canvas observable and recoverable so an agent can safely continue, adjust, or undo work.

- [x] Expose canvas state from the browser to the control server.
- [x] Add `GET /api/canvas/shapes` for agent-readable shape summaries.
- [x] Add `GET /api/canvas/bounds` for current page bounds.
- [x] Add `POST /api/canvas/snapshot` for the active browser client.
- [x] Add `undo` and `redo` commands.
- [x] Add `deleteShape` command.
- [x] Add `updateShape` command for safe top-level position/props updates.
- [x] Update `/api/capabilities` so agents discover the new commands and endpoints.
- [x] Verify with `npm run build`.

Acceptance:

- Agent can query existing shapes before drawing.
- Agent can remove or update one shape by id.
- Agent can undo/redo the latest tldraw history step.
- Build passes.

## Stage 2: Practical Layout Engine

Goal: reduce overlap by letting agents describe intent and letting the app place shapes.

- [x] Add `layout` command with `horizontal`, `vertical`, and `grid` modes.
- [x] Support `gapX`, `gapY`, `origin`, and item sizing defaults.
- [x] Add collision warnings based on current canvas snapshot.
- [x] Add a `flowchart` template that produces nodes and connectors from structured data.
- [x] Add a `vertical_calculation` or `grid_layout` template for math layout.

Acceptance:

- Agent can create common diagrams without hand-calculating every coordinate.
- Layout output avoids existing canvas bounds unless explicitly replacing content.

## Stage 3: Command Lifecycle and Audit Trail

Goal: make agent actions transparent and debuggable for real use.

- [x] Keep a server-side command log with ids, timestamps, delivery count, and status.
- [x] Add frontend command acknowledgements after execution.
- [x] Add `GET /api/commands/history`.
- [x] Add a right-side "Command History" view with retry/delete/inspect affordances.
- [x] Group commands in named batches.

Acceptance:

- User can see what the agent did.
- Agent can tell whether a command was delivered and executed.

## Stage 4: Real Agent Input

Goal: turn the right panel from demo prompts into a real natural-language workflow.

- [x] Replace hardcoded prompt handling with a planning API.
- [x] Show generated command plan before applying destructive operations.
- [x] Add "append to canvas" vs "replace canvas" choice.
- [x] Add prompt presets for lesson, diagram, presentation, and review.

Acceptance:

- User input affects generated canvas content.
- Destructive actions require confirmation or explicit user instruction.

## Stage 5: Production Hardening

Goal: prepare for real deployment and repeated sessions.

- [ ] Persist canvas sessions.
- [ ] Support multiple clients/sessions instead of one global canvas snapshot.
- [ ] Add request validation for all command payloads.
- [ ] Add rate limits and max payload sizes per command type.
- [ ] Add import/export for command batches and canvas snapshots.
- [ ] Add smoke tests for API endpoints and command execution.

Acceptance:

- Multiple sessions do not overwrite each other.
- Invalid commands fail early with useful error messages.
