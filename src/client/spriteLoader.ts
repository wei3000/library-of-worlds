/**
 * @file spriteLoader.ts
 * @description Client-side loader, background chroma-key processor, and camera-facing
 * 3D billboard sprite factory (`THREE.Sprite`) for Nano Banana character and creature art
 * cached in `/public/art/*.png`.
 *
 * Processing pipeline:
 * 1. Loads the cached sprite image from `/art/*.png`.
 * 2. Runs a border-seeded flood-fill + pure-white background hole removal on an offscreen canvas
 *    so interior highlights (shirt collars, parchment, eyes) remain opaque while the exterior
 *    studio background and gaps between limbs/tools become transparent (`alpha = 0`).
 * 3. Applies a 1-pixel edge feather pass to remove white halos against dark 3D backgrounds.
 * 4. Auto-crops the non-transparent character silhouette and bottom-aligns it inside a
 *    standardized portrait canvas (`512x640`) so `sprite.center.set(0.5, 0.0)` anchors
 *    every character's feet accurately on floors, shelves, or pedestals.
 *
 * Use cases:
 * 1. Rendering Head Librarian Aurelius Finch at the central Hub desk and World Exit Gate.
 * 2. Rendering tier creatures (`imp`, `goblin`, `apprentice`, `wizard`, `archmage`) perched beside books.
 * 3. Rendering section NPCs as camera-facing billboard sprites in the 360° Book Worlds.
 */

import * as THREE from 'three';
import { logFunctionCall } from '../shared/logger';

/** Cache of processed chroma-keyed `THREE.CanvasTexture` instances keyed by image URL. */
const textureCache = new Map<string, THREE.CanvasTexture>();

/** Cache of in-flight image processing promises keyed by image URL. */
const pendingLoads = new Map<string, Promise<THREE.CanvasTexture>>();

/**
 * Tests whether an RGB pixel matches the studio white background.
 *
 * @param r - Red channel (0-255).
 * @param g - Green channel (0-255).
 * @param b - Blue channel (0-255).
 * @param tolerance - Allowed deviation from pure white.
 * @returns True if the pixel is near-white with low colour saturation.
 */
function isNearWhiteBackground(r: number, g: number, b: number, tolerance = 24): boolean {
  const minChannel = Math.min(r, g, b);
  const maxChannel = Math.max(r, g, b);
  return minChannel >= 255 - tolerance && maxChannel - minChannel <= 18;
}

/**
 * Removes the solid white background from a loaded sprite image using border flood-fill
 * plus pure-white interior gap clearing, then auto-crops and bottom-aligns the character
 * into a 512x640 transparent canvas.
 *
 * @param img - Loaded HTMLImageElement from `/art/*.png`.
 * @param outputCanvas - Target 512x640 HTMLCanvasElement to draw the keyed character into.
 */
function processChromaKeyAndCrop(img: HTMLImageElement, outputCanvas: HTMLCanvasElement): void {
  const srcW = img.naturalWidth || img.width || 512;
  const srcH = img.naturalHeight || img.height || 512;

  const workCanvas = document.createElement('canvas');
  workCanvas.width = srcW;
  workCanvas.height = srcH;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true })!;
  workCtx.drawImage(img, 0, 0, srcW, srcH);

  const imgData = workCtx.getImageData(0, 0, srcW, srcH);
  const data = imgData.data;
  const totalPixels = srcW * srcH;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueueIfBg = (x: number, y: number): void => {
    if (x < 0 || x >= srcW || y < 0 || y >= srcH) {
      return;
    }
    const idx = y * srcW + x;
    if (visited[idx]) {
      return;
    }
    const p = idx * 4;
    if (isNearWhiteBackground(data[p], data[p + 1], data[p + 2], 26)) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  // Seed flood-fill from all 4 outer edges
  for (let x = 0; x < srcW; x++) {
    enqueueIfBg(x, 0);
    enqueueIfBg(x, srcH - 1);
  }
  for (let y = 0; y < srcH; y++) {
    enqueueIfBg(0, y);
    enqueueIfBg(srcW - 1, y);
  }

  // BFS flood-fill from borders
  while (head < tail) {
    const curr = queue[head++];
    const p = curr * 4;
    data[p + 3] = 0; // Transparent

    const cx = curr % srcW;
    const cy = (curr - cx) / srcW;
    enqueueIfBg(cx - 1, cy);
    enqueueIfBg(cx + 1, cy);
    enqueueIfBg(cx, cy - 1);
    enqueueIfBg(cx, cy + 1);
  }

  // Also clear enclosed pure-white studio gaps (e.g. between arm and waist or inside brass loops)
  for (let i = 0; i < totalPixels; i++) {
    if (visited[i]) {
      continue;
    }
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (r >= 250 && g >= 250 && b >= 250) {
      data[p + 3] = 0;
      visited[i] = 1;
    }
  }

  // Feather 1-pixel boundary edges adjacent to transparent background to prevent white halos
  for (let y = 1; y < srcH - 1; y++) {
    for (let x = 1; x < srcW - 1; x++) {
      const idx = y * srcW + x;
      if (visited[idx]) {
        continue;
      }
      const hasTransparentNeighbor =
        visited[idx - 1] ||
        visited[idx + 1] ||
        visited[idx - srcW] ||
        visited[idx + srcW];

      if (hasTransparentNeighbor) {
        const p = idx * 4;
        const brightness = (data[p] + data[p + 1] + data[p + 2]) / 3;
        if (brightness > 215) {
          data[p + 3] = Math.max(0, Math.min(180, Math.round((255 - brightness) * 4.2)));
        }
      }
    }
  }

  workCtx.putImageData(imgData, 0, 0);

  // Compute tight bounding box of remaining character pixels
  let minX = srcW;
  let minY = srcH;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const alpha = data[(y * srcW + x) * 4 + 3];
      if (alpha > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    minX = 0;
    minY = 0;
    maxX = srcW - 1;
    maxY = srcH - 1;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const outW = outputCanvas.width;
  const outH = outputCanvas.height;
  const outCtx = outputCanvas.getContext('2d')!;
  outCtx.clearRect(0, 0, outW, outH);

  const padX = Math.round(outW * 0.05);
  const padTop = Math.round(outH * 0.04);
  const padBottom = Math.round(outH * 0.015);
  const availW = outW - padX * 2;
  const availH = outH - padTop - padBottom;

  const scale = Math.min(availW / cropW, availH / cropH);
  const drawW = Math.round(cropW * scale);
  const drawH = Math.round(cropH * scale);
  const drawX = Math.round((outW - drawW) / 2);
  // Bottom-align character feet so `sprite.center.set(0.5, 0)` places feet on the ground
  const drawY = outH - padBottom - drawH;

  outCtx.drawImage(workCanvas, minX, minY, cropW, cropH, drawX, drawY, drawW, drawH);
}

/**
 * Loads and chroma-keys a character/creature sprite image into a cached `THREE.CanvasTexture`.
 * Returns immediately with a texture whose canvas is populated asynchronously once the PNG loads.
 *
 * @param url - Public URL path (e.g. `/art/librarian-aurelius.png`).
 * @param fallbackColorHex - Accent color used for an initial placeholder silhouette before PNG load.
 * @returns Cached `THREE.CanvasTexture` configured with `SRGBColorSpace`.
 */
export function getChromaKeyedSpriteTexture(
  url: string,
  fallbackColorHex = 0xd4af37
): THREE.CanvasTexture {
  logFunctionCall('getChromaKeyedSpriteTexture', { url });

  const existing = textureCache.get(url);
  if (existing) {
    return existing;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  // Draw a subtle warm painterly silhouette placeholder until the PNG finishes loading
  const hexCss = `#${fallbackColorHex.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hexCss;
  ctx.beginPath();
  ctx.arc(256, 170, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(155, 620);
  ctx.lineTo(195, 250);
  ctx.lineTo(317, 250);
  ctx.lineTo(357, 620);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textureCache.set(url, texture);

  if (!pendingLoads.has(url)) {
    const loadPromise = new Promise<THREE.CanvasTexture>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          processChromaKeyAndCrop(img, canvas);
          texture.needsUpdate = true;
        } catch (err) {
          console.warn(`Sprite chroma-key warning for ${url}:`, err);
        }
        resolve(texture);
      };
      img.onerror = () => {
        console.warn(`Sprite image failed to load from ${url}, keeping silhouette fallback.`);
        resolve(texture);
      };
      img.src = url;
    });
    pendingLoads.set(url, loadPromise);
  }

  return texture;
}

/**
 * Creates a camera-facing `THREE.Sprite` billboard for a character or tier creature.
 * The sprite's anchor point (`center`) is set to `(0.5, 0.0)` so `position.y` places
 * the character's feet directly on the floor, shelf, or pedestal.
 *
 * @param params - Sprite URL, world width/height in meters, optional tint, and `userData` for raycasting.
 * @returns Configured `THREE.Sprite` instance.
 */
export function createBillboardSprite(params: {
  url: string;
  width: number;
  height: number;
  fallbackColorHex?: number;
  tintHex?: number;
  userData?: Record<string, unknown>;
}): THREE.Sprite {
  logFunctionCall('createBillboardSprite', {
    url: params.url,
    width: params.width,
    height: params.height,
  });

  const texture = getChromaKeyedSpriteTexture(params.url, params.fallbackColorHex ?? 0xd4af37);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: params.tintHex ?? 0xffffff,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.0);
  sprite.scale.set(params.width, params.height, 1);
  if (params.userData) {
    sprite.userData = { ...params.userData };
  }
  return sprite;
}
