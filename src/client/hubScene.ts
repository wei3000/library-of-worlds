/**
 * @file hubScene.ts
 * @description Three.js 3D Victorian Library Hub controller for "The Library of Worlds".
 * Implements first-person WASD / Arrow-key walking + mouse-drag look-around, warm Victorian
 * chandeliers, volumetric fog, raycasted book hover ("Why this tier" tooltip), and click
 * handlers for entering a Book World, speaking with the Head Librarian, or approaching the
 * Library Exit Door for the Milestone 4 Exit Debrief & Borrowing Record.
 *
 * Also renders mischievous Library Elf billboard sprites (`/art/elf.png`) holding parchment
 * claim banners whenever the student's takeaway synthesis contains `unsupported` or `overstated`
 * claims. Clicking an Elf opens the Exit Debrief to revise, attach a quote token, or dismiss
 * the claim and shoo the Elf away.
 *
 * Use cases:
 * 1. Exploring the themed aisles and inspecting metadata-driven source tiers.
 * 2. Clicking a book to transition into its 360° Book World (`worldScene.ts`).
 * 3. Clicking the Librarian to ask or refine the student's research question.
 * 4. Clicking the Library Exit Door (or a mischievous Elf) for the final Debrief & Borrowing Record PDF.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source, TakeawayClaim } from '../shared/types';
import {
  buildLibrarianDesk,
  buildThemedShelvesAndBooks,
  createLabelTexture,
  type BookPlacement,
} from './bookShelfBuilder';
import { buildLanternPath } from './lanternPath';
import { createBillboardSprite } from './spriteLoader';

export interface HubCallbacks {
  onSelectBook: (sourceId: string) => void;
  onSelectLibrarian: () => void;
  onSelectExitDoor: (focusClaimId?: string) => void;
  onHoverSource: (source: Source | null, screenX: number, screenY: number) => void;
}

export class HubSceneController {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  private dynamicGroup: THREE.Group;
  private elfGroup: THREE.Group;
  private placements: BookPlacement[] = [];
  private flickeringLights: Array<{
    light: THREE.PointLight;
    flameMesh?: THREE.Mesh;
    baseIntensity: number;
    phaseOffset: number;
  }> = [];
  private elapsedTime = 0;
  private yaw = 0;
  private pitch = 0;
  private isDragging = false;
  private dragDistance = 0;
  private prevMouse = { x: 0, y: 0 };
  private keysPressed: Set<string> = new Set();
  private raycaster = new THREE.Raycaster();
  private callbacks: HubCallbacks;

  constructor(callbacks: HubCallbacks) {
    logFunctionCall('HubSceneController.constructor', {});
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(APP_CONFIG.hub.fogColorHex);
    this.scene.fog = new THREE.FogExp2(APP_CONFIG.hub.fogColorHex, APP_CONFIG.hub.fogDensity);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      80
    );
    this.camera.position.set(0, APP_CONFIG.hub.eyeHeight, 2.2);

    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.dynamicGroup);

    this.elfGroup = new THREE.Group();
    this.scene.add(this.elfGroup);

    this.buildStaticLibraryArchitecture();
    buildLibrarianDesk(this.scene);
    this.buildLibraryExitDoor();
  }

  /**
   * Builds the permanent Victorian library hall (warm parquet floor, coffered ceiling, pillars,
   * chandeliers, and flickering candle/lamp stands).
   */
  private buildStaticLibraryArchitecture(): void {
    logFunctionCall('HubSceneController.buildStaticLibraryArchitecture', {});
    const ambient = new THREE.AmbientLight(
      APP_CONFIG.hub.ambientLightHex,
      APP_CONFIG.hub.ambientLightIntensity
    );
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(
      APP_CONFIG.hub.hemisphereSkyHex,
      APP_CONFIG.hub.hemisphereGroundHex,
      APP_CONFIG.hub.hemisphereIntensity
    );
    this.scene.add(hemi);

    // Warm honey-mahogany parquet timber floor
    const floorGeo = new THREE.PlaneGeometry(34, 34);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x3b2415,
      roughness: 0.72,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Circular library carpet beneath the Librarian desk with golden border ring
    const rugBorder = new THREE.Mesh(
      new THREE.CircleGeometry(5.75, 48),
      new THREE.MeshStandardMaterial({ color: 0xb48a3e, roughness: 0.75 })
    );
    rugBorder.rotation.x = -Math.PI / 2;
    rugBorder.position.set(0, 0.008, -3.5);
    this.scene.add(rugBorder);

    const rugGeo = new THREE.CircleGeometry(5.45, 48);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x5c1d24,
      roughness: 0.85,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, -3.5);
    this.scene.add(rug);

    // Coffered warm timber ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 34),
      new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.85 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.5;
    this.scene.add(ceiling);

    // Perimeter Victorian pillars with warm brass sconces
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x472a17, roughness: 0.65 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.65,
      roughness: 0.3,
    });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });

    const pillarCoords = [
      [-9, -9],
      [9, -9],
      [-9, 3],
      [9, 3],
      [-11, -3],
      [11, -3],
    ];
    pillarCoords.forEach(([px, pz], idx) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.5, 16), pillarMat);
      pillar.position.set(px, 3.25, pz);
      this.scene.add(pillar);

      const dirToCenter = new THREE.Vector2(-px, -3.5 - pz).normalize();
      const sconceX = px + dirToCenter.x * 0.62;
      const sconceZ = pz + dirToCenter.y * 0.62;

      const sconceArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.32, 10), brassMat);
      sconceArm.position.set(sconceX, 2.35, sconceZ);
      this.scene.add(sconceArm);

      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), flameMat);
      flame.position.set(sconceX, 2.56, sconceZ);
      this.scene.add(flame);

      const candleLight = new THREE.PointLight(0xffbb66, 2.1, 14);
      candleLight.position.set(sconceX, 2.62, sconceZ);
      this.scene.add(candleLight);
      this.flickeringLights.push({
        light: candleLight,
        flameMesh: flame,
        baseIntensity: 2.1,
        phaseOffset: idx * 1.37,
      });
    });

    // Free-standing Victorian candelabra floor lamps flanking the aisles and reading rug
    const floorLampCoords = [
      [-3.4, -1.5],
      [3.4, -1.5],
      [-5.2, -5.2],
      [5.2, -5.2],
      [-2.2, -10.2],
      [2.2, -10.2],
      [-2.8, 2.6],
      [2.8, 2.6],
    ];
    floorLampCoords.forEach(([lx, lz], idx) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, 1.65, 12), brassMat);
      stand.position.set(lx, 0.825, lz);
      this.scene.add(stand);

      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), flameMat);
      globe.position.set(lx, 1.72, lz);
      this.scene.add(globe);

      const lampLight = new THREE.PointLight(0xffc266, 2.3, 12);
      lampLight.position.set(lx, 1.82, lz);
      this.scene.add(lampLight);
      this.flickeringLights.push({
        light: lampLight,
        flameMesh: globe,
        baseIntensity: 2.3,
        phaseOffset: 10 + idx * 1.91,
      });
    });

    // Overhead warm grand chandeliers
    for (const [cx, cz, baseInt] of [
      [0, -3.5, 3.4],
      [-4.8, -6.5, 2.4],
      [4.8, -6.5, 2.4],
      [0, 1.5, 2.2],
    ]) {
      const chandelierLight = new THREE.PointLight(0xffcf87, baseInt, 26);
      chandelierLight.position.set(cx, 5.4, cz);
      this.scene.add(chandelierLight);
      this.flickeringLights.push({
        light: chandelierLight,
        baseIntensity: baseInt,
        phaseOffset: cx + cz,
      });
    }
  }

  /**
   * Builds the carved Victorian oak-and-brass Library Exit Door archway near the Librarian's Desk
   * (`(5.4, 0, 1.1)`) where the student completes the Milestone 4 Exit Debrief & Borrowing Record.
   */
  private buildLibraryExitDoor(): void {
    logFunctionCall('HubSceneController.buildLibraryExitDoor', {});
    const doorGroup = new THREE.Group();
    doorGroup.position.set(5.4, 0, 1.1);
    doorGroup.lookAt(0, 1.4, 2.2);

    const oakMat = new THREE.MeshStandardMaterial({
      color: 0x3b1f10,
      roughness: 0.55,
      metalness: 0.15,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0xb45309,
      emissiveIntensity: 0.28,
      metalness: 0.7,
      roughness: 0.25,
    });

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.9, 0.18), oakMat);
    doorPanel.position.y = 1.45;
    doorPanel.userData = { interactableType: 'exitDoor' };
    doorGroup.add(doorPanel);

    const archFrame = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.1, 10, 28, Math.PI),
      brassMat
    );
    archFrame.position.set(0, 2.85, 0.06);
    archFrame.userData = { interactableType: 'exitDoor' };
    doorGroup.add(archFrame);

    const signTex = createLabelTexture(
      ['Exit · Debrief'],
      '#1e140c',
      '#fbbf24',
      '#fef3c7'
    );
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.42, 0.48),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    // Mounted directly on the wooden door panel well below the brass arch (y = 2.12 vs arch y = 2.85)
    signMesh.position.set(0, 2.12, 0.12);
    signMesh.userData = { interactableType: 'exitDoor' };
    doorGroup.add(signMesh);

    this.scene.add(doorGroup);
  }

  /**
   * Rebuilds the dynamic bookshelves and glowing Lantern Path whenever sources or completion states update.
   *
   * @param sources - Current verified `Source[]`.
   * @param readingPath - Ordered list of `sourceId`s (`imp` -> `archmage`).
   * @param completedMap - Map of completed `sourceId`s.
   */
  public populateSources(
    sources: Source[],
    readingPath: string[],
    completedMap: Record<string, boolean>
  ): void {
    logFunctionCall('HubSceneController.populateSources', {
      sourceCount: sources.length,
      readingPath,
    });

    while (this.dynamicGroup.children.length > 0) {
      this.dynamicGroup.remove(this.dynamicGroup.children[0]);
    }

    const tempScene = new THREE.Scene();
    this.placements = buildThemedShelvesAndBooks(tempScene, sources, readingPath, completedMap);
    buildLanternPath(tempScene, this.placements, completedMap);

    while (tempScene.children.length > 0) {
      this.dynamicGroup.add(tempScene.children[0]);
    }
  }

  /**
   * Spawns mischievous Library Elf billboard sprites (`/art/elf.png`) holding parchment banners
   * in front of the Exit Door for any `unsupported` or `overstated` claims in the student's takeaway.
   *
   * @param claims - Current `TakeawayClaim[]` list from `session.takeaway.claims`.
   */
  public populateElves(claims: TakeawayClaim[]): void {
    const flagged = claims.filter(
      (c) => c.status === 'unsupported' || c.status === 'overstated'
    );
    logFunctionCall('HubSceneController.populateElves', {
      flaggedElfCount: flagged.length,
    });

    while (this.elfGroup.children.length > 0) {
      this.elfGroup.remove(this.elfGroup.children[0]);
    }

    flagged.forEach((claim, idx) => {
      const elfContainer = new THREE.Group();
      const spreadX = 1.9 + idx * 1.35;
      const spreadZ = -0.8 + (idx % 2) * 0.75;
      elfContainer.position.set(spreadX, 0, spreadZ);
      elfContainer.lookAt(0, 1.3, 2.2);
      elfContainer.userData = {
        baseY: 0,
        phase: idx * 1.7,
        claimId: claim.id,
      };

      const elfSprite = createBillboardSprite({
        url: APP_CONFIG.art.elf,
        width: 1.05,
        height: 1.32,
        fallbackColorHex: 0xef4444,
        userData: { interactableType: 'elf', claimId: claim.id },
      });
      elfSprite.position.set(0, 0.1, 0);
      elfContainer.add(elfSprite);

      // Parchment banner held above the mischievous Elf with the flagged claim snippet
      const badgeLabel =
        claim.status === 'overstated'
          ? '🧝 Mischievous Elf: OVERSTATED CLAIM!'
          : '🧝 Mischievous Elf: UNSUPPORTED CLAIM!';
      const bannerTex = createLabelTexture(
        [
          badgeLabel,
          `"${claim.text.slice(0, 44)}${claim.text.length > 44 ? '…' : ''}"`,
          'Click Elf to Revise, Cite Token, or Shoo Away',
        ],
        '#3b0a0a',
        '#f87171',
        '#fef2f2'
      );
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.95, 0.72),
        new THREE.MeshBasicMaterial({ map: bannerTex })
      );
      banner.position.set(0, 1.72, 0.08);
      banner.userData = { interactableType: 'elf', claimId: claim.id };
      elfContainer.add(banner);

      this.elfGroup.add(elfContainer);
    });
  }

  /**
   * Handles keydown events for WASD / Arrow movement.
   */
  public onKeyDown(code: string): void {
    this.keysPressed.add(code);
  }

  /**
   * Handles keyup events for WASD / Arrow movement.
   */
  public onKeyUp(code: string): void {
    this.keysPressed.delete(code);
  }

  /**
   * Begins mouse-drag look-around in the Hub.
   */
  public onPointerDown(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.dragDistance = 0;
    this.prevMouse = { x: clientX, y: clientY };
  }

  /**
   * Updates camera yaw/pitch when dragging, or performs hover raycasting against books on shelves.
   */
  public onPointerMove(clientX: number, clientY: number, canvasRect: DOMRect): void {
    if (this.isDragging) {
      const dx = clientX - this.prevMouse.x;
      const dy = clientY - this.prevMouse.y;
      this.dragDistance += Math.hypot(dx, dy);
      this.prevMouse = { x: clientX, y: clientY };

      this.yaw -= dx * APP_CONFIG.hub.lookSensitivity;
      this.pitch = Math.max(
        -Math.PI / 2.6,
        Math.min(Math.PI / 2.6, this.pitch - dy * APP_CONFIG.hub.lookSensitivity)
      );
      this.updateCameraOrientation();
      return;
    }

    const hit = this.raycastFromScreen(clientX, clientY, canvasRect);
    if (hit && hit.interactableType === 'book' && hit.sourceId) {
      const found = this.placements.find((p) => p.source.id === hit.sourceId)?.source ?? null;
      this.callbacks.onHoverSource(found, clientX, clientY);
    } else {
      this.callbacks.onHoverSource(null, clientX, clientY);
    }
  }

  /**
   * Completes pointer interaction; if it was a click (minimal drag), triggers book, librarian,
   * exit door, or mischievous elf selection.
   */
  public onPointerUp(clientX: number, clientY: number, canvasRect: DOMRect): void {
    const wasClick = this.isDragging && this.dragDistance < 6;
    this.isDragging = false;
    if (!wasClick) {
      return;
    }
    const hit = this.raycastFromScreen(clientX, clientY, canvasRect);
    if (!hit) {
      return;
    }
    if (hit.interactableType === 'book' && hit.sourceId) {
      this.callbacks.onHoverSource(null, 0, 0);
      this.callbacks.onSelectBook(hit.sourceId);
    } else if (hit.interactableType === 'librarian') {
      this.callbacks.onSelectLibrarian();
    } else if (hit.interactableType === 'exitDoor') {
      this.callbacks.onSelectExitDoor();
    } else if (hit.interactableType === 'elf') {
      this.callbacks.onSelectExitDoor(hit.claimId);
    }
  }

  /**
   * Raycasts into the Hub scene from screen coordinates and returns any interactable metadata.
   */
  private raycastFromScreen(
    clientX: number,
    clientY: number,
    rect: DOMRect
  ): { interactableType: string; sourceId?: string; claimId?: string } | null {
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of intersects) {
      if (hit.distance > 18) {
        continue;
      }
      const data = hit.object.userData;
      if (data && typeof data.interactableType === 'string') {
        return {
          interactableType: data.interactableType,
          sourceId: data.sourceId,
          claimId: data.claimId,
        };
      }
    }
    return null;
  }

  /**
   * Applies current `yaw` and `pitch` angles to the Hub perspective camera.
   */
  private updateCameraOrientation(): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  /**
   * Per-frame update loop handling gentle candle/lamp light flicker, mischievous Elf bouncing,
   * and WASD walking.
   */
  public update(deltaSeconds: number, movementEnabled: boolean): void {
    this.elapsedTime += deltaSeconds;

    // Gentle, cosy candle & brass lamp flicker
    for (const item of this.flickeringLights) {
      const wave1 = Math.sin(this.elapsedTime * 4.6 + item.phaseOffset) * 0.16;
      const wave2 = Math.sin(this.elapsedTime * 11.3 + item.phaseOffset * 2.3) * 0.08;
      item.light.intensity = Math.max(0.5, item.baseIntensity + wave1 + wave2);
      if (item.flameMesh) {
        const s = 1 + (wave1 + wave2) * 0.28;
        item.flameMesh.scale.set(s, s * 1.15, s);
      }
    }

    // Playful hop animation for mischievous Elves holding unsupported/overstated claim banners
    this.elfGroup.children.forEach((elf) => {
      const phase = (elf.userData?.phase as number) ?? 0;
      const hop = Math.abs(Math.sin(this.elapsedTime * 4.2 + phase)) * 0.18;
      elf.position.y = hop;
    });

    if (!movementEnabled) {
      return;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw
    );
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw
    );

    const velocity = new THREE.Vector3();
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
      velocity.add(forward);
    }
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
      velocity.sub(forward);
    }
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
      velocity.add(right);
    }
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
      velocity.sub(right);
    }

    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(APP_CONFIG.hub.moveSpeed * deltaSeconds);
      this.camera.position.add(velocity);
      this.camera.position.x = Math.max(-10, Math.min(10, this.camera.position.x));
      this.camera.position.z = Math.max(-11, Math.min(6, this.camera.position.z));
      this.camera.position.y = APP_CONFIG.hub.eyeHeight;
    }
  }
}
