# GOTIM DRAWER

GOTIM DRAWER is an editable visual workspace for human users and AI coding agents. It combines a React/tldraw canvas, a small Node.js control server, Server-Sent Events, and a JSON command protocol so Codex, Claude Code, Cursor Agent, or a custom agent can draw, explain, annotate, and prototype directly on the same canvas a user can edit.

The product direction is a "visual skill runtime": problem solving, teacher-style board writing, AI-assisted drawing, board-game experiments, and presentation diagrams all share one controllable canvas.

## What It Can Do

- Editable infinite canvas powered by `tldraw`.
- Agent control through structured HTTP JSON commands.
- Real-time command delivery through Server-Sent Events.
- Session support so unrelated tasks do not overlap on the same board.
- Problem-image upload and annotation workflow.
- Formula command that normalizes common math text such as `sqrt(...)`, `^2`, `_1`, and `->`.
- Python plot command for accurate math and physics curves through Matplotlib.
- Native drawing commands for replayable drawing processes.
- Gomoku mode, with a documented path for adding more board games.
- Self-describing agent docs at `/agent.md`, `/help.html`, and `/api/capabilities`.

## Screens And Workflows

The app is designed around four modes:

| Mode | Use case |
| --- | --- |
| `lesson` | Problem review, physics/math explanation, formulas, diagram reconstruction. |
| `brainstorm` | Drawing, visual ideation, information diagrams, staged sketches. |
| `chess` | Gomoku and future board-game analysis or play. |
| `presentation` | Slide-like visual explanation and replayable command sequences. |

For image-based homework or physics questions, the recommended board layout is:

1. Place the original problem image.
2. Highlight known conditions.
3. Redraw the clean core diagram.
4. Use `createFormula` for derivation lines.
5. Use `createPythonPlot` when an accurate function curve is needed.
6. Put the final answer and checks in a separate note.

## Quick Start

Requirements:

- Node.js 18+
- npm 9+
- A modern browser
- Optional: Python with Matplotlib for `createPythonPlot`

Install dependencies:

```bash
npm install
```

Start the web app and control API together:

```bash
npm run dev
```

Open the app:

```text
http://localhost:5173
```

Control API:

```text
http://localhost:8787/api/health
http://localhost:8787/api/capabilities
```

Production build:

```bash
npm run build
npm start
```

In production, the server serves the built app on port `8787` by default:

```text
http://localhost:8787
```

## Environment

The app works without environment variables. Optional settings:

```bash
PORT=8787
```

Copy `.env.example` if you want a local environment file:

```bash
cp .env.example .env
```

## How Coding Agents Use It

The intended agent workflow is:

1. Ask the user to open `http://localhost:5173`.
2. Check `GET http://localhost:8787/api/health`.
3. Continue only when `ok=true` and `clients >= 1`.
4. Read `GET http://localhost:8787/api/capabilities`.
5. Start a separate task with `createSession` when work should not mix with old canvas content.
6. Send a command batch to `POST /api/commands/batch`.
7. Finish with `zoomToFit`.

Minimal batch example:

```bash
curl -X POST http://localhost:8787/api/commands/batch \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      { "type": "createSession", "mode": "lesson", "title": "Demo" },
      { "type": "createText", "x": 80, "y": 60, "text": "Hello GOTIM", "color": "violet", "size": "xl" },
      { "type": "createNote", "x": 80, "y": 140, "text": "This note was created by an agent.", "color": "yellow" },
      { "type": "zoomToFit" }
    ]
  }'
```

For a full operating manual, read:

- [Agent quick guide](public/agent.md)
- [AI Coding Agent guide](docs/AI_CODING_AGENT_GUIDE.md)
- [API reference](docs/API_REFERENCE.md)
- [Architecture decisions](docs/architecture.md)
- [Product roadmap](docs/GOTIM_PRODUCT_TODO.md)

## Common Commands

| Command | Purpose |
| --- | --- |
| `createSession` | Start a separate lesson, drawing, chess, or presentation task. |
| `createText` | Add plain canvas text. |
| `createFormula` | Add math or physics expressions with readable normalization. |
| `createNote` | Add a colored note card. |
| `createGeo` | Add a rectangle, ellipse, diamond, triangle, and other basic shapes. |
| `createLine` | Add a line or polyline. |
| `createDraw` | Add editable freehand drawing strokes. |
| `createArrow` | Add an arrow between points. |
| `createHighlight` | Add translucent highlight regions. |
| `createImage` | Place an image or problem screenshot. |
| `createPythonPlot` | Generate a Matplotlib image and insert it as a plot panel. |
| `createAnimatedBall` | Add a simple live animation demo. |
| `zoomToFit` | Fit the final work into view. |

## Project Structure

```text
gotim-drawer/
  server/
    index.mjs              # Express control API, SSE, planner helpers, Python plot endpoint
  src/
    App.tsx                # Main React UI and tldraw integration
    commands.ts            # Command schema and tldraw command adapter
    canvasSnapshot.ts      # Canvas summary upload helpers
    problemImage.ts        # Problem image upload and placement helpers
    taskSessions.ts        # Frontend session persistence
    gomoku.ts              # Gomoku rule helpers
    templates/             # Template engine and renderers
  public/
    agent.md               # First-read guide for coding agents
    help.html              # Human-readable help page
  docs/
    AI_CODING_AGENT_GUIDE.md
    AI_CODING_FIRST_USE_PROMPT.md
    API_REFERENCE.md
    GOTIM_PRODUCT_TODO.md
    MANUAL_DRAWING_AGENT_ROADMAP.md
    architecture.md
```

## Development Notes

- Keep the browser open before an external agent sends commands.
- `deliveredTo` in command responses should be at least `1`.
- Use `createSession` for each unrelated task to avoid overlapping old work.
- Use `createFormula` for formulas instead of raw text.
- Use `createPythonPlot` for real graph panels instead of hand-drawn approximate curves.
- Do not commit `node_modules`, `dist`, `tmp_steps`, local uploads, or `.env`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run Vite and the control API together. |
| `npm run dev:web` | Run only the Vite frontend. |
| `npm run dev:api` | Run only the Node control server. |
| `npm run build` | Type-check and build the production bundle. |
| `npm run check` | Alias for the production build. |
| `npm start` | Serve the built app and API from the Node server. |

## GitHub Upload Checklist

```bash
npm install
npm run build
git status --short
git add .gitattributes .gitignore .env.example package.json package-lock.json index.html vite.config.ts tsconfig*.json src server public docs README.md TODO.md PROJECT.md
git commit -m "Initial GOTIM DRAWER project"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Before committing, confirm that generated folders are not staged:

```bash
git status --short
```

Ignored folders/files include `node_modules/`, `dist/`, `tmp_steps/`, uploaded images, TypeScript build info, logs, and local environment files.

## Current Status

The project builds successfully with `npm run build`. The current implementation is a local-first prototype intended for agent-controlled visual work. Production hardening still needs request validation, multi-user/session isolation on the server side, stronger persistence, and security controls before public internet deployment.
