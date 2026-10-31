/**
 * @file decorativeBooksInstancer.ts
 * @description Procedural `THREE.InstancedMesh` generator for dressing the Victorian library
 * shelves with hundreds of muted leather-bound decorative volumes (Milestone 3 Priority 2).
 *
 * Features:
 * 1. Renders hundreds of varied decorative books in a single draw call using `THREE.InstancedMesh`
 *    and per-instance `setColorAt` attributes.
 * 2. Varies book spine thickness, height, depth, recessed shelf offset, and slight lean (`rotZ`)
 *    using a deterministic PRNG so shelves look organically lived-in.
 * 3. Respects reserved X-axis slots on shelves where real verified `Source` books and their
 *    perched tier creatures are placed, so decorative volumes frame real sources without overlapping.
 * 4. Builds additional perimeter wall bookcases around the Victorian rotunda so the entire room
 *    feels surrounded by scholarly collections.
 *
 * Use cases:
 * 1. Called by `buildThemedShelvesAndBooks` in `bookShelfBuilder.ts` whenever the Hub shelves are built.
 */

import * as THREE from 'three';
import { logFunctionCall } from '../shared/logger';

/** Reserved horizontal interval on a specific shelf plank where a real `Source` book sits. */
export interface ReservedShelfSlot {
  shelfY: number;
  centerX: number;
  halfWidth: number;
}

/** Descriptor for a bookcase whose shelves should be filled with decorative instanced books. */
export interface BookcaseDressingSpec {
  /** World-space transformation matrix of the bookcase group. */
  worldMatrix: THREE.Matrix4;
  /** Usable horizontal span of each shelf plank in meters (e.g. 3.1m). */
  shelfSpanX: number;
  /** Y coordinates (in bookcase-local space) of the top surface of each shelf plank. */
  shelfSurfaceYs: number[];
  /** Reserved slots on shelves where real verified `Source` books sit. */
  reservedSlots: ReservedShelfSlot[];
}

/** Muted antique Victorian leather palette (dark mahogany, russet, forest, slate, umber, oxblood). */
const MUTED_LEATHER_PALETTE = [
  0x3b2217, // dark mahogany
  0x2c1b12, // espresso leather
  0x462b1d, // worn russet
  0x242e25, // muted hunter green
  0x361f24, // faded oxblood burgundy
  0x232733, // dusty slate navy
  0x473621, // antique ochre-brown
  0x31251b, // raw umber
  0x3d2b24, // warm walnut
  0x29231e, // aged charcoal-brown
];

/**
 * Simple deterministic pseudo-random generator (`0..1`) so decorative shelves are stable across rebuilds.
 *
 * @param seed - Integer seed state.
 * @returns Next pseudo-random float in `[0, 1)`.
 */
function seededRandom(seed: { value: number }): number {
  seed.value = (seed.value * 1664525 + 1013904223) >>> 0;
  return seed.value / 0xffffffff;
}

/**
 * Checks whether a candidate horizontal range `[xMin, xMax]` on `shelfY` overlaps any reserved real-book slot.
 *
 * @param shelfY - Shelf plank Y coordinate.
 * @param xMin - Left edge of candidate decorative book.
 * @param xMax - Right edge of candidate decorative book.
 * @param reservedSlots - Array of reserved slots for real `Source` books.
 * @returns True if the candidate overlaps a reserved slot.
 */
function overlapsReservedSlot(
  shelfY: number,
  xMin: number,
  xMax: number,
  reservedSlots: ReservedShelfSlot[]
): boolean {
  for (const slot of reservedSlots) {
    if (Math.abs(slot.shelfY - shelfY) > 0.15) {
      continue;
    }
    const slotMin = slot.centerX - slot.halfWidth;
    const slotMax = slot.centerX + slot.halfWidth;
    if (xMax >= slotMin && xMin <= slotMax) {
      return true;
    }
  }
  return false;
}

/**
 * Populates all provided bookcases with hundreds of procedurally varied decorative books
 * using a single `THREE.InstancedMesh` for leather bodies and a second `THREE.InstancedMesh`
 * for subtle antique brass spine bands.
 *
 * @param scene - Target Three.js scene to attach the `InstancedMesh` objects to.
 * @param bookcases - List of bookcase dressing specifications (aisle bookcases + wall bookcases).
 * @returns Group containing the instanced decorative book meshes.
 */
export function buildDecorativeLibraryBooks(
  scene: THREE.Scene,
  bookcases: BookcaseDressingSpec[]
): THREE.Group {
  logFunctionCall('buildDecorativeLibraryBooks', { bookcaseCount: bookcases.length });

  const seed = { value: 18870421 };

  interface InstanceTransform {
    matrix: THREE.Matrix4;
    bandMatrix: THREE.Matrix4;
    colorHex: number;
  }

  const instances: InstanceTransform[] = [];
  const localPos = new THREE.Vector3();
  const localQuat = new THREE.Quaternion();
  const localScale = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();
  const bandLocalMatrix = new THREE.Matrix4();
  const euler = new THREE.Euler();

  for (const bookcase of bookcases) {
    const halfSpan = bookcase.shelfSpanX / 2;

    for (const shelfY of bookcase.shelfSurfaceYs) {
      let cursorX = -halfSpan + 0.06;

      while (cursorX < halfSpan - 0.08) {
        const width = 0.065 + seededRandom(seed) * 0.075; // 6.5cm - 14cm spine width
        const height = 0.36 + seededRandom(seed) * 0.24; // 36cm - 60cm book height
        const depth = 0.25 + seededRandom(seed) * 0.08; // 25cm - 33cm book depth
        const gap = 0.006 + seededRandom(seed) * 0.018;

        const xMin = cursorX;
        const xMax = cursorX + width;

        if (xMax > halfSpan - 0.04) {
          break;
        }

        // Skip intervals reserved for real standout Source books + their perched creature
        if (overlapsReservedSlot(shelfY, xMin, xMax, bookcase.reservedSlots)) {
          cursorX += width + 0.04;
          continue;
        }

        // Occasional small gap between clusters of decorative books so some books lean naturally
        const clusterGapRoll = seededRandom(seed);
        const leanZ =
          clusterGapRoll > 0.86
            ? (seededRandom(seed) - 0.5) * 0.22
            : (seededRandom(seed) - 0.5) * 0.07;

        const centerX = cursorX + width * 0.5;
        const centerY = shelfY + height * 0.5;
        // Recessed slightly on the shelf (-0.03 to +0.02) so real books at z=+0.28 stand out
        const centerZ = -0.025 + (seededRandom(seed) - 0.5) * 0.04;

        localPos.set(centerX, centerY, centerZ);
        euler.set(0, (seededRandom(seed) - 0.5) * 0.04, leanZ);
        localQuat.setFromEuler(euler);
        localScale.set(width, height, depth);

        localMatrix.compose(localPos, localQuat, localScale);
        const worldMat = new THREE.Matrix4().multiplyMatrices(bookcase.worldMatrix, localMatrix);

        // Subtle gold/brass spine band near upper third of the decorative book
        localPos.set(centerX, shelfY + height * 0.72, centerZ + 0.005);
        localScale.set(width * 1.02, 0.035, depth * 1.02);
        bandLocalMatrix.compose(localPos, localQuat, localScale);
        const bandWorldMat = new THREE.Matrix4().multiplyMatrices(
          bookcase.worldMatrix,
          bandLocalMatrix
        );

        const colorHex =
          MUTED_LEATHER_PALETTE[
            Math.floor(seededRandom(seed) * MUTED_LEATHER_PALETTE.length)
          ];

        instances.push({
          matrix: worldMat,
          bandMatrix: bandWorldMat,
          colorHex,
        });

        cursorX += width + gap + (clusterGapRoll > 0.9 ? 0.06 : 0);
      }
    }
  }

  const group = new THREE.Group();
  const count = instances.length;
  if (count === 0) {
    scene.add(group);
    return group;
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.08,
  });

  const bookInstancedMesh = new THREE.InstancedMesh(unitBox, leatherMat, count);
  const tempColor = new THREE.Color();

  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x8c6d32,
    roughness: 0.45,
    metalness: 0.55,
  });
  const bandInstancedMesh = new THREE.InstancedMesh(unitBox, bandMat, count);

  for (let i = 0; i < count; i++) {
    const inst = instances[i];
    bookInstancedMesh.setMatrixAt(i, inst.matrix);
    tempColor.setHex(inst.colorHex);
    bookInstancedMesh.setColorAt(i, tempColor);
    bandInstancedMesh.setMatrixAt(i, inst.bandMatrix);
  }

  bookInstancedMesh.instanceMatrix.needsUpdate = true;
  if (bookInstancedMesh.instanceColor) {
    bookInstancedMesh.instanceColor.needsUpdate = true;
  }
  bandInstancedMesh.instanceMatrix.needsUpdate = true;

  group.add(bookInstancedMesh);
  group.add(bandInstancedMesh);
  scene.add(group);

  return group;
}
