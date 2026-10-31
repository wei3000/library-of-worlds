# The Library of Worlds

*Every source a world to explore.*

A playable 3D Victorian library where a first-year university student learns how to research a question properly. Every source is a verified book on the shelves. Step inside a book to enter its 360° world, talk to its NPC inhabitants section by section, collect verbatim quote tokens into your satchel, take notes on your parchment scroll, and prove your understanding to the Librarian at the Exit Gate before you can leave.

---

## Quick Start

### 1. Prerequisites
- **Node.js** >= 18
- A **Gemini API Key** stored in `.env` (never committed)

### 2. Setup
```bash
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key_here
npm install
```

### 3. Run in Development
```bash
npm run dev
```
- **Frontend (Vite + Three.js)**: `http://localhost:5173`
- **Backend (Express + `@google/genai`)**: `http://localhost:3001`

---

## Controls
- **Library Hub**:
  - **WASD / Arrow Keys**: Walk around the Victorian library aisles
  - **Mouse Drag (or Pointer Lock)**: Look around
  - **Hover over a Book**: Inspect its Tier (`Imp`, `Goblin`, `Apprentice`, `Wizard`, `Archmage`), metadata tier reasons, and one-line summary
  - **Click a Book**: Step inside its 360° Book World
  - **Click the Librarian**: Ask or update your research question
- **Inside a 360° Book World**:
  - **Mouse Drag**: Look 360° around the scene from the centre
  - **Click an NPC (`1`, `2`, `3`...)**: Hear their in-character section explanation, ask follow-up questions (*"What do you mean?"*, *"Why should I believe you?"*, *"Read me the actual line"*), and collect verbatim **Quote Tokens**
  - **Click the Full-Text Object (or HUD button)**: Open the full extracted source text; clicking any Quote Token in your Satchel scrolls directly to and highlights that exact passage
  - **Notes Scroll Button**: Jot down notes or insert collected Quote Tokens
  - **Click the Librarian at the Exit Gate**: Answer the exit comprehension question in your own words and attach the supporting Quote Token to complete the book and return to the Hub

---

## Milestone Status (Milestone 3)

### Working Now
- **Milestone 3 Visuals, Tier World Templates & LLM Exit Gate Grader**:
  - **Nano Banana Character, Creature & NPC Billboard Sprites (`artGenerator.ts`, `spriteLoader.ts`)**: Consistent Victorian storybook illustrations generated once via `gemini-nano-banana-2.1` and cached in `/public/art/*.png` (Head Librarian Aurelius Finch, 5 tier creatures, and 5 tier NPCs), chroma-keyed on canvas and rendered as camera-facing 3D billboard sprites.
  - **Library Shelf Dressing (`decorativeBooksInstancer.ts`, `bookShelfBuilder.ts`)**: Hundreds of procedural antique leather books via `THREE.InstancedMesh` across all aisle and perimeter wall bookcases, with real `Source` books pulled half-out, glowing in their tier colour, and accompanied by a perched tier creature sprite.
  - **Cosy Victorian Lighting & Readability (`hubScene.ts`)**: `ACESFilmicToneMapping`, warm ambient & hemisphere lighting, warm dusty-gold fog (`0x362716`), flickering candle/lamp point lights on pillars, aisles, and chandeliers, and large readable aisle header signs.
  - **5 Reusable Tier World Templates (`worldTemplates.ts`)**:
    - `Imp`: Bustling Market + Town Notice Board
    - `Goblin`: Tinkerer's Workshop (with rotating interlocking brass cogwheels) + Workbench Blueprint
    - `Apprentice`: Candlelit Study + Unrolled Parchment
    - `Wizard`: Tower Observatory (with giant brass telescope & rotating overhead armillary sphere rings) + Carved Stone Tablet
    - `Archmage`: Grand Vaulted Hall (with marble columns & rotating golden halo chandelier) + Illuminated Manuscript on a Lectern
  - **Gemini 4 Argon LLM Exit Gate Grader (`exitGateGrader.ts`)**: Evaluates the student's written synthesis and presented `QuoteToken` (`pass`, `weak_evidence`, `partial`, `wrong`), returning in-character feedback from Head Librarian Aurelius Finch, glowing NPC section hints, Great Kiskadee bird/chime on success, circling Crows + rising Menace (0–3) on wrong answers, and deferred misconception corrections.
- **Live Grounded Research Pipeline (`src/server/researchPipeline.ts` — Milestone 2)**:
  - **Research Agent (`researchAgent.ts`)**: Uses `gemini-4-argon` + Google Search grounding (`tools: [{ type: 'google_search' }]`) to propose candidate sources across 3–5 thematic aisles.
  - **Parallel Bibliographic Verifier (`verifier.ts`)**: Verifies all candidates in parallel (10s timeout per external call) against Crossref, arXiv API, Semantic Scholar, and live HTTP resolution. Unresolvable candidates are discarded and tallied as **Ghost Citations**.
  - **Metadata-Driven Tiering (`tierClassifier.ts`)**: Deterministically assigns `Imp`, `Goblin`, `Apprentice`, `Wizard`, or `Archmage` from verified metadata (`venue`, `venueType`, `citationCount`, `year`, `doi`, `arxivId`) — never model opinion.
  - **Parallel Full-Text Extraction (`textExtractor.ts`)**: Fetches full text for arXiv papers (`ar5iv` / `arxiv.org/html`) and web/documentation pages with a 10s timeout. Sources that time out or lack open-access full text gracefully become **Unconnected Worlds** (`connected: false`).
  - **Parallel Book World & Substring-Validated NPC Builder (`worldBuilder.ts`)**: Splits connected sources into 5–8 sections, generates tier-styled NPCs, grounded explanations, follow-ups, and 1–2 `QuoteToken`s per section, and validates server-side that every `QuoteToken.text` and `followUps.verbatimLine` is an exact substring of `section.text`.
  - **Disk Cache (`pipelineCache.ts`)**: Saves each pipeline run to `cache/<sha256-hash>.json` (gitignored) and reuses it on repeat questions unless the **Force refresh** checkbox is ticked.
  - **Live SSE Librarian Narration (`librarianNarratorUi.ts`)**: Streams pipeline stages in real time to the Hub banner (*"Searching the stacks… candidates found… ghost citations dismissed… shelving volumes…"*).
- **3D Victorian Library Hub & 360° Book Worlds (Milestone 1)**: WASD + mouse-look Hub, glowing Lantern Path, hover tooltips, 360° Book Worlds, NPC dialogue, Satchel, Notes Scroll, and Full-Text viewer with passage highlighting.

### Stubbed for Upcoming Milestones
- **Milestone 4**: Hub Exit Debrief with claim verification, mischievous Elves for unsupported claims, and printable Borrowing Record PDF.
- **Milestone 5**: Gemini Live (`gemini-3.8-live`) bidirectional voice and Gemini TTS (`gemini-3.8-flash-tts`) Voice Design character voices.
