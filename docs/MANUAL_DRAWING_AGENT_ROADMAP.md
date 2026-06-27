# Manual Drawing To Backend Agent Roadmap

GOTIM DRAWER should eventually understand user-drawn content, not only agent-generated content.

## Current Foundation

The front end already posts canvas summaries to the backend:

- Endpoint: `POST /api/canvas/snapshot`
- Read endpoint: `GET /api/canvas/shapes`
- Included data: shape type, text, bounds, compact props, line/draw points, image metadata.

This is enough for a first "agent reads canvas" workflow.

## Target Interaction Model

1. User draws, writes, circles, highlights, or adds arrows on the canvas.
2. Frontend syncs a compact snapshot after the user pauses.
3. Backend exposes the latest snapshot to an agent.
4. Agent interprets user intent from shapes, text, strokes, arrows, and bounds.
5. Agent returns visual feedback as normal canvas commands.

## Performance Design

Do not upload every pointer event.

Use one of these strategies:

- Debounce: sync after 300-600 ms of no drawing activity.
- Selection analysis: only send selected shapes when the user asks for analysis.
- Region analysis: user draws a circle/box; analyze shapes inside that region.
- Shape compression: store only sampled points, bounds, color, and rough type for freehand strokes.

## Near-Term Endpoints

Suggested additions:

```text
GET  /api/canvas/shapes
GET  /api/canvas/bounds
GET  /api/canvas/selection        planned
POST /api/canvas/analyze-selection planned
POST /api/canvas/analyze-region    planned
```

## Product Use Cases

- Targeted tutoring: user circles a part of a problem image, agent explains only that area.
- Drawing contest: user draws an object, agent scores structure, clarity, proportion, and creativity.
- Function sketch critique: user sketches a curve, agent checks monotonicity, extrema, and asymptotes.
- Geometry correction: user draws a triangle or circle, agent identifies missing labels or wrong assumptions.
- Board-game review: user draws arrows on a board, agent explains candidate moves.

## Implementation Notes

- Keep user drawings editable; do not rasterize unless screenshot analysis is explicitly needed.
- Preserve source attribution in snapshots: user-created vs agent-created vs temporary draft.
- Add a "temporary" or "draft" tag later so backend agents can ignore waiting-state shapes.
- For high-value tasks, combine shape analysis with a screenshot-based VLM pass.

