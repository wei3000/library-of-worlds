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
    const fontSize = idx === 0 ? 30 : 22;
    ctx.font = `${idx === 0 ? 'bold ' : ''}${fontSize}px Georgia, serif`;
    const y = (canvas.height / (lines.length + 1)) * (idx + 1);
    ctx.fillText(line.slice(0, 38), canvas.width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
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

  // Victorian Gentleman Librarian (tailcoat, waistcoat, pocket watch chain, top hat)
  const librarianGroup = new THREE.Group();
  librarianGroup.position.set(0, 0, -0.95);

  const coatMat = new THREE.MeshStandardMaterial({ color: 0x1a1829, roughness: 0.7 });
  const waistcoatMat = new THREE.MeshStandardMaterial({ color: 0x5c1d24, roughness: 0.5 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8cbb1, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.35, 16), coatMat);
  torso.position.y = 1.15;
  torso.userData = { interactableType: 'librarian' };
  librarianGroup.add(torso);

  const waistcoat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.22), waistcoatMat);
  waistcoat.position.set(0, 1.25, 0.24);
  waistcoat.userData = { interactableType: 'librarian' };
  librarianGroup.add(waistcoat);

  // Pocket watch gold chain
  const watchChain = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 8, 20), brassMat);
  watchChain.position.set(0.08, 1.12, 0.36);
  librarianGroup.add(watchChain);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16), skinMat);
  head.position.y = 2.02;
  head.userData = { interactableType: 'librarian' };
  librarianGroup.add(head);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), coatMat);
  hatBrim.position.y = 2.22;
  librarianGroup.add(hatBrim);

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.36, 16), coatMat);
  hatCrown.position.y = 2.41;
  librarianGroup.add(hatCrown);

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
  signMesh.position.set(0, 2.95, 0);
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
  let themeIdx = 0;

  for (const [themeName, themeSources] of themeGroups.entries()) {
    const loc = aisleLocations[themeIdx % aisleLocations.length];
    themeIdx++;

    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(loc.x, 0, loc.z);
    shelfGroup.rotation.y = loc.rotY;

    // Bookcase frame
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.18), woodMat);
    backPanel.position.set(0, 1.8, -0.25);
    shelfGroup.add(backPanel);

    // 3 horizontal shelf planks
    for (const shelfY of [0.7, 1.65, 2.6]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 0.65), woodMat);
      plank.position.set(0, shelfY, 0.05);
      shelfGroup.add(plank);
    }

    // Ornate top header sign with Theme Name
    const aisleSignTex = createLabelTexture(
      [`Aisle ${themeIdx}: ${themeName}`, `${themeSources.length} Verified Source(s)`],
      '#23140b',
      '#d4af37',
      '#fef08a'
    );
    const aisleSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 0.75),
      new THREE.MeshBasicMaterial({ map: aisleSignTex })
    );
    aisleSign.position.set(0, 3.35, 0.18);
    shelfGroup.add(aisleSign);

    // Warm overhead sconce light per bookcase
    const sconceLight = new THREE.PointLight(0xffbe6b, 1.8, 7.5);
    sconceLight.position.set(0, 3.0, 1.1);
    shelfGroup.add(sconceLight);

    // Place each book in this theme onto the middle/lower reachable shelves
    themeSources.forEach((source, idx) => {
      const tierInfo = APP_CONFIG.tiers[source.tier];
      const pathOrder = readingPath.indexOf(source.id) + 1;
      const isCompleted = Boolean(completedMap[source.id]);

      const bookGroup = new THREE.Group();
      const offsetX = (idx - (themeSources.length - 1) / 2) * 1.15;
      const shelfY = idx % 2 === 0 ? 1.72 : 0.78;
      bookGroup.position.set(offsetX, shelfY + 0.35, 0.18);

      // Interactive 3D book tome
      const bookMat = new THREE.MeshStandardMaterial({
        color: tierInfo.colorHex,
        roughness: 0.35,
        metalness: 0.2,
        emissive: tierInfo.colorHex,
        emissiveIntensity: isCompleted ? 0.45 : 0.18,
      });
      const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.38), bookMat);
      bookMesh.userData = {
        interactableType: 'book',
        sourceId: source.id,
      };
      bookGroup.add(bookMesh);

      // Gold spine band
      const spineBand = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.4), trimMat);
      spineBand.userData = {
        interactableType: 'book',
        sourceId: source.id,
      };
      bookGroup.add(spineBand);

      // Floating Tier & Path Order badge above the book
      const statusPrefix = isCompleted ? '✓ COMPLETED' : `Path #${pathOrder}`;
      const badgeTex = createLabelTexture(
        [
          `${statusPrefix} • [${tierInfo.label.toUpperCase()}]`,
          source.title.slice(0, 32),
          tierInfo.creature,
        ],
        isCompleted ? '#064e3b' : '#18121e',
        tierInfo.cssColor,
        '#ffffff'
      );
      const badgePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 0.52),
        new THREE.MeshBasicMaterial({ map: badgeTex })
      );
      badgePlane.position.set(0, 0.62, 0.12);
      badgePlane.userData = {
        interactableType: 'book',
        sourceId: source.id,
      };
      bookGroup.add(badgePlane);

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
  }

  return placements.sort((a, b) => a.pathIndex - b.pathIndex);
}
