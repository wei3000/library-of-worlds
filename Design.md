# The Library of Worlds — System Design (`Design.md`)

*Every source a world to explore.*

## 1. Overview & Pedagogical Goal
**The Library of Worlds** is an interactive 3D Victorian library designed for first-year university and summer-research students beginning their first literature review. Students often struggle to distinguish blog posts from peer-reviewed papers, or to detect hallucinated ("ghost") AI citations.

In this application:
1. A student poses a research question to the Victorian **Librarian**.
2. A **Research Agent** (powered by Gemini 4 Argon + Google Search grounding) finds candidate sources, which a **Verifier** checks against Crossref, Semantic Scholar, arXiv, and live HTTP resolution. Unresolvable sources are discarded and tallied as **Ghost Citations**.
3. Verified sources are classified by **real metadata** (venue, venue type, citation count, year) into 5 creature tiers (**Imp → Goblin → Apprentice → Wizard → Archmage**) and placed on themed shelves along a glowing **Lantern Path**.
4. Clicking a book transports the student inside a **360° Book World** styled by tier, where sections become **NPC inhabitants** who explain their section, answer follow-ups, and hand out **verbatim Quote Tokens** (validated server-side as exact substrings of the extracted text).
5. To leave a book world, the student must pass the **Librarian's Exit Gate** by answering a comprehension question in their own words *and* presenting a supporting Quote Token. Wrong answers raise the world's **Menace Level (0–3)** (crows caw, fog thickens, light dims, and the relevant NPC glows as a hint).
6. Back in the hub, the **Exit Debrief** checks the student's overall takeaway claims against the sources (spawning mischievous **Elves** for unsupported or overstated claims) and generates a printable **Borrowing Record PDF**.

---

## 2. Architecture & Feature Modules

### Shared Layer (`src/shared/`)
- **`config.ts`**: Centralised, secret-free configuration for all Gemini model IDs (`gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.8-live`, `gemini-3.8-flash-tts`, `gemini-nano-banana-2.1`, and `PLACEHOLDER_LYRIA_MODEL_ID`), API endpoints, tier definitions, colour palettes, camera/movement parameters, and audio asset paths.
- **`types.ts`**: Shared TypeScript interfaces (`QuoteToken`, `Section`, `Source`, `SessionLog`, `ExitAttempt`, `TakeawayClaim`) used across frontend and backend.
- **`logger.ts`**: Structured `INFO` logger for all function calls (with parameters) and GenAI calls (model, prompt, config, output) that automatically strips base64/inline media and redacts any secret-like fields.

### Frontend Layer (`src/client/`)
- **`main.ts`**: Application bootstrap, view switcher (`hub` ↔ `world`), HUD wiring, and session state coordination.
- **`sessionState.ts`**: Reactive store managing `SessionLog` (current question, verified sources, reading path, per-source notes, visited NPCs, collected quote tokens, exit attempts, misconceptions, and menace levels).
- **`sampleData.ts`**: Rich, verified sample `Source[]` across all 5 tiers for the seed question (*"How do I design an evaluation for open-set individual identification from animal vocalisations when I have no labels?"*) with verbatim sections, NPCs, and substring-validated quote tokens.
- **`hubScene.ts`**: Three.js first-person Victorian library hub (WASD movement + mouse-look, warm lamps, atmospheric fog, Victorian librarian figure, raycasted book hover & click interaction, and exit door trigger).
- **`bookShelfBuilder.ts`**: Procedural 3D wooden bookcases, aisle signs, and tier-styled 3D books with tier badges/creatures and completion markers.
- **`lanternPath.ts`**: Glowing floor lanterns and golden guide line connecting books in recommended reading order (`imp` → `archmage`).
- **`worldScene.ts`**: 360° look-around book world renderer (drag/mouse-look from fixed viewpoint, tier-styled architecture, interactive Full-Text lectern/board/tablet, NPC billboards, Exit Gate portal, and dynamic Menace 0–3 lighting/fog/crow atmosphere).
- **`npcDialogueUi.ts`**: In-world NPC conversation panel showing the condensed section explanation, 3 follow-up buttons (*"What do you mean?"*, *"Why should I believe you?"*, *"Read me the actual line"*), and Quote Token collection button.
- **`satchelUi.ts`**: Persistent Satchel HUD drawer displaying collected verbatim Quote Tokens for the active book world, allowing click-to-highlight in the Full-Text viewer or selection as Exit Gate evidence.
- **`notesScrollUi.ts`**: Persistent parchment Notes Scroll overlay per source where students type notes and drop in Quote Tokens.
- **`fullTextModal.ts`**: Full-text inspection overlay displaying the source title, authors, venue, licence, and all sections; scrolls to and highlights any clicked Quote Token passage.
- **`exitGateUi.ts`**: Librarian Exit Gate modal where the student answers the source's comprehension question and attaches a supporting Quote Token; handles grading feedback, kiskadee success chime, or rising Menace + NPC hint glow.
- **`librarianNarratorUi.ts`**: Connects to `GET /api/research/stream` via `EventSource` to stream real-time Librarian narration of each research pipeline stage (*"Searching the stacks… candidates found… ghost citations dismissed… shelving volumes…"*) with support for cached or forced-refresh runs.
- **`audioManager.ts`**: Spatialised WebAudio / HTML5 audio manager for library ambience, kiskadee call on correct answers, crow caws on rising menace, and songbird nooks.

### Backend Layer (`src/server/`)
- **`index.ts`**: Express HTTP server exposing `/api/health`, `/api/research/stream` (SSE live pipeline narrator), `/api/research`, and `/api/exit-grade`. Loads `GEMINI_API_KEY` exclusively from `.env`.
- **`genaiClient.ts`**: Wrapper around `@google/genai` (`GoogleGenAI`) implementing structured logging, JSON schema output parsing (`parseJsonOutput`), exponential backoff on HTTP 429/503, and automatic model fallback (`gemini-4-argon` → `gemini-3.8-flash` → `gemini-3.5-flash-lite`).
- **`pipelineCache.ts`**: Disk cache storing completed pipeline runs at `cache/<sha256-of-normalized-question>.json` (gitignored) so repeat queries load instantaneously unless `forceRefresh` is requested.
- **`researchAgent.ts`**: Grounded Research Agent (`gemini-4-argon` + `tools: [{ type: 'google_search' }]` + structured JSON schema) proposing 6–10 candidate sources across blogs, docs, arXiv preprints, peer-reviewed papers, and surveys, grouped into 3–5 thematic aisles.
- **`verifier.ts`**: Parallel bibliographic verifier checking each candidate (with a 10s timeout per external call) against the arXiv Atom API, Crossref Works API, Semantic Scholar Graph API, and live HTTP resolution. Discards unresolvable candidates and increments `ghostCitationCount`.
- **`tierClassifier.ts`**: Deterministic classifier assigning each verified source to `imp`, `goblin`, `apprentice`, `wizard`, or `archmage` strictly from verified metadata (`venue`, `venueType`, `citationCount`, `year`, `doi`, `arxivId`), generating human-readable `tierReasons`.
- **`textExtractor.ts`**: Parallel full-text fetcher (10s timeout per source) extracting clean article prose from `ar5iv`/`arxiv.org/html` and public documentation/blog HTML. Any source that times out or lacks open-access full text gracefully becomes an **Unconnected World** (`connected: false`).
- **`worldBuilder.ts`**: Parallel Book World builder partitioning connected sources into 5–8 sections, generating tier-appropriate NPCs, grounded explanations, follow-ups, verbatim quotes, and exit questions, and enforcing 100% server-side substring validation (`validateSourceSubstrings`).
- **`researchPipeline.ts`**: End-to-end pipeline orchestrator coordinating cache lookup, grounded search, parallel verification, parallel full-text extraction, parallel world building, Lantern Path sorting, and live narration callbacks.
