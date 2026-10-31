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

## Milestone Status (Milestone 1)

### Working Now
- **3D Victorian Library Hub**: Procedural bookshelves across themed aisles, warm Victorian lamps, atmospheric fog, glowing Lantern Path (`Imp` → `Archmage`), Victorian Librarian at the central desk, typed research question box seeded with the bioacoustics prompt, and 5 tier-styled sample `Source[]` books with hover tooltips ("Why this tier").
- **360° Book World**: Interactive 360° look-around world with 3+ section NPCs, in-character dialogue + 3 follow-up options (including substring-validated verbatim lines), Satchel UI with Quote Token collection, Full-Text object viewer with passage scroll & highlight, persistent Notes Scroll, and Exit Gate with answer + evidence evaluation and per-world Menace (0–3) feedback.
- **Express Backend + GenAI Wrapper**: Server scaffolding with `.env` key isolation, exponential backoff + fallback model config, and structured `INFO` logging.

### Stubbed for Upcoming Milestones
- **Milestone 2**: Live Research Agent + Crossref/Semantic Scholar/arXiv Verifier + dynamic full-text extraction pipeline.
- **Milestone 3**: Distinct 3D scene templates per tier, Nano Banana art panels/portraits, and Gemini 4 Argon LLM Exit Gate grading.
- **Milestone 4**: Hub Exit Debrief with claim verification, mischievous Elves for unsupported claims, and printable Borrowing Record PDF.
- **Milestone 5**: Gemini Live (`gemini-3.8-live`) bidirectional voice and Gemini TTS (`gemini-3.8-flash-tts`) Voice Design character voices.
