/**
 * @file lanternPath.ts
 * @description Renders the glowing Lantern Path on the library floor in "The Library of Worlds".
 * Connects verified books in pedagogical order from easiest (`Imp`) to hardest (`Archmage`),
 * helping first-year students build intuition from accessible explainers before tackling dense
 * peer-reviewed papers and survey reviews.
 *
 * Use cases:
 * 1. Placing numbered floor lanterns in front of each book along `SessionLog.path`.
 * 2. Drawing a glowing golden ribbon along the floor from the Librarian's desk through each book.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { BookPlacement } from './bookShelfBuilder';

/**
 * Builds the glowing floor Lantern Path connecting the Librarian's desk to each book in
 * recommended reading order (`imp` -> `archmage`).
 *
 * @param scene - Three.js Hub scene.
 * @param orderedPlacements - `BookPlacement[]` sorted by `pathIndex`.
 * @param completedMap - Map of `sourceId -> boolean` for completed books.
 * @returns Group containing all path lanterns and glowing path lines.
 */
export function buildLanternPath(
  scene: THREE.Scene,
  orderedPlacements: BookPlacement[],
  completedMap: Record<string, boolean>
): THREE.Group {
  logFunctionCall('buildLanternPath', {
    count: orderedPlacements.length,
  });

  const group = new THREE.Group();
  const waypoints: THREE.Vector3[] = [new THREE.Vector3(0, 0.08, -2.5)];

  orderedPlacements.forEach((placement, idx) => {
    const tierInfo = APP_CONFIG.tiers[placement.source.tier];
    const isDone = Boolean(completedMap[placement.source.id]);
    waypoints.push(placement.floorAnchor.clone());

    // Floor lantern pedestal
    const lanternGroup = new THREE.Group();
    lanternGroup.position.copy(placement.floorAnchor);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2c221e,
      metalness: 0.6,
      roughness: 0.4,
    });
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 12), baseMat);
    baseMesh.position.y = 0.07;
    lanternGroup.add(baseMesh);

    const globeColor = isDone ? 0x10b981 : tierInfo.colorHex;
    const globeMat = new THREE.MeshStandardMaterial({
      color: globeColor,
      emissive: globeColor,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), globeMat);
    globeMesh.position.y = 0.24;
    globeMesh.userData = {
      interactableType: 'book',
      sourceId: placement.source.id,
    };
    lanternGroup.add(globeMesh);

    if (idx < 6) {
      const lanternLight = new THREE.PointLight(globeColor, 0.9, 3.8);
      lanternLight.position.y = 0.35;
      lanternGroup.add(lanternLight);
    }

    group.add(lanternGroup);
  });

  // Glowing golden path tube along the floor
  if (waypoints.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(waypoints);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.045, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tubeMesh);
  }

  scene.add(group);
  return group;
}
