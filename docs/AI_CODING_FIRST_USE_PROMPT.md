# AI Coding First-Use Prompt For GOTIM DRAWER

Copy this prompt to another coding agent when it needs to use the canvas for the first time:

```text
Use GOTIM DRAWER to complete this visual task. Before doing anything, read:
http://localhost:5173/agent.md

Then check http://localhost:8787/api/health, read /api/capabilities, and use /api/commands/batch to send replayable canvas commands. Do not manipulate DOM or tldraw store directly. Do not clear the canvas unless I explicitly ask you to replace it.
```

For a problem-review task, add:

```text
Build a teacher-style visual explanation: original problem, highlighted conditions, clean reconstructed diagram, formula derivation, plot or check area, and final answer. Use Python only to compute accurate plot points, extrema, intersections, or coordinates; convert the result into editable canvas commands.
```

For a board-game task, add:

```text
If this is a new game, first search or confirm the rules, then implement a minimal rule engine, define board state and legal moves, add a visual board UI, and use the canvas for move explanation. Existing Gomoku mode is the reference implementation.
```

## Why This Works

The canvas is self-describing:

- `/agent.md` is the compact operating manual.
- `/help.html` is the human-readable product guide.
- `/api/capabilities` is the machine-readable skill manifest.
- `/api/canvas/shapes` is the current editable canvas snapshot.

This makes GOTIM DRAWER usable by an AI coding agent without extra context from the user.

