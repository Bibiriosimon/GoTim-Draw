# GOTIM DRAWER API Reference

This document is the compact API reference for local development and external coding agents.

Default development URLs:

```text
Frontend: http://localhost:5173
API:      http://localhost:8787
```

In production, `npm start` serves both the app and API from the API port.

## Health And Discovery

### `GET /api/health`

Returns service status and the number of connected browser clients.

```json
{
  "ok": true,
  "service": "gotim-drawer-control",
  "clients": 1
}
```

Agents should not send drawing commands until `clients >= 1`.

### `GET /api/capabilities`

Returns the machine-readable command list, workflows, examples, and current product capability notes. Agents should treat this as the runtime source of truth.

## Commands

### `POST /api/commands`

Send one command.

```json
{
  "type": "createText",
  "x": 80,
  "y": 60,
  "text": "Hello",
  "color": "violet",
  "size": "xl"
}
```

### `POST /api/commands/batch`

Send a replayable command batch.

```json
{
  "batchName": "demo",
  "commands": [
    { "type": "createSession", "mode": "lesson", "title": "Demo" },
    { "type": "createText", "x": 80, "y": 60, "text": "Hello GOTIM", "step": 0, "stepTitle": "Title" },
    { "type": "zoomToFit", "step": 1, "stepTitle": "Fit" }
  ]
}
```

Response includes `deliveredTo`. A value of `0` means no browser canvas was connected.

### `POST /api/commands/ack`

The frontend calls this after executing a delivered command. Agents usually read the result through command history instead of calling this directly.

### `GET /api/commands/history?limit=80`

Returns recent command delivery and execution state.

## Canvas State

### `POST /api/canvas/snapshot`

Frontend endpoint for uploading compact canvas state. External agents usually do not call this.

### `GET /api/canvas/shapes`

Returns compact shape summaries: id, type, position, bounds, selected props, and extracted text.

Use this before appending to an existing canvas or before updating/deleting a shape by id.

### `GET /api/canvas/bounds`

Returns current page bounds and shape count.

## Problem Images

### `POST /api/problem-image`

Frontend endpoint used after a user uploads or pastes a problem image.

### `GET /api/problem-image`

Returns the latest uploaded problem-image metadata.

Current image understanding is not a full OCR/VLM pipeline yet. Agents should use this metadata to place annotations and should still rely on the user or external vision tools for detailed image interpretation.

## Python Plot

### `POST /api/python/plot`

Generates a Matplotlib PNG from a math expression.

```json
{
  "title": "E(x) curve",
  "expression": "x/(x^2+1)^(3/2)",
  "xMin": 0,
  "xMax": 3.5,
  "samples": 500,
  "xLabel": "x/R",
  "yLabel": "normalized E",
  "markers": [{ "x": 0.707, "label": "max" }]
}
```

`^` is converted to Python exponent syntax internally. The response contains an image data URL that the frontend can place with `createImage` or through the `createPythonPlot` command.

## SSE

### `GET /api/events`

Browser clients subscribe to this stream to receive commands in real time.

External coding agents should use `/api/commands` or `/api/commands/batch`; they should not write directly to the SSE stream.

## Core Command Types

Common commands:

- `createSession`
- `clear`
- `zoomToFit`
- `undo`
- `redo`
- `deleteShape`
- `updateShape`
- `createText`
- `createFormula`
- `createNote`
- `createGeo`
- `createLine`
- `createDraw`
- `createHighlight`
- `createArrow`
- `createImage`
- `createPythonPlot`
- `createAnimatedBall`
- `insert_template`

Always check `/api/capabilities` for the latest examples and supported fields.
