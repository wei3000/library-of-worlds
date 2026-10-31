/**
 * @file worldScene.ts
 * @description 360° look-around Book World scene controller for "The Library of Worlds".
 * Renders an interactive 360° world from a fixed central vantage point where the student
 * drags the mouse to look around and clicks on:
 * 1. Section NPCs arranged around the 360° circle in reading order (1..N).
 * 2. The tier-styled Full-Text Object (Notice Board, Blueprint, Parchment, Stone Tablet, or Illuminated Manuscript).
 * 3. The Librarian at the Exit Gate portal.
 *
 * Also handles:
 * - Unconnected worlds (fog, distant castle silhouette, "This wing of the library is not yet connected" sign).
 * - Per-world Menace Level (0-3): darkens lights, thickens fog, spawns circling Crows, and makes the
 *   hint NPC glow brightly after a wrong Exit Gate answer.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { PerSourceLog, Source } from '../shared/types';
import { createLabelTexture } from './bookShelfBuilder';

export interface WorldCallbacks {
  onSelectNpc: (sectionId: string) => void;
  onSelectFullTextObject: () => void;
  onSelectExitGate: () => void;
}

export class WorldSceneController {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  private contentGroup: THREE.Group;
  private crowGroup: THREE.Group;
  private ambientLight: THREE.AmbientLight;
  private centerLight: THREE.PointLight;
  private yaw = 0;
  private pitch = 0;
  private isDragging = false;
  private dragDistance = 0;
  private prevMouse = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private callbacks: WorldCallbacks;
  private elapsedTime = 0;

  constructor(callbacks: WorldCallbacks) {
    logFunctionCall('WorldSceneController.constructor', {});
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161224);
    this.scene.fog = new THREE.FogExp2(0x161224, 0.025);

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.1,
      90
    );
    this.camera.position.set(0, 1.7, 0);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    this.centerLight = new THREE.PointLight(0xffddaa, 2.2, 25);
    this.centerLight.position.set(0, 4.2, 0);
    this.scene.add(this.centerLight);

    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);

    this.crowGroup = new THREE.Group();
    this.scene.add(this.crowGroup);
  }

  /**
   * Populates the 360° Book World for the given `Source` and its `PerSourceLog` state.
   * Supports both connected worlds (with section NPCs) and unconnected worlds (fog + castle silhouette).
   *
   * @param source - The entered book `Source`.
   * @param log - Per-source state (visited NPCs, collected tokens, current menace, hintSectionId).
   */
  public loadSourceWorld(source: Source, log: PerSourceLog): void {
    logFunctionCall('WorldSceneController.loadSourceWorld', {
      sourceId: source.id,
      tier: source.tier,
      connected: source.connected,
      currentMenace: log.currentMenace,
    });

    while (this.contentGroup.children.length > 0) {
      this.contentGroup.remove(this.contentGroup.children[0]);
    }

    const tierInfo = APP_CONFIG.tiers[source.tier];

    // Circular floor & dome sky tailored to tier
    const floorMat = new THREE.MeshStandardMaterial({
      color: tierInfo.ambientHex,
      roughness: 0.75,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.contentGroup.add(floor);

    // Decorative ring pillars around perimeter
    const pillarMat = new THREE.MeshStandardMaterial({
      color: tierInfo.colorHex,
      roughness: 0.55,
      metalness: 0.25,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 5.5, 12), pillarMat);
      pillar.position.set(Math.cos(angle) * 9.5, 2.75, Math.sin(angle) * 9.5);
      this.contentGroup.add(pillar);
    }

    // 1. Full-Text Object placed forward-left (angle = -0.55 rad)
    this.buildFullTextObject(source, tierInfo.fullTextObjectName, tierInfo.cssColor);

    // 2. Exit Gate & Librarian placed forward-right (angle = +0.55 rad)
    this.buildExitGate(source, log);

    // 3. Connected vs Unconnected World contents
    if (!source.connected || !source.sections || source.sections.length === 0) {
      this.buildUnconnectedWing(source);
    } else {
      this.buildConnectedNpcs(source, log);
    }

    this.applyMenaceAtmosphere(source, log.currentMenace);
  }

  /**
   * Builds the clickable Full-Text Object (Notice Board, Blueprint, Parchment, Stone Tablet, or Lectern).
   */
  private buildFullTextObject(
    source: Source,
    objectName: string,
    accentCss: string
  ): void {
    const group = new THREE.Group();
    const angle = -0.62;
    const dist = APP_CONFIG.world.fullTextObjectDistance;
    group.position.set(Math.sin(angle) * dist, 0, -Math.cos(angle) * dist);
    group.lookAt(0, 1.3, 0);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.48, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.6 })
    );
    pedestal.position.y = 0.6;
    pedestal.userData = { interactableType: 'fullText' };
    group.add(pedestal);

    const boardTex = createLabelTexture(
      [
        `📜 ${objectName}`,
        source.title.slice(0, 34),
        'Click to Read Full Source & Quotes',
      ],
      '#1e1610',
      accentCss,
      '#fef3c7'
    );
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.15, 0.12),
      new THREE.MeshBasicMaterial({ map: boardTex })
    );
    board.position.y = 1.65;
    board.userData = { interactableType: 'fullText' };
    group.add(board);

    this.contentGroup.add(group);
  }

  /**
   * Builds the Librarian Exit Gate at the world's edge where the student proves understanding.
   */
  private buildExitGate(source: Source, log: PerSourceLog): void {
    const group = new THREE.Group();
    const angle = 0.62;
    const dist = APP_CONFIG.world.exitGateDistance;
    group.position.set(Math.sin(angle) * dist, 0, -Math.cos(angle) * dist);
    group.lookAt(0, 1.5, 0);

    const gateColor = log.completed ? 0x10b981 : 0xd4af37;
    const archMat = new THREE.MeshStandardMaterial({
      color: gateColor,
      emissive: gateColor,
      emissiveIntensity: log.completed ? 0.6 : 0.25,
      metalness: 0.5,
      roughness: 0.3,
    });

    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.14, 12, 32, Math.PI), archMat);
    arch.position.y = 1.4;
    arch.userData = { interactableType: 'exitGate' };
    group.add(arch);

    // Librarian figure standing by the Exit Gate
    const libBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 1.45, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1829 })
    );
    libBody.position.set(0, 0.9, 0.2);
    libBody.userData = { interactableType: 'exitGate' };
    group.add(libBody);

    const libHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xe8cbb1 })
    );
    libHead.position.set(0, 1.82, 0.2);
    libHead.userData = { interactableType: 'exitGate' };
    group.add(libHead);

    const gateLabel = createLabelTexture(
      [
        log.completed ? '✓ Exit Gate Open — Librarian' : '🔒 Exit Gate — Prove Understanding',
        source.connected ? 'Answer + Present Quote Token' : 'Answer from Abstract to Leave',
      ],
      log.completed ? '#064e3b' : '#261414',
      log.completed ? '#10b981' : '#f59e0b',
      '#ffffff'
    );
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.8),
      new THREE.MeshBasicMaterial({ map: gateLabel })
    );
    sign.position.set(0, 2.55, 0.25);
    sign.userData = { interactableType: 'exitGate' };
    group.add(sign);

    this.contentGroup.add(group);
  }

  /**
   * Builds the Unconnected Wing (distant castle silhouette + sign) for sources without retrievable full text.
   */
  private buildUnconnectedWing(source: Source): void {
    logFunctionCall('WorldSceneController.buildUnconnectedWing', { sourceId: source.id });
    // Distant castle silhouette across the misty chasm
    const castleGroup = new THREE.Group();
    castleGroup.position.set(0, 0, -14);
    const silhouetteMat = new THREE.MeshBasicMaterial({ color: 0x09070f });

    const mainKeep = new THREE.Mesh(new THREE.BoxGeometry(5.5, 6.5, 2.0), silhouetteMat);
    mainKeep.position.y = 3.25;
    castleGroup.add(mainKeep);

    for (const tx of [-3.4, 0, 3.4]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8.5, 12), silhouetteMat);
      tower.position.set(tx, 4.25, 0);
      castleGroup.add(tower);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.6, 12), silhouetteMat);
      spire.position.set(tx, 9.8, 0);
      castleGroup.add(spire);
    }
    this.contentGroup.add(castleGroup);

    // Signpost: "This wing of the library is not yet connected"
    const signTex = createLabelTexture(
      [
        '🌫️ This wing of the library is not yet connected',
        'Full text is behind a publisher gate — inspect the Abstract',
        'on the Lectern and answer the Exit Gate question.',
      ],
      '#1a1423',
      '#eab308',
      '#fef08a'
    );
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.25),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 1.9, -4.8);
    signBoard.userData = { interactableType: 'fullText' };
    this.contentGroup.add(signBoard);
  }

  /**
   * Places section NPCs around the 360° circle in reading order, highlighting any hint NPC on wrong answers.
   */
  private buildConnectedNpcs(source: Source, log: PerSourceLog): void {
    const sections = source.sections ?? [];
    const tierInfo = APP_CONFIG.tiers[source.tier];
    const radius = APP_CONFIG.world.npcRadius;

    sections.forEach((section, idx) => {
      // Spread NPCs across the remaining 240 degrees of the 360° circle in reading order
      const startAngle = Math.PI * 0.38;
      const endAngle = Math.PI * 1.62;
      const t = sections.length > 1 ? idx / (sections.length - 1) : 0.5;
      const angle = startAngle + t * (endAngle - startAngle);

      const npcGroup = new THREE.Group();
      npcGroup.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
      npcGroup.lookAt(0, 1.2, 0);

      const isVisited = log.npcsVisited.includes(section.id);
      const isHinted = log.hintSectionId === section.id;

      // Pedestal
      const pedMat = new THREE.MeshStandardMaterial({
        color: isHinted ? 0xfbbf24 : isVisited ? 0x10b981 : tierInfo.colorHex,
        emissive: isHinted ? 0xf59e0b : tierInfo.colorHex,
        emissiveIntensity: isHinted ? 0.9 : 0.25,
      });
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.25, 18), pedMat);
      ped.position.y = 0.125;
      ped.userData = { interactableType: 'npc', sectionId: section.id };
      npcGroup.add(ped);

      // Stylised NPC figure (robe + head + lantern staff)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isHinted ? 0xfde047 : tierInfo.colorHex,
        emissive: isHinted ? 0xf59e0b : 0x000000,
        emissiveIntensity: isHinted ? 0.7 : 0,
        roughness: 0.45,
      });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.45, 16), bodyMat);
      body.position.y = 0.95;
      body.userData = { interactableType: 'npc', sectionId: section.id };
      npcGroup.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xf3d7be })
      );
      head.position.y = 1.82;
      head.userData = { interactableType: 'npc', sectionId: section.id };
      npcGroup.add(head);

      if (isHinted) {
        const hintLight = new THREE.PointLight(0xfbbf24, 3.0, 6.0);
        hintLight.position.set(0, 2.2, 0.4);
        npcGroup.add(hintLight);
      }

      // Billboard overhead plaque with Section # + NPC Name + Role
      const statusBadge = isHinted
        ? '✨ HINT: RE-READ THIS SECTION'
        : isVisited
          ? '✓ Visited'
          : `Section ${idx + 1}`;
      const labelTex = createLabelTexture(
        [
          `${statusBadge} — ${section.npc.name}`,
          section.npc.role,
          section.heading.slice(0, 36),
        ],
        isHinted ? '#451a03' : '#181326',
        isHinted ? '#facc15' : tierInfo.cssColor,
        '#ffffff'
      );
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(2.25, 0.85),
        new THREE.MeshBasicMaterial({ map: labelTex })
      );
      plaque.position.set(0, 2.55, 0);
      plaque.userData = { interactableType: 'npc', sectionId: section.id };
      npcGroup.add(plaque);

      this.contentGroup.add(npcGroup);
    });
  }

  /**
   * Adjusts world lighting, fog density, background colour, and circling Crows according to `currentMenace` (0-3).
   *
   * @param source - Active `Source`.
   * @param menaceLevel - Current per-world menace level (0-3).
   */
  public applyMenaceAtmosphere(source: Source, menaceLevel: number): void {
    logFunctionCall('WorldSceneController.applyMenaceAtmosphere', {
      sourceId: source.id,
      menaceLevel,
    });
    const clamped = Math.max(0, Math.min(3, menaceLevel));
    const visuals = APP_CONFIG.world.menaceVisuals[clamped];
    const tierInfo = APP_CONFIG.tiers[source.tier];

    const baseColor = new THREE.Color(tierInfo.fogHex);
    const hellishColor = new THREE.Color(0x2a080c);
    baseColor.lerp(hellishColor, clamped / 3);

    this.scene.background = baseColor;
    this.scene.fog = new THREE.FogExp2(baseColor.getHex(), visuals.fogDensity);
    this.ambientLight.intensity = 0.85 * visuals.lightMultiplier;
    this.centerLight.intensity = 2.2 * visuals.lightMultiplier;
    this.centerLight.color.setHex(clamped > 0 ? 0xff6b4a : 0xffddaa);

    // Rebuild circling crows for Menace > 0
    while (this.crowGroup.children.length > 0) {
      this.crowGroup.remove(this.crowGroup.children[0]);
    }
    const crowMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    for (let i = 0; i < visuals.crowCount; i++) {
      const crow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), crowMat);
      crow.rotation.z = Math.PI / 2;
      crow.userData = { crowIndex: i };
      this.crowGroup.add(crow);
    }
  }

  /**
   * Begins 360° mouse-drag look-around.
   */
  public onPointerDown(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.dragDistance = 0;
    this.prevMouse = { x: clientX, y: clientY };
  }

  /**
   * Updates 360° camera orientation during drag.
   */
  public onPointerMove(clientX: number, clientY: number): void {
    if (!this.isDragging) {
      return;
    }
    const dx = clientX - this.prevMouse.x;
    const dy = clientY - this.prevMouse.y;
    this.dragDistance += Math.hypot(dx, dy);
    this.prevMouse = { x: clientX, y: clientY };

    this.yaw -= dx * APP_CONFIG.world.lookSensitivity;
    this.pitch = Math.max(
      -Math.PI / 2.4,
      Math.min(Math.PI / 2.4, this.pitch - dy * APP_CONFIG.world.lookSensitivity)
    );
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  /**
   * Handles clicks on NPCs, the Full-Text Object, or the Librarian Exit Gate.
   */
  public onPointerUp(clientX: number, clientY: number, rect: DOMRect): void {
    const wasClick = this.isDragging && this.dragDistance < 6;
    this.isDragging = false;
    if (!wasClick) {
      return;
    }

    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const hits = this.raycaster.intersectObjects(this.contentGroup.children, true);
    for (const hit of hits) {
      const data = hit.object.userData;
      if (!data || !data.interactableType) {
        continue;
      }
      if (data.interactableType === 'npc' && data.sectionId) {
        this.callbacks.onSelectNpc(data.sectionId);
        return;
      }
      if (data.interactableType === 'fullText') {
        this.callbacks.onSelectFullTextObject();
        return;
      }
      if (data.interactableType === 'exitGate') {
        this.callbacks.onSelectExitGate();
        return;
      }
    }
  }

  /**
   * Animates circling crows when Menace > 0.
   *
   * @param deltaSeconds - Frame delta time in seconds.
   */
  public update(deltaSeconds: number): void {
    this.elapsedTime += deltaSeconds;
    this.crowGroup.children.forEach((crow, idx) => {
      const angle = this.elapsedTime * 1.4 + idx * 1.2;
      const radius = 3.8 + (idx % 2) * 1.1;
      crow.position.set(
        Math.cos(angle) * radius,
        3.2 + Math.sin(this.elapsedTime * 2 + idx) * 0.35,
        Math.sin(angle) * radius
      );
      crow.rotation.y = -angle;
    });
  }
}
