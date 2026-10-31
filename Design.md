# The Library of Worlds — System Design (`Design.md`)

*Every source a world to explore.*

## 1. Overview & Pedagogical Goal
**The Library of Worlds** is an interactive 3D Victorian library designed for first-year university and summer-research students beginning their first literature review. Students often struggle to distinguish blog posts from peer-reviewed papers, or to detect hallucinated ("ghost") AI citations.

In this application:
1. A student poses a research question to the Victorian **Librarian**.
2. A **Research Agent** (powered by Gemini 4 Argon + Google Search grounding) finds candidate sources, which a **Verifier** checks against Crossref, Semantic Scholar, arXiv, and live HTTP resolution. Unresolvable sources are discarded and tallied as **Ghost Citations**.
3. Verified sources are classified by **real metadata** (venue, venue type, citation count, year) into 5 creature tiers (**Imp → Goblin → Apprentice → Wizard → Archmage**) and placed on themed shelves along a glowing **Lantern Path**.
4. Clicking a book transports the student inside a **360° Book World** styled by tier, where sections become **NPC inhabitants** who explain their section, answer follow-ups, and hand out **verbatim Quote Tokens** (validated server-side as exact substrings of the extracted text).
5. To leave a book world, the student must pass the **Librarian's Exit Gate** by answering a comprehension question in their own words. On `pass` or `partial`, the Librarian automatically cites the single best supporting verbatim quote from the source (`isExactSubstring`-validated), adds it to the student's Satchel, and shows a `"📜 See in text"` button that opens the Full-Text viewer highlighted at that passage. On `wrong`, the world's **Menace Level (0–3)** rises (crows caw and circle, a crow lands on a perch or the Librarian's shoulder, fog thickens, light dims, and the relevant NPC glows as a hint). On passing, the crows fly away, a Great Kiskadee calls, and warm light returns.
6. Back in the hub, the **Exit Debrief** checks the student's overall takeaway claims against the sources (spawning mischievous **Elves** in the 3D Hub and Debrief modal for unsupported or overstated claims) and generates a printable **Borrowing Record PDF** (`window.print()`).

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
- **`hubScene.ts`**: Three.js first-person Victorian library hub (`ACESFilmicToneMapping`, warm ambient & hemisphere lighting, warm dusty-gold fog `0x362716`, flickering candle/lamp point lights on pillars, aisles, and chandeliers, camera-facing Nano Banana billboard sprite for Head Librarian Aurelius Finch, raycasted book hover & click interaction, and exit door trigger).
- **`bookShelfBuilder.ts`**: Procedural 3D wooden bookcases, large readable aisle signs, and standout real `Source` books (pulled half-out with a tier-coloured point light glow and a perched camera-facing tier creature billboard sprite).
- **`decorativeBooksInstancer.ts`**: High-performance `THREE.InstancedMesh` shelf dresser that fills every shelf across aisle and perimeter wall bookcases with hundreds of varied antique leather volumes (varied heights, widths, depths, muted leather hues, and slight leans) while respecting reserved slots around real `Source` books.
- **`spriteLoader.ts`**: Loads Nano Banana PNG character/creature/NPC art from `/public/art/`, runs border flood-fill chroma-keying + 1px anti-aliased edge feathering + bottom-aligned portrait auto-cropping on an offscreen 2D canvas, and returns camera-facing `THREE.Sprite` billboards.
- **`lanternPath.ts`**: Glowing floor lanterns and golden guide line connecting books in recommended reading order (`imp` → `archmage`).
- **`worldScene.ts`**: 360° look-around book world renderer (drag/mouse-look from fixed viewpoint, delegates tier environment & Full-Text Object construction to `worldTemplates.ts`, renders camera-facing Nano Banana NPC & companion creature sprites, Librarian Exit Gate with perched Great Kiskadee on completion, and dynamic Menace 0–3 lighting/fog/crow atmosphere).
- **`worldTemplates.ts`**: Five distinct 3D scene templates and clickable Full-Text Objects tailored to each source tier:
  - `imp`: Bustling Market (cobblestones, striped stalls, crates, hanging lanterns) + Town Notice Board
  - `goblin`: Tinkerer's Workshop (riveted floor, copper steam pipes, rotating interlocking brass cogwheels) + Workbench Blueprint
  - `apprentice`: Candlelit Study (oak floor, scholar rug, perimeter bookcases, brass candelabras) + Unrolled Parchment
  - `wizard`: Tower Observatory (inlaid brass astrolabe floor, stone parapet, giant brass telescope, rotating overhead armillary sphere rings) + Carved Stone Tablet
  - `archmage`: Grand Vaulted Hall (marble rotunda, fluted Corinthian columns, rotating golden halo chandelier) + Illuminated Manuscript on a Lectern
- **`npcDialogueUi.ts`**: In-world NPC conversation panel showing the condensed section explanation, 3 follow-up buttons (*"What do you mean?"*, *"Why should I believe you?"*, *"Read me the actual line"*), and Quote Token collection button.
- **`satchelUi.ts`**: Persistent Satchel HUD drawer displaying collected verbatim Quote Tokens for the active book world, allowing click-to-highlight in the Full-Text viewer or selection as Exit Gate evidence.
- **`notesScrollUi.ts`**: Persistent parchment Notes Scroll overlay per source where students type notes and drop in Quote Tokens.
- **`fullTextModal.ts`**: Full-text inspection overlay displaying the source title, authors, venue, licence, and all sections; scrolls to and highlights any clicked Quote Token passage.
- **`exitGateUi.ts`**: Librarian Exit Gate modal where the student answers the source's comprehension question in their own words; on `pass` or `partial`, displays the Librarian's concise 1–2 sentence reply + `"Quite right. As the text says: '…'"` with a `"📜 See in text"` button and automatically adds the supporting quote token to the Satchel; on `wrong`, triggers rising Crow Menace and NPC hint glow.
- **`debriefModal.ts`**: Library Exit Debrief & Mischievous Elf Claim Verifier modal where the student synthesises their overall answer and source trust ranking, verifies atomic claims via `POST /api/debrief-grade`, and resolves or shoos away mischievous Elves for any `unsupported` or `overstated` claims.
- **`borrowingRecordModal.ts`**: Printable **Borrowing Record PDF** modal (`@media print` + `window.print()`) rendering the student's complete research journey: reading path, metadata tier reasons, per-book notes, verbatim quote tokens, Exit Gate answers & auto-cited quotes, resolved misconceptions, max menace, verified takeaway claims, suggested next reads, and the xeno-canto audio attribution footer.
- **`librarianNarratorUi.ts`**: Connects to `GET /api/research/stream` via `EventSource` to stream real-time Librarian narration of each research pipeline stage (*"Searching the stacks… candidates found… ghost citations dismissed… shelving volumes…"*) with support for cached or forced-refresh runs.
- **`audioManager.ts`**: Hybrid HTML5 Audio + WebAudio synthesiser playing real bird recordings (`/audio/crow-caw.mp3`, `/audio/kiskadee-call.mp3`) with automatic WebAudio fallback (bandpass-filtered white noise burst with falling pitch for crow caw; three-note whistle for kiskadee call), plus looping background crow calls at Menace levels 2 and 3.

### Backend Layer (`src/server/`)
- **`index.ts`**: Express HTTP server exposing `/api/health`, `/api/research/stream` (SSE live pipeline narrator), `/api/research`, `/api/exit-grade`, and `/api/debrief-grade`. Loads `GEMINI_API_KEY` exclusively from `.env`.
- **`genaiClient.ts`**: Wrapper around `@google/genai` (`GoogleGenAI`) implementing structured logging, JSON schema output parsing (`parseJsonOutput`), exponential backoff on HTTP 429/503, and automatic model fallback (`gemini-4-argon` → `gemini-3.8-flash` → `gemini-3.5-flash-lite`).
- **`pipelineCache.ts`**: Disk cache storing completed pipeline runs at `cache/<sha256-of-normalized-question>.json` (gitignored) so repeat queries load instantaneously unless `forceRefresh` is requested.
- **`researchAgent.ts`**: Grounded Research Agent (`gemini-4-argon` + `tools: [{ type: 'google_search' }]` + structured JSON schema) proposing 6–10 candidate sources across blogs, docs, arXiv preprints, peer-reviewed papers, and surveys, grouped into 3–5 thematic aisles.
- **`verifier.ts`**: Parallel bibliographic verifier checking each candidate (with a 10s timeout per external call) against the arXiv Atom API, Crossref Works API, Semantic Scholar Graph API, and live HTTP resolution. Discards unresolvable candidates and increments `ghostCitationCount`.
- **`tierClassifier.ts`**: Deterministic classifier assigning each verified source to `imp`, `goblin`, `apprentice`, `wizard`, or `archmage` strictly from verified metadata (`venue`, `venueType`, `citationCount`, `year`, `doi`, `arxivId`), generating human-readable `tierReasons`.
- **`textExtractor.ts`**: Parallel full-text fetcher (10s timeout per source) extracting clean article prose from `ar5iv`/`arxiv.org/html` and public documentation/blog HTML. Any source that times out or lacks open-access full text gracefully becomes an **Unconnected World** (`connected: false`).
- **`worldBuilder.ts`**: Parallel Book World builder partitioning connected sources into 5–8 sections, generating tier-appropriate NPCs, grounded explanations, follow-ups, verbatim quotes, and exit questions, and enforcing 100% server-side substring validation (`validateSourceSubstrings`).
- **`researchPipeline.ts`**: End-to-end pipeline orchestrator coordinating cache lookup, grounded search, parallel verification, parallel full-text extraction, parallel world building, Lantern Path sorting, and live narration callbacks.
- **`artGenerator.ts`**: One-shot Nano Banana (`gemini-nano-banana-2.1`) art generator that creates and caches the 13 original Victorian storybook character/creature/NPC/crow/elf sprites into `public/art/*.png`.
- **`exitGateGrader.ts`**: LLM-powered Exit Gate comprehension grader (`gemini-4-argon` with fallback chain) evaluating the student's written synthesis (`pass`, `partial`, `wrong`) leniently, returning 1–2 short sentences from Head Librarian Aurelius Finch, the single best substring-validated supporting quote on `pass`/`partial`, `hintSectionId` on `wrong`, and deferred misconception corrections.
- **`debriefGrader.ts`**: LLM-powered Exit Debrief claim verifier (`gemini-4-argon` with fallback chain) decomposing the student's final synthesis into atomic `TakeawayClaim[]` items (`supported`, `unsupported`, `overstated`) checked against shelved sources, plus 2–3 `suggestedNextReads`.
