# GOTIM DRAWER Product TODO

This list tracks the four product upgrades currently being built.

## 1. Problem Review And Visual Teaching

- [x] Define a visual explanation workflow for image-based questions.
- [x] Document when Python should be used for precise plots or geometry.
- [x] Expose a reusable command pattern for teacher-style board writing.
- [ ] Later: connect OCR/VLM so uploaded problem images can be understood automatically.
- [ ] Later: add a Python plot service that returns editable canvas points instead of a pasted bitmap.

## 2. Waiting Experience

- [x] Show a visible working overlay while the app is planning or applying work.
- [x] Keep temporary thinking drafts separate from final canvas content.
- [x] Remove temporary drafts before final commands are applied.
- [ ] Later: stream progress events from the backend during long agent jobs.

## 3. AI Coding Fast-Use Skill

- [x] Make `/agent.md` the first-read operating manual for other coding agents.
- [x] Make `/help.html` a detailed human-readable skill page.
- [x] Add board-game extension workflow so "play chess" style tasks have a repeatable path.
- [x] Expose skill workflows in `/api/capabilities`.
- [ ] Later: add ready-made scaffolds for Xiangqi, Go, chess, and custom board games.

## 4. Manual Drawing To Backend Agent

- [x] Describe the interaction model: user drawing -> canvas snapshot -> backend agent.
- [x] Identify debounce and selection-based upload as the performance strategy.
- [x] Expose the future workflow in docs and capabilities.
- [ ] Later: add selected-shape endpoints and a lightweight sketch recognition endpoint.
- [ ] Later: support drawing contests, target-area tutoring, and user-vs-agent collaborative drawing.

