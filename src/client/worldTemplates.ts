/**
 * @file worldTemplates.ts
 * @description Reusable 3D scene templates and tier-specific Full-Text Objects for each of the
 * five academic authority tiers in "The Library of Worlds":
 *
 * 1. `imp`        — Bustling Market        + Town Notice Board
 * 2. `goblin`     — Tinkerer's Workshop    + Workbench Blueprint
 * 3. `apprentice` — Candlelit Study        + Unrolled Parchment
 * 4. `wizard`     — Tower Observatory      + Carved Stone Tablet
 * 5. `archmage`   — Grand Vaulted Hall     + Illuminated Manuscript on a Lectern
 *
 * Use Cases:
 * - Called by `WorldSceneController.loadSourceWorld` to populate the 360° environment and
 *   clickable Full-Text Object for any book world so each tier feels visually distinct and memorable.
 * - Returns `animatedProps` (e.g., goblin workshop cogwheels, wizard armillary rings, archmage
 *   floating chandeliers) that `WorldSceneController.update` animates each frame.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source, SourceTier } from '../shared/types';
import { createLabelTexture } from './bookShelfBuilder';

export interface BuiltWorldTemplate {
  group: THREE.Group;
  animatedProps: Array<{
    object: THREE.Object3D;
    axis: 'x' | 'y' | 'z';
    speed: number;
  }>;
}

/**
 * Helper to tag all meshes inside a group with `userData` so raycasting recognizes clicks anywhere on a prop.
 *
 * @param root - Root object or group to tag recursively.
 * @param userData - UserData payload to assign to every child object.
 */
function tagInteractableRecursive(root: THREE.Object3D, userData: Record<string, unknown>): void {
  root.userData = { ...root.userData, ...userData };
  for (const child of root.children) {
    tagInteractableRecursive(child, userData);
  }
}

/**
 * Builds the 360° environmental setting corresponding to the source's authority tier.
 *
 * @param source - The `Source` whose world is being entered.
 * @returns `BuiltWorldTemplate` containing the environment `THREE.Group` and any animated props.
 */
export function buildTierWorldEnvironment(source: Source): BuiltWorldTemplate {
  logFunctionCall('buildTierWorldEnvironment', {
    sourceId: source.id,
    tier: source.tier,
  });

  switch (source.tier) {
    case 'imp':
      return buildImpMarketEnvironment();
    case 'goblin':
      return buildGoblinWorkshopEnvironment();
    case 'apprentice':
      return buildApprenticeStudyEnvironment();
    case 'wizard':
      return buildWizardObservatoryEnvironment();
    case 'archmage':
      return buildArchmageHallEnvironment();
  }
}

/**
 * Builds the Imp tier setting: a Bustling Market with cobblestone floor, striped market stalls,
 * stacked wooden crates/barrels, and warm hanging festival lanterns.
 */
function buildImpMarketEnvironment(): BuiltWorldTemplate {
  const group = new THREE.Group();
  const animatedProps: BuiltWorldTemplate['animatedProps'] = [];

  // Cobblestone market square floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 5.8, 36),
    new THREE.MeshStandardMaterial({
      color: 0x6b3e26,
      roughness: 0.8,
      side: THREE.DoubleSide,
    })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  group.add(innerRing);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x855834, roughness: 0.75 });
  const awningColors = [0xd97706, 0xb91c1c, 0x059669, 0x7c3aed, 0xe11d48, 0xd97706];

  // 6 perimeter market stalls
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    const stall = new THREE.Group();
    stall.position.set(Math.cos(angle) * 9.8, 0, Math.sin(angle) * 9.8);
    stall.lookAt(0, 1.2, 0);

    // Counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.95, 1.1), woodMat);
    counter.position.y = 0.48;
    stall.add(counter);

    // Support poles
    for (const px of [-1.25, 1.25]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8), woodMat);
      pole.position.set(px, 1.4, 0);
      stall.add(pole);
    }

    // Slanted colourful awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 0.14, 1.5),
      new THREE.MeshStandardMaterial({ color: awningColors[i % awningColors.length], roughness: 0.6 })
    );
    awning.position.set(0, 2.75, 0.1);
    awning.rotation.x = 0.25;
    stall.add(awning);

    // Crates & barrels beside the stall
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), crateMat);
    crate.position.set(1.75, 0.33, 0.2);
    crate.rotation.y = 0.3;
    stall.add(crate);

    // Hanging market lantern
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
      })
    );
    lantern.position.set(0, 2.4, 0.65);
    stall.add(lantern);

    group.add(stall);
  }

  return { group, animatedProps };
}

/**
 * Builds the Goblin tier setting: a Tinkerer's Workshop with riveted iron floor,
 * heavy workbenches, copper steam pipes, and rotating interlocking brass cogwheels.
 */
function buildGoblinWorkshopEnvironment(): BuiltWorldTemplate {
  const group = new THREE.Group();
  const animatedProps: BuiltWorldTemplate['animatedProps'] = [];

  // Riveted workshop slate floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x262925, roughness: 0.65, metalness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.78,
    roughness: 0.28,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xb87333,
    metalness: 0.72,
    roughness: 0.32,
  });

  // 8 copper steam-pipe columns & interlocking rotating brass gears
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const colGroup = new THREE.Group();
    colGroup.position.set(Math.cos(angle) * 9.6, 0, Math.sin(angle) * 9.6);
    colGroup.lookAt(0, 2.0, 0);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 6.2, 12), copperMat);
    pipe.position.y = 3.1;
    colGroup.add(pipe);

    // Rotating cogwheel mounted on the column
    const gearGroup = new THREE.Group();
    gearGroup.position.set(0, 2.8 + (i % 2) * 0.7, 0.32);

    const gearWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.14, 16), brassMat);
    gearWheel.rotation.x = Math.PI / 2;
    gearGroup.add(gearWheel);

    for (let t = 0; t < 8; t++) {
      const toothAngle = (t / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.16), brassMat);
      tooth.position.set(Math.cos(toothAngle) * 0.9, Math.sin(toothAngle) * 0.9, 0);
      tooth.rotation.z = toothAngle;
      gearGroup.add(tooth);
    }

    colGroup.add(gearGroup);
    animatedProps.push({
      object: gearGroup,
      axis: 'z',
      speed: i % 2 === 0 ? 0.55 : -0.55,
    });

    group.add(colGroup);
  }

  return { group, animatedProps };
}

/**
 * Builds the Apprentice tier setting: a Candlelit Study with polished timber floor,
 * crimson scholar carpet, perimeter bookcases, and flickering brass candelabras.
 */
function buildApprenticeStudyEnvironment(): BuiltWorldTemplate {
  const group = new THREE.Group();
  const animatedProps: BuiltWorldTemplate['animatedProps'] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(6.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.85 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.02;
  group.add(rug);

  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3d2415, roughness: 0.65 });
  const candleMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
  });

  // 8 perimeter study bookcases and candle stands
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const studyUnit = new THREE.Group();
    studyUnit.position.set(Math.cos(angle) * 9.8, 0, Math.sin(angle) * 9.8);
    studyUnit.lookAt(0, 1.5, 0);

    const bookcase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.4, 0.55), shelfMat);
    bookcase.position.y = 2.2;
    studyUnit.add(bookcase);

    const candleStand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.22, 1.35, 10),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 })
    );
    candleStand.position.set(1.4, 0.68, 0.6);
    studyUnit.add(candleStand);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), candleMat);
    flame.position.set(1.4, 1.42, 0.6);
    studyUnit.add(flame);

    group.add(studyUnit);
  }

  return { group, animatedProps };
}

/**
 * Builds the Wizard tier setting: a Tower Observatory with carved stone parapet,
 * giant brass telescope pointing skyward, and rotating celestial armillary rings overhead.
 */
function buildWizardObservatoryEnvironment(): BuiltWorldTemplate {
  const group = new THREE.Group();
  const animatedProps: BuiltWorldTemplate['animatedProps'] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x1e1b38, roughness: 0.45, metalness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.82,
    roughness: 0.22,
  });

  // Inlaid brass astrolabe circles on floor
  for (const r of [3.5, 5.8, 8.2]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.08, 48),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
  }

  // Stone observatory pillars around perimeter
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x312e52, roughness: 0.6 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 6.5, 14), stoneMat);
    pillar.position.set(Math.cos(angle) * 9.8, 3.25, Math.sin(angle) * 9.8);
    group.add(pillar);
  }

  // Overhead rotating Armillary Sphere rings + Brass Telescope
  for (let rIdx = 0; rIdx < 3; rIdx++) {
    const armillaryRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.6 + rIdx * 0.75, 0.06, 12, 48),
      brassMat
    );
    armillaryRing.position.set(0, 6.2, 0);
    armillaryRing.rotation.x = 0.4 + rIdx * 0.5;
    group.add(armillaryRing);
    animatedProps.push({
      object: armillaryRing,
      axis: rIdx % 2 === 0 ? 'y' : 'x',
      speed: 0.28 * (rIdx % 2 === 0 ? 1 : -1),
    });
  }

  // Giant brass telescope on upper platform
  const telescopeTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 4.2, 16),
    brassMat
  );
  telescopeTube.position.set(-3.2, 4.8, -6.5);
  telescopeTube.rotation.z = -0.55;
  telescopeTube.rotation.x = 0.35;
  group.add(telescopeTube);

  return { group, animatedProps };
}

/**
 * Builds the Archmage tier setting: a Grand Vaulted Hall with cream-and-gold marble floor,
 * fluted Corinthian columns, golden vault ribs, and slowly rotating radiant halo chandeliers.
 */
function buildArchmageHallEnvironment(): BuiltWorldTemplate {
  const group = new THREE.Group();
  const animatedProps: BuiltWorldTemplate['animatedProps'] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x362b18, roughness: 0.32, metalness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.35,
    metalness: 0.85,
    roughness: 0.18,
  });
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0e6,
    roughness: 0.35,
    metalness: 0.1,
  });

  // 8 soaring fluted marble columns & golden vault arches
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 7.5, 16), marbleMat);
    col.position.set(Math.cos(angle) * 9.8, 3.75, Math.sin(angle) * 9.8);
    group.add(col);

    const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.4, 0.45, 16), goldMat);
    capital.position.set(Math.cos(angle) * 9.8, 7.5, Math.sin(angle) * 9.8);
    group.add(capital);
  }

  // Slowly rotating golden halo chandelier overhead
  const halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.09, 14, 64), goldMat);
  halo.position.set(0, 6.4, 0);
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  animatedProps.push({
    object: halo,
    axis: 'z',
    speed: 0.2,
  });

  return { group, animatedProps };
}

/**
 * Builds the tier-specific clickable Full-Text Object (Notice Board, Blueprint, Parchment,
 * Stone Tablet, or Illuminated Manuscript on a Lectern).
 *
 * @param source - The `Source` whose Full-Text Object is being constructed.
 * @returns `THREE.Group` positioned forward-left in the 360° world and tagged with `interactableType: 'fullText'`.
 */
export function buildTierFullTextObject(source: Source): THREE.Group {
  logFunctionCall('buildTierFullTextObject', {
    sourceId: source.id,
    tier: source.tier,
  });

  const tierInfo = APP_CONFIG.tiers[source.tier];
  const group = new THREE.Group();
  const angle = -0.62;
  const dist = APP_CONFIG.world.fullTextObjectDistance;
  group.position.set(Math.sin(angle) * dist, 0, -Math.cos(angle) * dist);
  group.lookAt(0, 1.3, 0);

  // Build distinct 3D silhouette per tier
  const propGroup = buildTierSpecificPropMesh(source.tier);
  group.add(propGroup);

  // Floating title & action plaque above the Full-Text Object
  const boardTex = createLabelTexture(
    [
      `📜 ${tierInfo.fullTextObjectName}`,
      source.title.slice(0, 34),
      'Click to Read Full Source & Quotes',
    ],
    '#1e1610',
    tierInfo.cssColor,
    '#fef3c7'
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.25, 0.85),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  sign.position.set(0, 2.35, 0.15);
  group.add(sign);

  tagInteractableRecursive(group, { interactableType: 'fullText' });
  return group;
}

/**
 * Constructs the 3D geometry for each tier's specific Full-Text Object:
 * - `imp`: Town Notice Board with twin timber posts, gabled roof, and pinned broadsheets
 * - `goblin`: Workbench Blueprint with drafting table and cyan engineering grid
 * - `apprentice`: Unrolled Parchment on a scholar desk with brass scroll-rods
 * - `wizard`: Carved Stone Tablet monolith with glowing cyan runic border
 * - `archmage`: Illuminated Manuscript on a golden Eagle/Sun Lectern
 */
function buildTierSpecificPropMesh(tier: SourceTier): THREE.Group {
  const prop = new THREE.Group();

  switch (tier) {
    case 'imp': {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
      for (const px of [-0.85, 0.85]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), woodMat);
        post.position.set(px, 0.95, 0);
        prop.add(post);
      }
      const corkBoard = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 1.1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x9a6b3b, roughness: 0.85 })
      );
      corkBoard.position.set(0, 1.25, 0);
      prop.add(corkBoard);

      // Pinned paper notes
      const noteMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 });
      for (const [nx, ny, rot] of [
        [-0.45, 1.32, 0.08],
        [0.12, 1.22, -0.06],
        [0.52, 1.35, 0.04],
      ]) {
        const note = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.02), noteMat);
        note.position.set(nx, ny, 0.06);
        note.rotation.z = rot;
        prop.add(note);
      }
      break;
    }

    case 'goblin': {
      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x374151,
        metalness: 0.65,
        roughness: 0.4,
      });
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.95, 1.05), ironMat);
      table.position.y = 0.48;
      prop.add(table);

      const blueprintSheet = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.06, 0.92),
        new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.45,
          roughness: 0.4,
        })
      );
      blueprintSheet.position.set(0, 1.06, 0);
      blueprintSheet.rotation.x = 0.35;
      prop.add(blueprintSheet);
      break;
    }

    case 'apprentice': {
      const deskMat = new THREE.MeshStandardMaterial({ color: 0x452714, roughness: 0.55 });
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 1.08, 16), deskMat);
      pedestal.position.y = 0.54;
      prop.add(pedestal);

      const parchment = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.05, 0.95),
        new THREE.MeshStandardMaterial({
          color: 0xfef3c7,
          emissive: 0x78350f,
          emissiveIntensity: 0.2,
          roughness: 0.65,
        })
      );
      parchment.position.set(0, 1.15, 0);
      parchment.rotation.x = 0.42;
      prop.add(parchment);

      // Scroll rods
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.75,
        roughness: 0.25,
      });
      for (const pz of [-0.46, 0.46]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 12), brassMat);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(0, 1.15 - pz * 0.4, pz);
        prop.add(rod);
      }
      break;
    }

    case 'wizard': {
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.45, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.5 })
      );
      plinth.position.y = 0.23;
      prop.add(plinth);

      const tablet = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.55, 0.22),
        new THREE.MeshStandardMaterial({
          color: 0x312e81,
          emissive: 0x6366f1,
          emissiveIntensity: 0.4,
          roughness: 0.4,
          metalness: 0.3,
        })
      );
      tablet.position.y = 1.15;
      prop.add(tablet);
      break;
    }

    case 'archmage': {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.35,
        metalness: 0.85,
        roughness: 0.2,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.18, 20), goldMat);
      base.position.y = 0.59;
      prop.add(base);

      // Open Illuminated Manuscript pages
      const folio = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 0.1, 0.95),
        new THREE.MeshStandardMaterial({
          color: 0xfffbeb,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.3,
          roughness: 0.4,
        })
      );
      folio.position.set(0, 1.28, 0);
      folio.rotation.x = 0.45;
      prop.add(folio);
      break;
    }
  }

  return prop;
}
