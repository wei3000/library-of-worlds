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
 * - Per-world Menace Level (0-3) with Nano Banana crow sprites (`/art/crow.png`) and real audio cues:
 *   - Level 1: 1 crow sprite lands on a perch in the scene.
 *   - Level 2: 2 crow sprites (perched + circling), light dims further, occasional distant caws loop.
 *   - Level 3: 3 crows circling overhead + 1 crow perched on Head Librarian Aurelius Finch's shoulder,
 *     frequent overlapping caws, thick desaturated fog.
 *   - On Pass (Level 0): Crows take off and fly away into the sky, caws stop, Great Kiskadee call plays,
 *     and warm light returns.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { PerSourceLog, Source } from '../shared/types';
import { audioManager } from './audioManager';
import { createLabelTexture } from './bookShelfBuilder';
import { createBillboardSprite } from './spriteLoader';
import {
  buildTierFullTextObject,
  buildTierWorldEnvironment,
  type BuiltWorldTemplate,
} from './worldTemplates';

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
  private departingCrowGroup: THREE.Group;
  private animatedProps: BuiltWorldTemplate['animatedProps'] = [];
  private ambientLight: THREE.AmbientLight;
  private centerLight: THREE.PointLight;
  private librarianShoulderWorldPos = new THREE.Vector3(3.2, 1.72, -4.8);
  private scenePerchWorldPos = new THREE.Vector3(-1.45, 2.25, -4.6);
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

    this.departingCrowGroup = new THREE.Group();
    this.scene.add(this.departingCrowGroup);
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
    this.animatedProps = [];

    // 1. Tier-specific 3D world environment (Market, Workshop, Study, Observatory, or Vaulted Hall)
    const template = buildTierWorldEnvironment(source);
    this.contentGroup.add(template.group);
    this.animatedProps.push(...template.animatedProps);

    // 2. Tier-specific Full-Text Object placed forward-left (Notice Board, Blueprint, Parchment, Stone Tablet, or Lectern)
    const fullTextObj = buildTierFullTextObject(source);
    this.contentGroup.add(fullTextObj);

    // 2b. Wooden/iron crow perch stand between the Full-Text object and the Exit Gate
    this.buildScenePerchStand();

    // 3. Exit Gate & Librarian placed forward-right (angle = +0.62 rad)
    this.buildExitGate(source, log);

    // 4. Connected vs Unconnected World contents
    if (!source.connected || !source.sections || source.sections.length === 0) {
      this.buildUnconnectedWing(source);
    } else {
      this.buildConnectedNpcs(source, log);
    }

    this.applyMenaceAtmosphere(source, log.currentMenace);
  }

  /**
   * Builds a carved Victorian iron-and-oak perch stand in the forward view where the first
   * crow lands when Menace reaches Level 1.
   */
  private buildScenePerchStand(): void {
    const standGroup = new THREE.Group();
    standGroup.position.set(this.scenePerchWorldPos.x, 0, this.scenePerchWorldPos.z);

    const postMat = new THREE.MeshStandardMaterial({
      color: 0x2d1e14,
      roughness: 0.75,
      metalness: 0.2,
    });
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, this.scenePerchWorldPos.y, 10),
      postMat
    );
    post.position.y = this.scenePerchWorldPos.y / 2;
    standGroup.add(post);

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8), postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.y = this.scenePerchWorldPos.y;
    standGroup.add(crossbar);

    this.contentGroup.add(standGroup);
  }

  /**
   * Builds the Librarian Exit Gate at the world's edge where the student proves understanding.
   * When `log.completed` is true, a Great Kiskadee bird (bright yellow breast, brown wings,
   * black-and-white mask) perches atop the archway.
   */
  private buildExitGate(source: Source, log: PerSourceLog): void {
    const group = new THREE.Group();
    const angle = 0.62;
    const dist = APP_CONFIG.world.exitGateDistance;
    const gateX = Math.sin(angle) * dist;
    const gateZ = -Math.cos(angle) * dist;
    group.position.set(gateX, 0, gateZ);
    group.lookAt(0, 1.5, 0);

    // Compute world coordinates for the Librarian's shoulder perch (used at Menace Level 3)
    this.librarianShoulderWorldPos.set(gateX - 0.34, 1.62, gateZ + 0.24);

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

    // Great Kiskadee bird perched on the Exit Gate crest when the source is completed
    if (log.completed) {
      const kiskadeeGroup = new THREE.Group();
      kiskadeeGroup.position.set(0.45, 2.95, 0.15);
      const yellowBreast = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xeab308,
          emissiveIntensity: 0.35,
        })
      );
      kiskadeeGroup.add(yellowBreast);

      const brownWings = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.36, 10),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 })
      );
      brownWings.position.set(0, 0.04, -0.1);
      brownWings.rotation.x = -0.8;
      kiskadeeGroup.add(brownWings);

      const headCrest = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x18181b })
      );
      headCrest.position.set(0, 0.2, 0.08);
      kiskadeeGroup.add(headCrest);

      group.add(kiskadeeGroup);
    }

    // Librarian Aurelius Finch camera-facing billboard sprite standing by the Exit Gate
    const librarianSprite = createBillboardSprite({
      url: APP_CONFIG.art.librarian,
      width: 1.75,
      height: 2.2,
      fallbackColorHex: 0xd4af37,
      userData: { interactableType: 'exitGate' },
    });
    librarianSprite.position.set(0, 0, 0.22);
    group.add(librarianSprite);

    const gateLabel = createLabelTexture(
      [
        log.completed ? '✓ Exit Gate Open — Great Kiskadee Perched' : '🔒 Exit Gate — Prove Understanding',
        source.connected ? 'Answer in Your Own Words to Leave' : 'Answer from Abstract to Leave',
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

      // Camera-facing Nano Banana NPC billboard sprite on pedestal
      const npcSprite = createBillboardSprite({
        url: APP_CONFIG.art.npcs[source.tier],
        width: 1.55,
        height: 1.98,
        fallbackColorHex: tierInfo.colorHex,
        tintHex: isHinted ? 0xfff59d : 0xffffff,
        userData: { interactableType: 'npc', sectionId: section.id },
      });
      npcSprite.position.set(0, 0.25, 0);
      npcGroup.add(npcSprite);

      // Companion tier creature sprite perched on the edge of the NPC pedestal
      const companionSprite = createBillboardSprite({
        url: APP_CONFIG.art.creatures[source.tier],
        width: 0.65,
        height: 0.78,
        fallbackColorHex: tierInfo.colorHex,
        userData: { interactableType: 'npc', sectionId: section.id },
      });
      companionSprite.position.set(0.58, 0.25, 0.15);
      npcGroup.add(companionSprite);

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
   * Adjusts world lighting, fog density, background desaturation, audio loops, and Nano Banana
   * crow sprites (`/art/crow.png`) according to `currentMenace` (0-3):
   * - 0 (Pass/Reset): Any existing crows take off and fly away; warm light returns.
   * - 1: 1 crow sprite lands on the wooden perch stand in the scene.
   * - 2: 2 crows (1 on perch, 1 circling overhead), light dims further, occasional distant caws loop.
   * - 3: 3 crows circling overhead + 1 crow perched on the Librarian's shoulder, frequent overlapping
   *   caws, thick desaturated fog.
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

    // Update ambient looping crow caws for Levels 2 and 3 (or silence at Level 0)
    audioManager.setMenaceAudioLevel(clamped);

    // Desaturate and thicken fog as menace rises (especially thick & desaturated at Level 3)
    const baseColor = new THREE.Color(tierInfo.fogHex);
    const desaturatedSlate = new THREE.Color(0x1c1b20);
    baseColor.lerp(desaturatedSlate, clamped / 3);
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    baseColor.setHSL(hsl.h, hsl.s * visuals.saturation, hsl.l);

    this.scene.background = baseColor;
    this.scene.fog = new THREE.FogExp2(baseColor.getHex(), visuals.fogDensity);
    this.ambientLight.intensity = 0.85 * visuals.lightMultiplier;
    this.centerLight.intensity = 2.2 * visuals.lightMultiplier;
    if (clamped === 0) {
      this.centerLight.color.setHex(0xffddaa);
    } else if (clamped < 3) {
      this.centerLight.color.setHex(0xd69e72);
    } else {
      // Desaturated cold ashen light at Menace 3
      this.centerLight.color.setHex(0x8e8d96);
    }

    // If menace drops to 0 (student passed!) and crows were present, animate them taking off and flying away
    if (clamped === 0 && this.crowGroup.children.length > 0) {
      while (this.crowGroup.children.length > 0) {
        const crow = this.crowGroup.children[0];
        this.crowGroup.remove(crow);
        const angle = Math.random() * Math.PI * 2;
        crow.userData = {
          ...crow.userData,
          departAge: 0,
          vx: Math.cos(angle) * 3.8,
          vy: 3.4 + Math.random() * 1.6,
          vz: Math.sin(angle) * 3.8,
        };
        this.departingCrowGroup.add(crow);
      }
      return;
    }

    // Rebuild active crow sprites for the current menace level
    while (this.crowGroup.children.length > 0) {
      this.crowGroup.remove(this.crowGroup.children[0]);
    }

    if (clamped === 1) {
      // Level 1: One crow sprite lands on the perch in the scene
      const perchedCrow = this.createCrowSprite(0.88, 0.88, {
        mode: 'perched',
        basePos: this.scenePerchWorldPos.clone(),
        phase: 0.4,
      });
      perchedCrow.position.copy(this.scenePerchWorldPos);
      this.crowGroup.add(perchedCrow);
    } else if (clamped === 2) {
      // Level 2: Two crows (one on perch, one circling slowly overhead)
      const perchedCrow = this.createCrowSprite(0.88, 0.88, {
        mode: 'perched',
        basePos: this.scenePerchWorldPos.clone(),
        phase: 0.4,
      });
      perchedCrow.position.copy(this.scenePerchWorldPos);
      this.crowGroup.add(perchedCrow);

      const circlingCrow = this.createCrowSprite(0.92, 0.92, {
        mode: 'circling',
        orbitIndex: 0,
        orbitTotal: 1,
        radius: 3.9,
        baseHeight: 3.25,
        phase: 1.7,
      });
      this.crowGroup.add(circlingCrow);
    } else if (clamped >= 3) {
      // Level 3: Three crows circling overhead + one crow perched on the Librarian's shoulder
      for (let i = 0; i < 3; i++) {
        const circlingCrow = this.createCrowSprite(0.92, 0.92, {
          mode: 'circling',
          orbitIndex: i,
          orbitTotal: 3,
          radius: 3.5 + (i % 2) * 0.85,
          baseHeight: 3.15 + i * 0.25,
          phase: i * 2.1,
        });
        this.crowGroup.add(circlingCrow);
      }

      const shoulderCrow = this.createCrowSprite(0.68, 0.68, {
        mode: 'shoulder',
        basePos: this.librarianShoulderWorldPos.clone(),
        phase: 2.8,
      });
      shoulderCrow.position.copy(this.librarianShoulderWorldPos);
      this.crowGroup.add(shoulderCrow);
    }
  }

  /**
   * Helper that creates a Nano Banana crow billboard sprite (`/art/crow.png`) with base scale
   * metadata for flapping and bobbing animations.
   */
  private createCrowSprite(
    width: number,
    height: number,
    userData: Record<string, unknown>
  ): THREE.Sprite {
    return createBillboardSprite({
      url: APP_CONFIG.art.crow,
      width,
      height,
      fallbackColorHex: 0x18181b,
      userData: {
        baseWidth: width,
        baseHeight: height,
        ...userData,
      },
    });
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
   * Animates perched/circling/departing crow sprites (flapping scale + vertical bob) and
   * tier-specific mechanical/celestial props.
   *
   * @param deltaSeconds - Frame delta time in seconds.
   */
  public update(deltaSeconds: number): void {
    this.elapsedTime += deltaSeconds;

    for (const prop of this.animatedProps) {
      prop.object.rotation[prop.axis] += prop.speed * deltaSeconds;
    }

    // Animate active menace crows (perched, shoulder, or circling overhead)
    this.crowGroup.children.forEach((crow) => {
      const data = crow.userData ?? {};
      const baseW = (data.baseWidth as number) ?? 0.88;
      const baseH = (data.baseHeight as number) ?? 0.88;
      const phase = (data.phase as number) ?? 0;
      const mode = (data.mode as string) ?? 'circling';

      if (mode === 'perched' || mode === 'shoulder') {
        const basePos = (data.basePos as THREE.Vector3) ?? crow.position;
        const bob = Math.abs(Math.sin(this.elapsedTime * 3.4 + phase)) * 0.055;
        const flap = Math.sin(this.elapsedTime * 5.2 + phase) * 0.065;
        crow.position.set(basePos.x, basePos.y + bob, basePos.z);
        crow.scale.set(baseW * (1 + flap), baseH * (1 - flap * 0.5), 1);
      } else {
        // Circling overhead with active wing-flapping scale and vertical bob
        const orbitIndex = (data.orbitIndex as number) ?? 0;
        const orbitTotal = Math.max(1, (data.orbitTotal as number) ?? 1);
        const radius = (data.radius as number) ?? 3.8;
        const baseHeight = (data.baseHeight as number) ?? 3.2;
        const angle =
          this.elapsedTime * 1.35 + (orbitIndex * Math.PI * 2) / orbitTotal + phase * 0.25;
        const flap = Math.sin(this.elapsedTime * 11.5 + phase);
        const bob = Math.sin(this.elapsedTime * 4.5 + phase) * 0.24;

        crow.position.set(
          Math.cos(angle) * radius,
          baseHeight + bob,
          Math.sin(angle) * radius
        );
        crow.scale.set(baseW * (1 + flap * 0.16), baseH * (1 - flap * 0.09), 1);
      }
    });

    // Animate departing crows flying away into the sky after the student passes the Exit Gate
    for (let i = this.departingCrowGroup.children.length - 1; i >= 0; i--) {
      const crow = this.departingCrowGroup.children[i];
      const data = crow.userData ?? {};
      const age = ((data.departAge as number) ?? 0) + deltaSeconds;
      data.departAge = age;

      const vx = (data.vx as number) ?? 2.5;
      const vy = (data.vy as number) ?? 3.5;
      const vz = (data.vz as number) ?? -2.5;
      const baseW = (data.baseWidth as number) ?? 0.88;
      const baseH = (data.baseHeight as number) ?? 0.88;

      crow.position.x += vx * deltaSeconds;
      crow.position.y += vy * deltaSeconds;
      crow.position.z += vz * deltaSeconds;

      const fastFlap = Math.sin(this.elapsedTime * 18 + i);
      const shrink = Math.max(0.1, 1 - age / 2.0);
      crow.scale.set(
        baseW * shrink * (1 + fastFlap * 0.22),
        baseH * shrink * (1 - fastFlap * 0.12),
        1
      );

      if (age >= 1.95) {
        this.departingCrowGroup.remove(crow);
      }
    }
  }
}
