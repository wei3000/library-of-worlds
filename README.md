# The Library of Worlds

*Every source a world to explore.*

A 3D Victorian library game that teaches first-year university students how to research a question properly. Ask the Librarian a question and a Gemini research agent fills the shelves with **real, verified sources**: each one a book you can step inside, question, and quote from. You can't leave until you can show you understood what the sources actually say.

Built solo in one day at **Halloween At Imperial: Gemini Edition (2026)**, working with an AI coding agent.

---

## Why

LLMs are good at sounding like they've read the literature. For a student learning to research, that's the problem: invented citations, confident summaries nobody checked, and quotes that aren't in the source. This project treats the model as a capable but unreliable research assistant and puts **deterministic checks around every step** where it could make something up.

## How it works

```
Research question
      │
      ▼
Research agent ── Gemini + Google Search grounding proposes candidate sources across 3–5 themed aisles
      │
      ▼
Citation verifier ── every candidate checked in parallel against Crossref, arXiv, Semantic Scholar
      │              and live URL resolution; anything unresolvable is dropped as a "Ghost Citation"
      ▼
Tier classifier ── difficulty tier assigned from verified metadata (venue, citations, year),
      │             never from model opinion
      ▼
Text extraction ── full text pulled for open-access sources; the rest are marked "unconnected"
      │
      ▼
World builder ── each source split into sections with in-character NPCs; every quote they offer
      │           is validated server-side as an exact substring of the source text
      ▼
Graders ── exit-gate grader checks the student's answer and cites a verified supporting quote;
           debrief grader splits the final synthesis into claims and flags unsupported or overstated ones
```

The pattern throughout: **the model proposes, code verifies.** Citations must resolve in a real bibliographic database, tiers come from metadata, and any quote shown to the student must appear verbatim in the source.

## What you do in the game

- **Library hub:** Walk the aisles (WASD + mouse). Sources glow on the shelves, tagged with their tier (Imp → Goblin → Apprentice → Wizard → Archmage), and the **Lantern Path** suggests a reading order from easiest to hardest.
- **Book worlds:** Click a book to enter a 360° scene for that source. Each NPC explains one section. Ask *"What do you mean?"*, *"Why should I believe you?"* or *"Read me the actual line"*, and collect verbatim **quote tokens** into your satchel.
- **Exit gate:** Explain the source in your own words. Pass, and the Librarian cites the line that supports you; fail, and crows start gathering.
- **Debrief:** Write your final takeaways. Any claim the sources don't support summons a mischievous elf until you revise it or anchor it to a quote.
- **Borrowing Record:** Print or save a PDF of your reading path, notes, quotes, verified claims and suggested next reads.

## Tech stack

- **Frontend:** TypeScript, Three.js, Vite
- **Backend:** Node.js, Express, Google Gen AI SDK (`@google/genai`), with model fallback and retries
- **Gemini:** reasoning model with Google Search grounding for research, extraction and grading; image generation for the character sprites (generated once and cached in `public/art/`)
- **Verification:** Crossref, arXiv and Semantic Scholar APIs
- **Caching:** each research run is cached to disk by question hash, so repeat questions load instantly

## Running locally

Requires Node.js 18+ and a Gemini API key.

```bash
cp .env.example .env      # then set GEMINI_API_KEY
npm install
npm run dev
```

Frontend: http://localhost:5173 · Backend: http://localhost:3001

## Project layout

```
src/
  server/   research agent, verifier, tier classifier, text extraction, world builder, graders
  client/   Three.js hub and book worlds, dialogue, satchel, exit gate, debrief, borrowing record
  shared/   types, config, exact-substring validator
public/
  art/      generated character sprites
  audio/    sound effects
```

## Status

A one-day hackathon build: the full research → explore → grade → debrief loop works end to end. Not yet done: voice conversations with NPCs (Gemini Live), generated character voices, and ambient music.

## Credits

Crow call recording in `public/audio/` from [xeno-canto.org](https://xeno-canto.org). The kiskadee call is synthesised in the browser with WebAudio.
