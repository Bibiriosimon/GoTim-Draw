# GOTIM DRAWER Agent Skill

Read this page first when Claude Code, Codex, Cursor Agent, or another coding agent needs to use the canvas.

GOTIM DRAWER is an editable tldraw-based visual workspace controlled through HTTP JSON commands. Do not manipulate the browser DOM or tldraw store directly.

## First-Use Checklist

1. Ask the user to open `http://localhost:5173/`.
2. Check `GET http://localhost:8787/api/health`.
3. Continue only when `ok=true` and `clients >= 1`.
4. Read `GET http://localhost:8787/api/capabilities`.
5. If continuing an existing drawing, read `GET http://localhost:8787/api/canvas/shapes`.
6. Plan the layout before sending commands.
7. If this task should not mix with the current canvas, make the first batch command `{"type":"createSession","mode":"lesson","title":"..."}`.
8. Use `createFormula` for math/physics expressions instead of raw `createText`.
9. Send commands with `POST http://localhost:8787/api/commands/batch`.
10. End with `{"type":"zoomToFit"}`.
11. Do not use `clear` inside an existing session unless the user wants to replace that session.

## Modes

- `lesson`: problem review, teaching, formulas, diagrams, step-by-step board writing.
- `brainstorm`: native drawing, illustration, visual ideation, staged sketching.
- `chess`: board games, Gomoku, strategy explanation, game UI experiments.
- `presentation`: structured visual explanation and slide-like playback.

## Waiting And Draft Behavior

The app can show temporary working UI while a plan is being generated.

- Temporary thinking cards are only placeholders.
- They should describe safe product states such as "reading problem", "planning layout", "plotting curve", or "checking overlap".
- They must be removed before final drawing commands are applied.
- Final work should be replayable with `step`, `stepTitle`, and optional `delay`.
- The front-end composer can execute simple natural-language canvas commands directly. For example, "draw a rotating ball" maps to `createAnimatedBall`.

## Problem Review Skill

Use this when the user asks for homework help, problem correction, physics, math, diagram explanation, or image-based tutoring.

Preferred visual structure:

1. Put the original problem image or text on the left/top.
2. Mark known quantities with highlights and arrows.
3. Redraw the clean core diagram using editable shapes.
4. Put formulas and reasoning on the right.
5. Put final answer and checks at the bottom.

For math/physics plots, Python may be used as a calculation helper:

1. Prefer `createPythonPlot` when the user needs a real function graph, physics curve, extrema plot, or comparison plot.
2. Use Python/SymPy/NumPy/Matplotlib to compute coordinates, samples, extrema, or reference values.
3. If the plot must stay fully editable, convert computed points into `createLine`, `createDraw`, `createText`, and `createArrow`.
4. For teaching, the best layout is often both: one independent Python plot panel for accuracy, plus a simplified editable sketch for annotations.

Example workflow for a charged-ring electric field:

```text
parse problem
derive E(x)=kQx/(x^2+R^2)^(3/2)
use Python to sample E(x) and locate max x=R/sqrt(2)
send createPythonPlot for the accurate curve
draw ring, axis, point P, formula block, simplified editable curve, max marker
finish with zoomToFit
```

Recommended command for a Python plot panel:

```json
{
  "type": "createPythonPlot",
  "title": "E(x) curve",
  "expression": "x/(x^2+1)^(3/2)",
  "xMin": 0,
  "xMax": 3.5,
  "samples": 500,
  "xLabel": "x/R",
  "yLabel": "normalized E",
  "x": 760,
  "y": 140,
  "w": 560,
  "h": 380,
  "notes": "Independent Python plot area for the physics curve."
}
```

## Formula Text Rules

Tldraw text is not LaTeX. Do not write final visible math as raw `sqrt(...)`, `x^2`, `R^3`, or a long one-line derivation in a normal text box.

Use `createFormula` for math and physics expressions:

```json
{"type":"createFormula","x":80,"y":120,"text":"v_1 = sqrt(GM/R)","color":"black","size":"l"}
{"type":"createFormula","x":80,"y":172,"text":"M/R^3 same -> GM/R = G*(M/R^3)*R^2","color":"green","size":"m"}
```

The canvas normalizes common forms into readable text, for example `sqrt(` to `√(`, `^2` to `²`, `^3` to `³`, `_1` to `₁`, `->` to `→`, and `*` to `×`.

Best practice:

1. Split derivations into several short formula lines.
2. Put explanatory Chinese text in `createText` or `createNote`.
3. Use `createFormula` for each mathematical line.
4. For graphs, compute sample points with Python/NumPy/SymPy when useful, then draw editable curves with `createLine` or `createDraw`.

## Native Drawing Skill

Use this when the user asks to draw a creature, object, scene, mascot, diagram, or visual idea.

Recommended stages:

1. Big silhouette.
2. Local parts.
3. Decoration.
4. Outline.
5. Shadow and highlight.
6. Final framing.

Use editable `createDraw`, `createGeo`, `createLine`, `createText`, `createHighlight`, and `createArrow` commands. A reference image may be used as a guide, but the final drawing should remain editable whenever possible.

For live motion demos, use shell-level animation commands instead of faking animation with hundreds of static shapes:

```json
{"type":"createSession","mode":"brainstorm","title":"Rotating ball"}
{"type":"createAnimatedBall","x":420,"y":290,"radius":34,"orbitRadius":118,"color":"#7f46e8","duration":2400,"label":"Rotating ball"}
```

`createAnimatedBall` creates a live front-end animation layer and editable guide shapes on the canvas.

## Board Game Skill

The current front end includes an interactive Gomoku board in `chess` mode.

Gomoku rules:

- Board size: 15 x 15 intersections.
- Human and AI take turns placing one stone on an empty intersection.
- The first side to connect five stones horizontally, vertically, or diagonally wins.
- The front end already handles local legal moves, simple AI response, win detection, and board drawing.

For game explanation:

- Let the user make moves in the UI.
- Use canvas commands to add strategy notes, arrows, candidate moves, and replay summaries.
- Do not click DOM elements unless the user explicitly asks for UI automation.

For a new game request such as "I want to play Xiangqi":

1. Search or read the official/basic rules if unsure.
2. Define board state, pieces, legal moves, turn order, and win condition.
3. Build a minimal rule engine first.
4. Add a visual board overlay or editable canvas board.
5. Expose the game workflow in `/agent.md` and `/api/capabilities`.
6. Use the canvas for live explanation, legal move hints, and review.

## Manual Drawing Recognition Roadmap

The browser already posts canvas shape summaries to the backend. Future agents should treat user drawing as input:

1. Read `GET /api/canvas/shapes`.
2. Inspect selected or recent shapes when available.
3. Infer user intent from text, bounds, strokes, arrows, and highlights.
4. Respond with annotations or new drawing commands.

Performance rule: do not send every pointer event to the backend. Prefer debounced snapshots after the user pauses, or explicit selected-shape analysis.

## Useful Commands

```json
{"type":"createSession","mode":"lesson","title":"Triangle counting problem"}
{"type":"createText","x":80,"y":40,"text":"Title","color":"violet","size":"xl"}
{"type":"createFormula","x":80,"y":96,"text":"v_1 = sqrt(GM/R), R^2 -> readable formula","color":"black","size":"l"}
{"type":"createAnimatedBall","x":420,"y":290,"radius":34,"orbitRadius":118,"color":"#7f46e8","duration":2400,"label":"Rotating ball"}
{"type":"createNote","x":680,"y":160,"text":"Step 1\nObserve conditions","color":"yellow"}
{"type":"createLine","points":[{"x":120,"y":320},{"x":360,"y":320}],"color":"blue","size":"l"}
{"type":"createDraw","points":[{"x":120,"y":220},{"x":160,"y":180},{"x":220,"y":210}],"color":"green","size":"l"}
{"type":"createHighlight","x":120,"y":420,"w":300,"h":64,"color":"yellow","opacity":0.22}
{"type":"createArrow","x":340,"y":250,"endX":430,"endY":250,"color":"violet"}
{"type":"zoomToFit"}
```

## Prompt To Give Another Coding Agent

```text
Use GOTIM DRAWER to complete this visual task. Before doing anything, read:
http://localhost:5173/agent.md

Then check http://localhost:8787/api/health, read /api/capabilities, and use /api/commands/batch to send replayable canvas commands. Do not manipulate DOM or tldraw store directly. Do not clear the canvas unless I explicitly ask you to replace it.
```

Human help: `/help.html`

Machine-readable capabilities: `/api/capabilities`
