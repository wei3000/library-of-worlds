/**
 * @file artGenerator.ts
 * @description One-time Nano Banana (`gemini-nano-banana-2.1`) sprite generator and `/public/art/`
 * cache manager for "The Library of Worlds" (Milestone 3 Priority 1).
 *
 * Generates a cohesive, original Victorian storybook / painterly illustration set:
 * 1. Head Librarian Aurelius Finch (Victorian gentleman: tailcoat, waistcoat, pocket watch, top hat)
 * 2. Tier creatures (`imp`, `goblin`, `apprentice`, `wizard`, `archmage`) perched beside shelf books
 * 3. World NPC role portraits/sprites (`imp`, `goblin`, `apprentice`, `wizard`, `archmage`)
 *
 * Each prompt specifies an original character design isolated on a solid pure white (`#FFFFFF`)
 * studio background with zero cast shadows or frames, enabling clean client-side chroma-keying
 * into camera-facing 3D billboard sprites (`THREE.Sprite`).
 *
 * Use cases:
 * 1. Pre-generating and caching sprites into `/public/art/*.png` so runtime demos never wait on image gen.
 * 2. Ensuring missing sprite files in `/public/art/` are automatically generated if absent.
 * 3. Maintaining 100% original Victorian fantasy designs with no third-party franchise likenesses.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import { runImageGenerationInteraction } from './genaiClient';

dotenv.config();

/** Specification for a single cached sprite asset in `/public/art/`. */
export interface SpriteAssetSpec {
  id: string;
  publicRelativePath: string;
  prompt: string;
}

const SHARED_STYLE_SUFFIX =
  'Warm Victorian storybook painterly gouache and ink illustration style, rich painterly brushwork, crisp silhouette, full-body standing character centered in frame with generous margin around all edges, isolated on a completely flat solid pure white (#FFFFFF) background, no background scenery, no floor, no ground shadow, no text, no watermark, no border, original character design.';

/**
 * Returns the complete manifest of character and creature sprites required by the Library Hub
 * and Book Worlds.
 *
 * @returns Array of `SpriteAssetSpec` entries mapping `/art/*.png` paths to Nano Banana prompts.
 */
export function getSpriteAssetSpecs(): SpriteAssetSpec[] {
  logFunctionCall('getSpriteAssetSpecs', {});
  return [
    {
      id: 'librarian-aurelius',
      publicRelativePath: APP_CONFIG.art.librarian,
      prompt: `Original character illustration of Head Librarian Aurelius Finch: a distinguished, kindly Victorian gentleman scholar with neat silver-streaked sideburns and warm intelligent eyes, wearing a tailored dark plum-charcoal Victorian tailcoat, an ornate amber-gold brocade waistcoat, a gleaming brass pocket watch on a chain, and a classic silk top hat, holding an antique leather-bound library ledger. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'creature-imp',
      publicRelativePath: APP_CONFIG.art.creatures.imp,
      prompt: `Original fantasy library creature illustration of a Chattering Imp: a small whimsical copper-amber imp sprite with oversized expressive ears, brass spectacles perched on its nose, ink-stained fingers, and a tiny leather satchel bursting with rolled street broadsheets and gossip notes, playful pose. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'creature-goblin',
      publicRelativePath: APP_CONFIG.art.creatures.goblin,
      prompt: `Original fantasy library creature illustration of a Gear-Tinker Goblin: a friendly, clever Victorian clockwork goblin artisan with emerald-tinted skin, wearing a stitched brown leather tool apron and brass magnifying goggles on its forehead, holding a brass caliper and a rolled cyan engineering blueprint. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'creature-apprentice',
      publicRelativePath: APP_CONFIG.art.creatures.apprentice,
      prompt: `Original fantasy library creature illustration of a Lantern Apprentice: an earnest young owl-like library sprite scholar wearing a sapphire-blue academic capelet, holding a warm glowing brass library lantern in one hand and a feather quill with parchment notes in the other. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'creature-wizard',
      publicRelativePath: APP_CONFIG.art.creatures.wizard,
      prompt: `Original fantasy library creature illustration of an Astral Wizard familiar: a dignified celestial lynx-like arcane scholar wearing deep royal-violet robes embroidered with golden constellations, holding a brass astrolabe and a glowing amethyst crystal orb. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'creature-archmage',
      publicRelativePath: APP_CONFIG.art.creatures.archmage,
      prompt: `Original fantasy library creature illustration of a Sovereign Archmage guardian: a majestic, ancient golden-feathered gryphon-sage wearing radiant ivory and burnished gold ceremonial vestments with a sun-dial crest, holding an illuminated golden tome. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'npc-imp',
      publicRelativePath: APP_CONFIG.art.npcs.imp,
      prompt: `Original character illustration of a Victorian Bustling Market Stallholder & Pamphleteer: a lively, expressive street vendor wearing a patched amber waistcoat, neckerchief, and tilted bowler cap, enthusiastically holding up a printed broadsheet notice. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'npc-goblin',
      publicRelativePath: APP_CONFIG.art.npcs.goblin,
      prompt: `Original character illustration of a Victorian Workshop Tinkerer: an inventive master mechanic in an emerald-trimmed workshop coat and leather apron, brass loupe over one eye, holding a mechanical gear assembly and drafted blueprint roll. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'npc-apprentice',
      publicRelativePath: APP_CONFIG.art.npcs.apprentice,
      prompt: `Original character illustration of a Victorian Candlelit Study Research Scholar: a thoughtful university researcher in a cobalt-blue academic gown and waistcoat, holding a brass candlestick and an unrolled parchment manuscript with diagrams. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'npc-wizard',
      publicRelativePath: APP_CONFIG.art.npcs.wizard,
      prompt: `Original character illustration of a Victorian Tower Observatory Natural Philosopher: a regal astronomer-scholar in a deep plum velvet coat with celestial embroidery, holding a brass sextant and a carved stone tablet of laws. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'npc-archmage',
      publicRelativePath: APP_CONFIG.art.npcs.archmage,
      prompt: `Original character illustration of a Grand Vaulted Hall Master Chronicler: a venerable, wise chief archivist in ornate gilded ivory and gold ceremonial robes, holding a golden quill and a grand illuminated codex. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'crow',
      publicRelativePath: APP_CONFIG.art.crow,
      prompt: `Original Victorian storybook illustration of an ominous gothic library crow with glossy midnight-black and iridescent indigo feathers, expressive watchful amber eyes, and slightly spread wings as if perching or taking flight. ${SHARED_STYLE_SUFFIX}`,
    },
    {
      id: 'elf',
      publicRelativePath: APP_CONFIG.art.elf,
      prompt: `Original Victorian storybook illustration of a mischievous whimsical library elf sprite with pointed ears, a cheeky grin, a tilted crimson-and-brass jester-scholar cap, holding up a small unrolled parchment scroll banner and a red ink quill. ${SHARED_STYLE_SUFFIX}`,
    },
  ];
}

/**
 * Resolves the absolute disk path inside `public/` for a given `/art/...` public URL path.
 *
 * @param publicRelativePath - Public URL path such as `/art/librarian-aurelius.png`.
 * @returns Absolute filesystem path under `<repo>/public/art/...`.
 */
export function resolvePublicArtDiskPath(publicRelativePath: string): string {
  logFunctionCall('resolvePublicArtDiskPath', { publicRelativePath });
  const cleanRel = publicRelativePath.replace(/^\/+/, '');
  return path.resolve(process.cwd(), 'public', cleanRel);
}

/**
 * Generates any missing sprite assets in `/public/art/` using Nano Banana (`gemini-nano-banana-2.1`).
 * Existing non-empty files are preserved (cached on disk) unless `forceRegenerate` is true.
 *
 * @param options - Concurrency and `forceRegenerate` flag.
 * @returns Summary of generated, cached, and failed sprite IDs.
 */
export async function ensurePublicArtAssets(options?: {
  forceRegenerate?: boolean;
  concurrency?: number;
}): Promise<{ generated: string[]; cached: string[]; failed: Array<{ id: string; error: string }> }> {
  const forceRegenerate = Boolean(options?.forceRegenerate);
  const concurrency = options?.concurrency ?? 3;
  logFunctionCall('ensurePublicArtAssets', { forceRegenerate, concurrency });

  const specs = getSpriteAssetSpecs();
  const generated: string[] = [];
  const cached: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  const toGenerate: SpriteAssetSpec[] = [];

  for (const spec of specs) {
    const diskPath = resolvePublicArtDiskPath(spec.publicRelativePath);
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    if (!forceRegenerate && fs.existsSync(diskPath) && fs.statSync(diskPath).size > 1024) {
      cached.push(spec.id);
    } else {
      toGenerate.push(spec);
    }
  }

  // Process generation queue in batches of `concurrency`
  for (let i = 0; i < toGenerate.length; i += concurrency) {
    const batch = toGenerate.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (spec) => {
        const diskPath = resolvePublicArtDiskPath(spec.publicRelativePath);
        try {
          const result = await runImageGenerationInteraction({
            action: `generateSprite:${spec.id}`,
            prompt: spec.prompt,
          });
          const buffer = Buffer.from(result.imageBase64, 'base64');
          fs.writeFileSync(diskPath, buffer);
          generated.push(spec.id);
        } catch (err) {
          failed.push({ id: spec.id, error: String(err) });
        }
      })
    );
  }

  return { generated, cached, failed };
}

// Allow direct CLI execution via `npx tsx src/server/artGenerator.ts`
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]).endsWith('artGenerator.ts');

if (isDirectExecution) {
  const force = process.argv.includes('--force');
  ensurePublicArtAssets({ forceRegenerate: force, concurrency: 3 })
    .then((summary) => {
      console.log('Art generation complete:', JSON.stringify(summary, null, 2));
      if (summary.failed.length > 0) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('Art generation fatal error:', err);
      process.exitCode = 1;
    });
}
