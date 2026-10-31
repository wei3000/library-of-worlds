/**
 * @file hubScene.ts
 * @description Three.js 3D Victorian Library Hub controller for "The Library of Worlds".
 * Implements first-person WASD / Arrow-key walking + mouse-drag look-around, warm Victorian
 * chandeliers, volumetric fog, raycasted book hover ("Why this tier" tooltip), and click
 * handlers for entering a Book World or speaking with the Head Librarian.
 *
 * Use cases:
 * 1. Exploring the themed aisles and inspecting metadata-driven source tiers.
 * 2. Clicking a book to transition into its 360° Book World (`worldScene.ts`).
 * 3. Clicking the Librarian to ask or refine the student's research question.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';
import {
  buildLibrarianDesk,
  buildThemedShelvesAndBooks,
  type BookPlacement,
} from './bookShelfBuilder';
import { buildLanternPath } from './lanternPath';

export interface HubCallbacks {
  onSelectBook: (sourceId: string) => void;
  onSelectLibrarian: () => void;
  onHoverSource: (source: Source | null, screenX: number, screenY: number) => void;
}

export class HubSceneController {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  private dynamicGroup: THREE.Group;
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

    this.buildStaticLibraryArchitecture();
    buildLibrarianDesk(this.scene);
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

      // Wall/pillar candle sconce facing inward toward the center of the room
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

    // Create a temporary sub-scene proxy by adding shelves & path into dynamicGroup
    const tempScene = new THREE.Scene();
    this.placements = buildThemedShelvesAndBooks(tempScene, sources, readingPath, completedMap);
    buildLanternPath(tempScene, this.placements, completedMap);

    while (tempScene.children.length > 0) {
      this.dynamicGroup.add(tempScene.children[0]);
    }
  }

  /**
   * Handles keydown events for WASD / Arrow movement.
   *
   * @param code - KeyboardEvent.code string.
   */
  public onKeyDown(code: string): void {
    this.keysPressed.add(code);
  }

  /**
   * Handles keyup events for WASD / Arrow movement.
   *
   * @param code - KeyboardEvent.code string.
   */
  public onKeyUp(code: string): void {
    this.keysPressed.delete(code);
  }

  /**
   * Begins mouse-drag look-around in the Hub.
   *
   * @param clientX - Mouse X coordinate.
   * @param clientY - Mouse Y coordinate.
   */
  public onPointerDown(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.dragDistance = 0;
    this.prevMouse = { x: clientX, y: clientY };
  }

  /**
   * Updates camera yaw/pitch when dragging, or performs hover raycasting against books on shelves.
   *
   * @param clientX - Mouse X coordinate.
   * @param clientY - Mouse Y coordinate.
   * @param canvasRect - Bounding client rect of the WebGL canvas.
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
   * Completes pointer interaction; if it was a click (minimal drag), triggers book or librarian selection.
   *
   * @param clientX - Mouse X coordinate.
   * @param clientY - Mouse Y coordinate.
   * @param canvasRect - Bounding client rect of the WebGL canvas.
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
    }
  }

  /**
   * Raycasts into the Hub scene from screen coordinates and returns any interactable metadata.
   *
   * @param clientX - Screen X coordinate.
   * @param clientY - Screen Y coordinate.
   * @param rect - Canvas bounding rectangle.
   * @returns Metadata of the hit object or `null`.
   */
  private raycastFromScreen(
    clientX: number,
    clientY: number,
    rect: DOMRect
  ): { interactableType: string; sourceId?: string } | null {
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
   * Per-frame update loop handling gentle candle/lamp light flicker and WASD walking.
   *
   * @param deltaSeconds - Frame delta time in seconds.
   * @param movementEnabled - False when typing in an input/textarea.
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
      // Clamp player within library bounds
      this.camera.position.x = Math.max(-10, Math.min(10, this.camera.position.x));
      this.camera.position.z = Math.max(-11, Math.min(6, this.camera.position.z));
      this.camera.position.y = APP_CONFIG.hub.eyeHeight;
    }
  }
}
