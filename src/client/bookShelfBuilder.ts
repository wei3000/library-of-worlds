/**
 * @file bookShelfBuilder.ts
 * @description Procedural 3D generator for Victorian bookshelves, themed aisle signs,
 * tier-styled interactive books, and the Victorian gentleman Librarian figure at the central desk.
 *
 * Use cases:
 * 1. Rendering `Source[]` grouped into themed aisles inside the 3D Library Hub.
 * 2. Styling each book by its metadata-derived tier (`imp`, `goblin`, `apprentice`, `wizard`, `archmage`)
 *    with a floating tier crest badge, reading-order number, and completion indicator.
 * 3. Returning world-space coordinates for each book so `lanternPath.ts` can connect them in order.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';
import {
  buildDecorativeLibraryBooks,
  type BookcaseDressingSpec,
  type ReservedShelfSlot,
} from './decorativeBooksInstancer';
import { createBillboardSprite } from './spriteLoader';

export interface BookPlacement {
  source: Source;
  mesh: THREE.Mesh;
  worldPosition: THREE.Vector3;
  floorAnchor: THREE.Vector3;
  pathIndex: number;
}

/**
 * Creates a canvas-backed `THREE.CanvasTexture` displaying crisp Victorian signage or badge labels.
 *
 * @param lines - Lines of text to render onto the label canvas.
 * @param bgColor - CSS background fill colour.
 * @param borderColor - CSS border and accent colour.
 * @param textColor - CSS text fill colour.
 * @returns Configured `THREE.CanvasTexture`.
 */
export function createLabelTexture(
  lines: string[],
  bgColor = '#1c130d',
  borderColor = '#d4af37',
  textColor = '#fef3c7'
): THREE.CanvasTexture {
  logFunctionCall('createLabelTexture', { lines, bgColor, borderColor });
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, idx) => {
    const fontSize = idx === 0 ? 34 : 24;
    ctx.font = `${idx === 0 ? 'bold ' : ''}${fontSize}px Georgia, serif`;
    const y = (canvas.height / (lines.length + 1)) * (idx + 1);
    ctx.fillText(line.slice(0, 36), canvas.width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the Victorian Librarian gentleman figure and his central mahogany desk in the Hub.
 *
 * @param scene - Target Three.js scene.
 * @returns Group representing the clickable Librarian & desk.
 */
export function buildLibrarianDesk(scene: THREE.Scene): THREE.Group {
  logFunctionCall('buildLibrarianDesk', {});
  const group = new THREE.Group();
  group.position.set(0, 0, -4.5);

  // Mahogany desk
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3b1e0e, roughness: 0.6 });
  const deskMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.05, 1.4), deskMat);
  deskMesh.position.y = 0.525;
  group.add(deskMesh);

  // Brass desk lamp
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.7,
    roughness: 0.3,
  });
  const lampStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.55, 12), brassMat);
  lampStand.position.set(-1.1, 1.32, 0.2);
  group.add(lampStand);

  const lampGlow = new THREE.PointLight(0xffb347, 2.2, 9);
  lampGlow.position.set(-1.1, 1.65, 0.2);
  group.add(lampGlow);

  // Great Kiskadee perched by the Librarian's desk (yellow breast, brown back, black-and-white head)
  const kiskadeeGroup = new THREE.Group();
  kiskadeeGroup.position.set(1.15, 1.22, 0.25);
  const birdBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
  );
  kiskadeeGroup.add(birdBody);
  const birdHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x1e1b18 })
  );
  birdHead.position.set(0, 0.14, 0.06);
  kiskadeeGroup.add(birdHead);
  group.add(kiskadeeGroup);

  // Victorian Gentleman Librarian (Nano Banana camera-facing billboard sprite)
  const librarianGroup = new THREE.Group();
  librarianGroup.position.set(0, 0, -0.95);

  const librarianSprite = createBillboardSprite({
    url: APP_CONFIG.art.librarian,
    width: 1.85,
    height: 2.35,
    fallbackColorHex: 0xd4af37,
    userData: { interactableType: 'librarian' },
  });
  librarianSprite.position.set(0, 0, 0);
  librarianGroup.add(librarianSprite);

  // Floating nameplate above Librarian
  const signTex = createLabelTexture(
    ['Aurelius Finch — Head Librarian', 'Click to Pose Research Question'],
    '#1f140e',
    '#d4af37',
    '#fde68a'
  );
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.72),
    new THREE.MeshBasicMaterial({ map: signTex })
  );
  signMesh.position.set(0, 2.65, 0);
  signMesh.userData = { interactableType: 'librarian' };
  librarianGroup.add(signMesh);

  group.add(librarianGroup);
  scene.add(group);
  return group;
}

/**
 * Builds themed Victorian bookcases and populates them with interactive 3D books for each `Source`.
 *
 * @param scene - Three.js Hub scene.
 * @param sources - Verified `Source[]` items to place on shelves.
 * @param readingPath - Ordered list of `sourceId`s (`imp` -> `archmage`).
 * @param completedMap - Map of `sourceId -> boolean` indicating completed books.
 * @returns Array of `BookPlacement` descriptors with interactive meshes and floor positions.
 */
export function buildThemedShelvesAndBooks(
  scene: THREE.Scene,
  sources: Source[],
  readingPath: string[],
  completedMap: Record<string, boolean>
): BookPlacement[] {
  logFunctionCall('buildThemedShelvesAndBooks', {
    sourceCount: sources.length,
    readingPath,
  });

  // Group sources by theme (3-5 aisles)
  const themeGroups = new Map<string, Source[]>();
  for (const src of sources) {
    const theme = src.theme || 'General Collection';
    const list = themeGroups.get(theme) ?? [];
    list.push(src);
    themeGroups.set(theme, list);
  }

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2e190d, roughness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xb48a3e,
    metalness: 0.45,
    roughness: 0.4,
  });

  // Aisle positions arranged in a semi-circle around the central Librarian desk
  const aisleLocations = [
    { x: -6.2, z: -2.0, rotY: Math.PI * 0.32 },
    { x: -3.6, z: -7.5, rotY: Math.PI * 0.12 },
    { x: 3.6, z: -7.5, rotY: -Math.PI * 0.12 },
    { x: 6.2, z: -2.0, rotY: -Math.PI * 0.32 },
    { x: 0.0, z: -9.5, rotY: 0 },
  ];

  const placements: BookPlacement[] = [];
  const bookcaseSpecs: BookcaseDressingSpec[] = [];
  let themeIdx = 0;

  for (const [themeName, themeSources] of themeGroups.entries()) {
    const loc = aisleLocations[themeIdx % aisleLocations.length];
    themeIdx++;

    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(loc.x, 0, loc.z);
    shelfGroup.rotation.y = loc.rotY;

    // Bookcase frame & side pilasters
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.85, 0.18), woodMat);
    backPanel.position.set(0, 1.925, -0.25);
    shelfGroup.add(backPanel);

    for (const sideX of [-1.72, 1.72]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.85, 0.72), woodMat);
      pilaster.position.set(sideX, 1.925, 0.02);
      shelfGroup.add(pilaster);
    }

    // 4 horizontal shelf planks (top surfaces at shelfY + 0.05)
    const shelfPlankYs = [0.65, 1.45, 2.25, 3.05];
    for (const shelfY of shelfPlankYs) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.1, 0.68), woodMat);
      plank.position.set(0, shelfY, 0.05);
      shelfGroup.add(plank);
    }

    // Ornate large top header sign with Theme Name (only aisle signs in 3D; book details live in hover card)
    const aisleSignTex = createLabelTexture(
      [`Aisle ${themeIdx}: ${themeName}`, `${themeSources.length} Verified Source(s)`],
      '#23140b',
      '#d4af37',
      '#fef08a'
    );
    const aisleSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 0.92),
      new THREE.MeshBasicMaterial({ map: aisleSignTex })
    );
    aisleSign.position.set(0, 4.22, 0.22);
    shelfGroup.add(aisleSign);

    // Warm overhead sconce light per bookcase
    const sconceLight = new THREE.PointLight(0xffbe6b, 1.8, 7.5);
    sconceLight.position.set(0, 3.2, 1.15);
    shelfGroup.add(sconceLight);

    const reservedSlots: ReservedShelfSlot[] = [];

    // Place each verified Source book onto the middle/lower reachable shelves, pulled half out
    themeSources.forEach((source, idx) => {
      const tierInfo = APP_CONFIG.tiers[source.tier];
      const pathOrder = readingPath.indexOf(source.id) + 1;
      const isCompleted = Boolean(completedMap[source.id]);

      const bookGroup = new THREE.Group();
      const offsetX = (idx - (themeSources.length - 1) / 2) * 1.12;
      const plankY = idx % 2 === 0 ? 1.45 : 0.65;
      const shelfTopY = plankY + 0.05;

      // Reserve horizontal space on this shelf plank so decorative books frame the real book + creature
      reservedSlots.push({
        shelfY: shelfTopY,
        centerX: offsetX + 0.12,
        halfWidth: 0.56,
      });

      // Pulled half out from the shelf (z = 0.29 vs recessed decorative books at z = -0.025)
      bookGroup.position.set(offsetX, shelfTopY + 0.34, 0.29);

      // Interactive 3D book tome with standout tier glow
      const bookMat = new THREE.MeshStandardMaterial({
        color: tierInfo.colorHex,
        roughness: 0.28,
        metalness: 0.24,
        emissive: tierInfo.colorHex,
        emissiveIntensity: isCompleted ? 0.65 : 0.42,
      });
      const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.42), bookMat);
      bookMesh.rotation.y = -0.08;
      bookMesh.userData = {
        interactableType: 'book',
        sourceId: source.id,
      };
      bookGroup.add(bookMesh);

      // Gold spine band
      const spineBand = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), trimMat);
      spineBand.rotation.y = -0.08;
      spineBand.userData = {
        interactableType: 'book',
        sourceId: source.id,
      };
      bookGroup.add(spineBand);

      // Soft point light glow in the book's tier colour
      const bookGlow = new THREE.PointLight(tierInfo.colorHex, isCompleted ? 1.6 : 1.15, 2.2);
      bookGlow.position.set(0, 0.08, 0.32);
      bookGroup.add(bookGlow);

      // Camera-facing tier creature billboard sprite perched beside the pulled-out book
      const creatureSprite = createBillboardSprite({
        url: APP_CONFIG.art.creatures[source.tier],
        width: 0.5,
        height: 0.6,
        fallbackColorHex: tierInfo.colorHex,
        userData: {
          interactableType: 'book',
          sourceId: source.id,
        },
      });
      creatureSprite.position.set(0.38, -0.34, 0.04);
      bookGroup.add(creatureSprite);

      shelfGroup.add(bookGroup);
      shelfGroup.updateMatrixWorld(true);

      const worldPos = new THREE.Vector3();
      bookMesh.getWorldPosition(worldPos);

      const floorAnchor = new THREE.Vector3(offsetX, 0.08, 1.25);
      floorAnchor.applyMatrix4(shelfGroup.matrixWorld);
      floorAnchor.y = 0.08;

      placements.push({
        source,
        mesh: bookMesh,
        worldPosition: worldPos,
        floorAnchor,
        pathIndex: pathOrder,
      });
    });

    scene.add(shelfGroup);
    shelfGroup.updateMatrixWorld(true);

    bookcaseSpecs.push({
      worldMatrix: shelfGroup.matrixWorld.clone(),
      shelfSpanX: 3.18,
      shelfSurfaceYs: shelfPlankYs.map((y) => y + 0.05),
      reservedSlots,
    });
  }

  // Also dress the perimeter Victorian walls with grand floor-to-ceiling bookcases
  const wallBookcaseLocations = [
    { x: -12.6, z: -7.5, rotY: Math.PI / 2 },
    { x: -12.6, z: -2.0, rotY: Math.PI / 2 },
    { x: -12.6, z: 3.5, rotY: Math.PI / 2 },
    { x: 12.6, z: -7.5, rotY: -Math.PI / 2 },
    { x: 12.6, z: -2.0, rotY: -Math.PI / 2 },
    { x: 12.6, z: 3.5, rotY: -Math.PI / 2 },
    { x: -7.5, z: -12.6, rotY: 0 },
    { x: 7.5, z: -12.6, rotY: 0 },
  ];

  const wallShelfPlankYs = [0.55, 1.35, 2.15, 2.95, 3.75];
  for (const wLoc of wallBookcaseLocations) {
    const wallCase = new THREE.Group();
    wallCase.position.set(wLoc.x, 0, wLoc.z);
    wallCase.rotation.y = wLoc.rotY;

    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.16), woodMat);
    backPanel.position.set(0, 2.3, -0.25);
    wallCase.add(backPanel);

    for (const shelfY of wallShelfPlankYs) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.1, 0.62), woodMat);
      plank.position.set(0, shelfY, 0.04);
      wallCase.add(plank);
    }

    scene.add(wallCase);
    wallCase.updateMatrixWorld(true);

    bookcaseSpecs.push({
      worldMatrix: wallCase.matrixWorld.clone(),
      shelfSpanX: 3.85,
      shelfSurfaceYs: wallShelfPlankYs.map((y) => y + 0.05),
      reservedSlots: [],
    });
  }

  // Populate all aisle and wall bookcases with hundreds of varied decorative books via InstancedMesh
  buildDecorativeLibraryBooks(scene, bookcaseSpecs);

  return placements.sort((a, b) => a.pathIndex - b.pathIndex);
}
