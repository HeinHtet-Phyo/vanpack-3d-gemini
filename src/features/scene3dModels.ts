/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PlacedItem, VanPreset } from '../types';

/**
 * Shared Procedural Texture & Material Cache so switching vans or rendering 40+ items stays at 60 FPS.
 */
class ProceduralAssetCache {
  private textures = new Map<string, THREE.CanvasTexture>();
  private materials = new Map<string, THREE.Material>();

  getPlywoodTexture(): THREE.CanvasTexture {
    const key = 'plywood';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#D5B88A';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle wood grain lines
    ctx.strokeStyle = 'rgba(140, 100, 55, 0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const y = (i * 512) / 90;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + Math.sin(i) * 8, 340, y - Math.cos(i) * 8, 512, y);
      ctx.stroke();
    }

    // Plywood panel seams
    ctx.strokeStyle = 'rgba(85, 60, 35, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    this.textures.set(key, tex);
    return tex;
  }

  getRibbedFloorTexture(): THREE.CanvasTexture {
    const key = 'ribbed_floor';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2B2A28';
    ctx.fillRect(0, 0, 256, 256);

    // Anti-slip ribs
    ctx.fillStyle = '#383633';
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(0, y, 256, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    this.textures.set(key, tex);
    return tex;
  }

  getTarmacTexture(): THREE.CanvasTexture {
    const key = 'tarmac';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#363532';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle aggregate speckles
    for (let i = 0; i < 2400; i++) {
      const x = (i * 73) % 512;
      const y = (i * 137) % 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    this.textures.set(key, tex);
    return tex;
  }

  getCardboardSidesTexture(): THREE.CanvasTexture {
    const key = 'cardboard_sides';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#C8A26B';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle kraft grain
    ctx.fillStyle = 'rgba(110, 75, 35, 0.08)';
    for (let i = 0; i < 500; i++) {
      ctx.fillRect((i * 53) % 256, (i * 97) % 256, 4, 1);
    }

    // Printed handling marks at bottom corner
    ctx.strokeStyle = 'rgba(27, 26, 23, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 232, 232);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  getCardboardTopTexture(stepOrder: number, name: string): THREE.CanvasTexture {
    const key = `box_top_${stepOrder}_${name}`;
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Kraft base
    ctx.fillStyle = '#C8A26B';
    ctx.fillRect(0, 0, 256, 256);

    // Flap seam line
    ctx.strokeStyle = '#78562C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();

    // Brown packing tape strip across the center
    ctx.fillStyle = '#9C7444';
    ctx.fillRect(0, 108, 256, 40);

    // White shipping manifest label stuck on top
    ctx.fillStyle = '#FAF6EE';
    ctx.fillRect(28, 26, 200, 86);
    ctx.strokeStyle = '#1B1A17';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 26, 200, 86);

    ctx.fillStyle = '#1B1A17';
    ctx.font = 'bold 24px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(stepOrder > 0 ? `#${String(stepOrder).padStart(2, '0')}` : 'LEFT', 38, 56);

    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    const shortName = name.length > 15 ? name.slice(0, 14) + '…' : name;
    ctx.fillText(shortName.toUpperCase(), 38, 86, 180);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  getMattressQuiltTexture(): THREE.CanvasTexture {
    const key = 'mattress_quilt';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#F3EFE6';
    ctx.fillRect(0, 0, 256, 256);

    // Diamond quilt stitching
    ctx.strokeStyle = '#D5CFC2';
    ctx.lineWidth = 2;
    for (let i = -256; i < 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i + 256, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    this.textures.set(key, tex);
    return tex;
  }

  getMovingBlanketTexture(): THREE.CanvasTexture {
    const key = 'moving_blanket';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#5A5D60';
    ctx.fillRect(0, 0, 256, 256);

    // Zig-zag quilted blanket stitching
    ctx.strokeStyle = '#45484B';
    ctx.lineWidth = 2;
    for (let y = 16; y < 256; y += 24) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 16) {
        ctx.lineTo(x, y + (x % 32 === 0 ? -5 : 5));
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  getFragileStickerTexture(): THREE.CanvasTexture {
    const key = 'fragile_sticker';
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#C2362B';
    ctx.fillRect(0, 0, 256, 96);

    ctx.strokeStyle = '#FAF6EE';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 84);

    ctx.fillStyle = '#FAF6EE';
    ctx.font = '900 38px "Big Shoulders Stencil Display", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRAGILE', 128, 42);

    ctx.font = 'bold 14px "IBM Plex Mono", monospace';
    ctx.fillText('THIS WAY UP ↑', 128, 72);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  getLeftBehindBannerTexture(itemName: string): THREE.CanvasTexture {
    const key = `left_behind_${itemName}`;
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;

    // Stamp red tag with cream paper inner
    ctx.fillStyle = '#FAF6EE';
    ctx.fillRect(0, 0, 360, 120);
    ctx.strokeStyle = '#C2362B';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 352, 112);

    // Hand-drawn ghost doodle on left side of tag
    ctx.strokeStyle = '#C2362B';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(46, 48, 20, Math.PI, 0, false);
    ctx.lineTo(66, 92);
    ctx.lineTo(56, 83);
    ctx.lineTo(46, 92);
    ctx.lineTo(36, 83);
    ctx.lineTo(26, 92);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#C2362B';
    ctx.beginPath();
    ctx.arc(40, 48, 2.8, 0, Math.PI * 2);
    ctx.arc(52, 48, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Stencil "LEFT BEHIND" text
    ctx.fillStyle = '#C2362B';
    ctx.textAlign = 'left';
    ctx.font = '900 32px "Big Shoulders Stencil Display", sans-serif';
    ctx.fillText('LEFT BEHIND', 84, 50);

    ctx.fillStyle = '#1B1A17';
    ctx.font = 'bold 17px "IBM Plex Mono", monospace';
    const short = itemName.length > 20 ? itemName.slice(0, 19) + '…' : itemName;
    ctx.fillText(short.toUpperCase(), 84, 84);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  getManifestNumberSticker(stepOrder: number, name: string): THREE.CanvasTexture {
    const key = `manifest_tag_${stepOrder}_${name}`;
    if (this.textures.has(key)) return this.textures.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FAF6EE';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#1B1A17';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, 250, 90);

    ctx.fillStyle = '#F2D21B';
    ctx.fillRect(6, 6, 76, 84);

    ctx.fillStyle = '#1B1A17';
    ctx.font = 'bold 30px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(stepOrder > 0 ? `#${String(stepOrder).padStart(2, '0')}` : 'OUT', 44, 58);

    ctx.textAlign = 'left';
    ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
    const short = name.length > 13 ? name.slice(0, 12) + '…' : name;
    ctx.fillText(short.toUpperCase(), 92, 54);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  disposeAll() {
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
    this.materials.forEach((m) => m.dispose());
    this.materials.clear();
  }
}

export const assetCache = new ProceduralAssetCache();

/**
 * Builds the realistic procedural panel van, interior plywood cargo walls, ribbed floor,
 * tie-down rails, interior ceiling light, cutaway camera-facing wall, open rear barn doors (100°),
 * cab with tinted windscreen, 4 wheels, wing mirrors, headlights, rear bumper, and tarmac/kerb road.
 *
 * CRITICAL: The cargo interior space (x: 0..L, y: 0..H, z: 0..W) matches the VanPreset 100%.
 */
export function buildRealisticVanScene(
  van: VanPreset,
  vanStructureGroup: THREE.Group,
  castShadow: boolean
): void {
  const L = van.length_cm; // Cargo length along X (0 = cab bulkhead, L = rear doors)
  const W = van.width_cm;  // Cargo width along Z (0 = far wall, W = cutaway wall facing camera)
  const H = van.height_cm; // Cargo height along Y (0 = cargo deck floor, H = ceiling)

  const chassisDrop = 34; // Ground tarmac sits at y = -chassisDrop (-34cm below cargo floor)
  const groundY = -chassisDrop;

  // Materials
  const vanBodyPaintMat = new THREE.MeshStandardMaterial({
    color: 0xebe5d8, // Warm commercial parchment white
    roughness: 0.32,
    metalness: 0.15,
  });
  const vanCutawayMat = new THREE.MeshStandardMaterial({
    color: 0xebe5d8,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.14, // 86% transparent cutaway side wall facing camera
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const plywoodMat = new THREE.MeshStandardMaterial({
    map: assetCache.getPlywoodTexture(),
    roughness: 0.78,
    metalness: 0.05,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: assetCache.getRibbedFloorTexture(),
    roughness: 0.88,
    metalness: 0.1,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1b1a17,
    roughness: 0.7,
    metalness: 0.2,
  });
  const railMetalMat = new THREE.MeshStandardMaterial({
    color: 0x8c877e,
    roughness: 0.4,
    metalness: 0.75,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c2426,
    roughness: 0.12,
    metalness: 0.1,
    transmission: 0.45,
    transparent: true,
    opacity: 0.82,
  });

  // 1. Tarmac Ground Plane, Parking Bay Line & Pavement Kerb behind the van
  const tarmacGeo = new THREE.PlaneGeometry(2800, 2800);
  const tarmacMat = new THREE.MeshStandardMaterial({
    map: assetCache.getTarmacTexture(),
    roughness: 0.92,
    metalness: 0.04,
  });
  const tarmacMesh = new THREE.Mesh(tarmacGeo, tarmacMat);
  tarmacMesh.rotation.x = -Math.PI / 2;
  tarmacMesh.position.set(L / 2, groundY, W / 2);
  tarmacMesh.receiveShadow = true;
  vanStructureGroup.add(tarmacMesh);

  // Soft contact shadow directly under the van chassis
  const shadowPlaneGeo = new THREE.PlaneGeometry(L + 135, W + 45);
  const shadowPlaneMat = new THREE.MeshBasicMaterial({
    color: 0x0e0d0b,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(L / 2 - 38, groundY + 0.3, W / 2);
  vanStructureGroup.add(shadowPlane);

  // Painted yellow parking bay lines around the van
  const bayLineMat = new THREE.MeshBasicMaterial({ color: 0xf2d21b });
  const frontBayLine = new THREE.Mesh(new THREE.PlaneGeometry(L + 180, 8), bayLineMat);
  frontBayLine.rotation.x = -Math.PI / 2;
  frontBayLine.position.set(L / 2 - 35, groundY + 0.4, W + 52);
  vanStructureGroup.add(frontBayLine);

  const backBayLine = new THREE.Mesh(new THREE.PlaneGeometry(L + 180, 8), bayLineMat);
  backBayLine.rotation.x = -Math.PI / 2;
  backBayLine.position.set(L / 2 - 35, groundY + 0.4, -52);
  vanStructureGroup.add(backBayLine);

  // Raised Pavement & Kerb behind the van (x > L + 34) where items queue
  const kerbStart = L + 36;
  const pavementWidth = 540;
  const pavementDepth = 680;
  const kerbGeo = new THREE.BoxGeometry(pavementWidth, 10, pavementDepth);
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0x9e988e,
    roughness: 0.88,
    metalness: 0.05,
  });
  const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
  kerbMesh.position.set(kerbStart + pavementWidth / 2, groundY + 5, W / 2);
  kerbMesh.receiveShadow = true;
  vanStructureGroup.add(kerbMesh);

  // 2. Cargo Interior: Ribbed Anti-Slip Floor (top surface strictly at y = 0)
  const floorThickness = 5;
  const floorGeo = new THREE.BoxGeometry(L, floorThickness, W);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(L / 2, -floorThickness / 2, W / 2);
  floorMesh.receiveShadow = true;
  vanStructureGroup.add(floorMesh);

  // Subtle 50cm floor grid lines so measurements remain verifiable at a glance
  const gridPoints: THREE.Vector3[] = [];
  for (let x = 0; x <= L; x += 50) {
    gridPoints.push(new THREE.Vector3(x, 0.15, 0), new THREE.Vector3(x, 0.15, W));
  }
  for (let z = 0; z <= W; z += 50) {
    gridPoints.push(new THREE.Vector3(0, 0.15, z), new THREE.Vector3(L, 0.15, z));
  }
  const gridLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0xc8a26b, transparent: true, opacity: 0.32 })
  );
  vanStructureGroup.add(gridLines);

  // 3. Plywood-Lined Interior Walls (Far Wall z = 0, Bulkhead Wall x = 0)
  const wallThick = 4;

  // Far Side Wall (z = -wallThick/2 so inner face is at z = 0)
  const farWallInner = new THREE.Mesh(new THREE.BoxGeometry(L, H, wallThick / 2), plywoodMat);
  farWallInner.position.set(L / 2, H / 2, -wallThick / 4);
  farWallInner.receiveShadow = true;
  vanStructureGroup.add(farWallInner);

  const farWallOuter = new THREE.Mesh(
    new THREE.BoxGeometry(L + 4, H + 6, wallThick / 2),
    vanBodyPaintMat
  );
  farWallOuter.position.set(L / 2, H / 2, -wallThick * 0.75);
  farWallOuter.castShadow = castShadow;
  vanStructureGroup.add(farWallOuter);

  // Tie-down rails along the far plywood wall
  for (const railY of [H * 0.34, H * 0.68]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L - 6, 4.5, 1.5), railMetalMat);
    rail.position.set(L / 2, railY, 0.8);
    vanStructureGroup.add(rail);
  }

  // Front Cab Bulkhead Wall (x = -wallThick/2 so inner face is at x = 0)
  const bulkheadInner = new THREE.Mesh(new THREE.BoxGeometry(wallThick / 2, H, W), plywoodMat);
  bulkheadInner.position.set(-wallThick / 4, H / 2, W / 2);
  bulkheadInner.receiveShadow = true;
  vanStructureGroup.add(bulkheadInner);

  const bulkheadOuter = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick / 2, H + 4, W + 4),
    vanBodyPaintMat
  );
  bulkheadOuter.position.set(-wallThick * 0.75, H / 2, W / 2);
  vanStructureGroup.add(bulkheadOuter);

  // 4. Cutaway Side Wall Facing Camera (z = W, 85% transparent) + Rounded Roof Rib
  const cutawayWall = new THREE.Mesh(new THREE.BoxGeometry(L, H, 1.5), vanCutawayMat);
  cutawayWall.position.set(L / 2, H / 2, W + 0.8);
  cutawayWall.renderOrder = 3;
  vanStructureGroup.add(cutawayWall);

  // Structural ink wireframe around the exact cargo space (0..L, 0..H, 0..W)
  const cargoFrameEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)),
    new THREE.LineBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.6 })
  );
  cargoFrameEdges.position.set(L / 2, H / 2, W / 2);
  vanStructureGroup.add(cargoFrameEdges);

  // Slightly rounded roof crown along the top of the van (leave center cutaway clear)
  const roofRailBack = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, L + 6, 12, 1, false, 0, Math.PI),
    vanBodyPaintMat
  );
  roofRailBack.rotation.z = Math.PI / 2;
  roofRailBack.position.set(L / 2, H + 1, 0);
  vanStructureGroup.add(roofRailBack);

  const roofArchFront = new THREE.Mesh(new THREE.BoxGeometry(8, 5, W + 6), vanBodyPaintMat);
  roofArchFront.position.set(2, H + 2.5, W / 2);
  vanStructureGroup.add(roofArchFront);

  const roofArchRear = new THREE.Mesh(new THREE.BoxGeometry(8, 5, W + 6), vanBodyPaintMat);
  roofArchRear.position.set(L - 2, H + 2.5, W / 2);
  vanStructureGroup.add(roofArchRear);

  // Small interior ceiling light fixture + warm interior PointLight
  const ceilingFixture = new THREE.Mesh(
    new THREE.BoxGeometry(24, 2.5, 10),
    new THREE.MeshBasicMaterial({ color: 0xfffbeb })
  );
  ceilingFixture.position.set(L / 2, H - 1, W / 2);
  vanStructureGroup.add(ceilingFixture);

  const interiorLight = new THREE.PointLight(0xffedd5, 0.55, Math.max(L, W) * 1.6, 1.2);
  interiorLight.position.set(L / 2, H - 6, W / 2);
  vanStructureGroup.add(interiorLight);

  // 5. Open Rear Barn Doors (Swung out 100 degrees at x = L)
  const doorWidth = W / 2;
  const doorAngle = (100 * Math.PI) / 180; // 100° open

  // Far rear door (hinged at x = L, z = 0, swings outward toward -Z)
  const leftDoorPivot = new THREE.Group();
  leftDoorPivot.position.set(L, H / 2, 0);
  leftDoorPivot.rotation.y = doorAngle;

  const leftDoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, H - 2, doorWidth),
    vanBodyPaintMat
  );
  leftDoorPanel.position.set(0, 0, doorWidth / 2);
  leftDoorPanel.castShadow = castShadow;
  leftDoorPivot.add(leftDoorPanel);

  const leftDoorLining = new THREE.Mesh(
    new THREE.BoxGeometry(1, H - 10, doorWidth - 8),
    plywoodMat
  );
  leftDoorLining.position.set(-1.9, 0, doorWidth / 2);
  leftDoorPivot.add(leftDoorLining);
  vanStructureGroup.add(leftDoorPivot);

  // Near rear door (hinged at x = L, z = W, swings outward toward +Z)
  const rightDoorPivot = new THREE.Group();
  rightDoorPivot.position.set(L, H / 2, W);
  rightDoorPivot.rotation.y = -doorAngle;

  const rightDoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, H - 2, doorWidth),
    vanCutawayMat
  );
  rightDoorPanel.position.set(0, 0, -doorWidth / 2);
  rightDoorPivot.add(rightDoorPanel);
  vanStructureGroup.add(rightDoorPivot);

  // Rear Step Bumper & Lower Chassis Skirt
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(12, 14, W + 12), darkTrimMat);
  rearBumper.position.set(L + 4, -10, W / 2);
  vanStructureGroup.add(rearBumper);

  const chassisSkirt = new THREE.Mesh(
    new THREE.BoxGeometry(L + 8, 16, W - 8),
    darkTrimMat
  );
  chassisSkirt.position.set(L / 2, -12, W / 2);
  vanStructureGroup.add(chassisSkirt);

  // 6. Front Cab (x < 0) with Windscreen, Bonnet, Grille, Headlights & Wing Mirrors
  const cabGroup = new THREE.Group();
  const cabLen = 96;
  const cabH = Math.min(H * 0.88, 152);

  // Lower cab engine bay / bonnet
  const bonnetH = cabH * 0.48;
  const bonnetMesh = new THREE.Mesh(
    new THREE.BoxGeometry(cabLen, bonnetH, W),
    vanBodyPaintMat
  );
  bonnetMesh.position.set(-cabLen / 2 - 2, bonnetH / 2 - 6, W / 2);
  bonnetMesh.castShadow = castShadow;
  cabGroup.add(bonnetMesh);

  // Upper cab cabin
  const upperCabLen = cabLen * 0.62;
  const upperCabH = cabH * 0.52;
  const upperCabMesh = new THREE.Mesh(
    new THREE.BoxGeometry(upperCabLen, upperCabH, W - 4),
    vanBodyPaintMat
  );
  upperCabMesh.position.set(-upperCabLen / 2 - 2, bonnetH + upperCabH / 2 - 6, W / 2);
  upperCabMesh.castShadow = castShadow;
  cabGroup.add(upperCabMesh);

  // Sloped Dark Tinted Glass Windscreen
  const windscreenGeo = new THREE.BoxGeometry(4, upperCabH * 0.92, W - 14);
  const windscreenMesh = new THREE.Mesh(windscreenGeo, glassMat);
  windscreenMesh.position.set(-upperCabLen - 4, bonnetH + upperCabH * 0.45 - 6, W / 2);
  windscreenMesh.rotation.z = -0.34;
  cabGroup.add(windscreenMesh);

  // Side cab windows
  const sideWinGeo = new THREE.BoxGeometry(upperCabLen * 0.72, upperCabH * 0.68, 2);
  const sideWinLeft = new THREE.Mesh(sideWinGeo, glassMat);
  sideWinLeft.position.set(-upperCabLen * 0.52, bonnetH + upperCabH * 0.48 - 6, 0);
  cabGroup.add(sideWinLeft);

  const sideWinRight = new THREE.Mesh(sideWinGeo, glassMat);
  sideWinRight.position.set(-upperCabLen * 0.52, bonnetH + upperCabH * 0.48 - 6, W - 2);
  cabGroup.add(sideWinRight);

  // Wing Mirrors (Left & Right)
  const mirrorGeo = new THREE.BoxGeometry(8, 18, 12);
  const mirrorLeft = new THREE.Mesh(mirrorGeo, darkTrimMat);
  mirrorLeft.position.set(-upperCabLen * 0.75, bonnetH + 10, -8);
  cabGroup.add(mirrorLeft);

  const mirrorRight = new THREE.Mesh(mirrorGeo, darkTrimMat);
  mirrorRight.position.set(-upperCabLen * 0.75, bonnetH + 10, W + 8);
  cabGroup.add(mirrorRight);

  // Front Bumper, Grille & Warm Headlights
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(10, 14, W + 8), darkTrimMat);
  frontBumper.position.set(-cabLen - 4, -8, W / 2);
  cabGroup.add(frontBumper);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(3, bonnetH * 0.55, W * 0.58), darkTrimMat);
  grille.position.set(-cabLen - 3, bonnetH * 0.42 - 6, W / 2);
  cabGroup.add(grille);

  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const headlightGeo = new THREE.BoxGeometry(4, 10, 18);
  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-cabLen - 3, bonnetH * 0.52 - 6, 16);
  cabGroup.add(hlLeft);

  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(-cabLen - 3, bonnetH * 0.52 - 6, W - 16);
  cabGroup.add(hlRight);

  vanStructureGroup.add(cabGroup);

  // 7. 4 Wheels with Tyres & Metallic Hubs
  const wheelRadius = 26;
  const wheelWidth = 14;
  const wheelY = groundY + wheelRadius;
  const tyreGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  tyreGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, wheelWidth + 1.5, 16);
  hubGeo.rotateX(Math.PI / 2);

  const wheelPositions = [
    { x: -cabLen * 0.58, z: -3 },
    { x: -cabLen * 0.58, z: W + 3 },
    { x: L * 0.72, z: -3 },
    { x: L * 0.72, z: W + 3 },
  ];

  for (const wp of wheelPositions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wp.x, wheelY, wp.z);

    const tyre = new THREE.Mesh(tyreGeo, darkTrimMat);
    tyre.castShadow = castShadow;
    wheelGroup.add(tyre);

    const hub = new THREE.Mesh(hubGeo, railMetalMat);
    wheelGroup.add(hub);

    vanStructureGroup.add(wheelGroup);
  }
}

/**
 * Attaches a red "FRAGILE" sticker on the side of fragile items (instead of a glowing outline).
 */
function addFragileSticker(group: THREE.Group, w: number, h: number, d: number) {
  const stickerW = Math.min(26, w * 0.65);
  const stickerH = Math.min(10, h * 0.45);
  if (stickerW < 6 || stickerH < 3) return;

  const stickerGeo = new THREE.PlaneGeometry(stickerW, stickerH);
  const stickerMat = new THREE.MeshBasicMaterial({
    map: assetCache.getFragileStickerTexture(),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // Sticker facing +Z (cutaway side)
  const frontSticker = new THREE.Mesh(stickerGeo, stickerMat);
  frontSticker.position.set(0, 0, d / 2 + 0.25);
  group.add(frontSticker);

  // Sticker facing +X (rear doors side)
  const rearStickerW = Math.min(26, d * 0.65);
  if (rearStickerW >= 8) {
    const rearSticker = new THREE.Mesh(
      new THREE.PlaneGeometry(rearStickerW, stickerH),
      stickerMat
    );
    rearSticker.rotation.y = Math.PI / 2;
    rearSticker.position.set(w / 2 + 0.25, 0, 0);
    group.add(rearSticker);
  }
}

/**
 * Attaches a small manifest step sticker (#Step + Name) on non-box furniture/appliances.
 */
function addManifestTagSticker(
  group: THREE.Group,
  stepOrder: number,
  name: string,
  w: number,
  h: number,
  d: number
) {
  const tagW = Math.min(24, w * 0.55);
  const tagH = Math.min(9, h * 0.38);
  if (tagW < 8 || tagH < 3.5) return;

  const tagMat = new THREE.MeshBasicMaterial({
    map: assetCache.getManifestNumberSticker(stepOrder, name),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(tagW, tagH), tagMat);
  tagMesh.position.set(0, Math.min(h * 0.22, h / 2 - tagH), d / 2 + 0.22);
  group.add(tagMesh);
}

/**
 * Builds a realistic procedural 3D item whose outer bounding box strictly equals
 * the deterministic packer dimensions (item.w_cm × item.h_cm × item.d_cm).
 */
export function buildRealisticItemMesh(
  item: PlacedItem,
  lowDetail: boolean,
  castShadow: boolean
): {
  group: THREE.Group;
  hitBox: THREE.Mesh;
  proofPassEdge: THREE.LineSegments;
  proofFailEdge: THREE.LineSegments;
  selectedEdge: THREE.LineSegments;
} {
  const w = item.w_cm;
  const h = item.h_cm;
  const d = item.d_cm;
  const isLeftover = Boolean(item.isLeftover);
  const nameLower = item.name.toLowerCase();

  const group = new THREE.Group();
  const visualGroup = new THREE.Group();
  group.add(visualGroup);

  const radius = Math.min(0.6, Math.min(w, h, d) * 0.06);

  if (lowDetail) {
    // Low-detail fallback: plain textured box at exact packer dimensions
    const sideMat = new THREE.MeshStandardMaterial({
      map: assetCache.getCardboardSidesTexture(),
      roughness: 0.75,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: assetCache.getCardboardTopTexture(item.stepOrder, item.name),
      roughness: 0.7,
    });
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      sideMat,
      sideMat,
      topMat,
      sideMat,
      sideMat,
      sideMat,
    ]);
    boxMesh.castShadow = castShadow;
    boxMesh.receiveShadow = castShadow;
    visualGroup.add(boxMesh);
  } else if (item.category === 'Boxes' || nameLower.includes('box')) {
    // 1. CARDBOARD BOX: Bevelled edges (0.5cm), kraft texture, brown tape strip, printed label
    const sideMat = new THREE.MeshStandardMaterial({
      map: assetCache.getCardboardSidesTexture(),
      roughness: 0.8,
      metalness: 0.02,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: assetCache.getCardboardTopTexture(item.stepOrder, item.name),
      roughness: 0.75,
      metalness: 0.02,
    });
    const geo = new RoundedBoxGeometry(w, h, d, 2, 0.5);
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    visualGroup.add(mesh);
  } else if (nameLower.includes('mattress')) {
    // 2. MATTRESS: Soft rounded slab with off-white quilted fabric texture
    const mat = new THREE.MeshStandardMaterial({
      map: assetCache.getMattressQuiltTexture(),
      roughness: 0.9,
      metalness: 0.0,
    });
    const r = Math.min(3.5, Math.min(w, h, d) * 0.22);
    const geo = new RoundedBoxGeometry(w, h, d, 3, r);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    visualGroup.add(mesh);
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('sofa') || nameLower.includes('couch')) {
    // 3. SOFA: Base, 2 seat cushions, backrest, and arms built from rounded boxes (strictly within w x h x d)
    const fabricMat = new THREE.MeshStandardMaterial({
      color: 0x6e5a4f,
      roughness: 0.92,
      metalness: 0.02,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: 0x7c665a,
      roughness: 0.9,
      metalness: 0.02,
    });

    const armW = w * 0.12;
    const innerW = w - armW * 2;
    const baseH = h * 0.28;
    const seatH = h * 0.24;
    const backD = d * 0.26;

    // Base plinth
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(w, baseH, d, 2, 1.5),
      fabricMat
    );
    base.position.set(0, -h / 2 + baseH / 2, 0);
    base.castShadow = castShadow;
    visualGroup.add(base);

    // Backrest
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(innerW, h - baseH, backD, 2, 2),
      fabricMat
    );
    back.position.set(0, baseH / 2, -d / 2 + backD / 2);
    back.castShadow = castShadow;
    visualGroup.add(back);

    // Left & Right Arms
    const armH = h * 0.72;
    const leftArm = new THREE.Mesh(
      new RoundedBoxGeometry(armW, armH, d, 2, 2),
      fabricMat
    );
    leftArm.position.set(-w / 2 + armW / 2, -h / 2 + armH / 2, 0);
    visualGroup.add(leftArm);

    const rightArm = new THREE.Mesh(
      new RoundedBoxGeometry(armW, armH, d, 2, 2),
      fabricMat
    );
    rightArm.position.set(w / 2 - armW / 2, -h / 2 + armH / 2, 0);
    visualGroup.add(rightArm);

    // 2 Seat Cushions
    const cushW = innerW / 2 - 0.6;
    const cushD = d - backD - 1;
    const cush1 = new THREE.Mesh(
      new RoundedBoxGeometry(cushW, seatH, cushD, 2, 2),
      cushionMat
    );
    cush1.position.set(-cushW / 2 - 0.3, -h / 2 + baseH + seatH / 2, backD / 2);
    visualGroup.add(cush1);

    const cush2 = new THREE.Mesh(
      new RoundedBoxGeometry(cushW, seatH, cushD, 2, 2),
      cushionMat
    );
    cush2.position.set(cushW / 2 + 0.3, -h / 2 + baseH + seatH / 2, backD / 2);
    visualGroup.add(cush2);

    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('bookshelf') || nameLower.includes('shelf') || nameLower.includes('bookcase')) {
    // 4. BOOKSHELF: Outer timber frame + 4 shelves inside w x h x d
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.72,
      metalness: 0.05,
    });
    const t = Math.max(2, Math.min(w, d) * 0.07);

    // Back panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), woodMat);
    back.position.set(0, 0, -d / 2 + t / 2);
    visualGroup.add(back);

    // Left & Right side uprights
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), woodMat);
    leftSide.position.set(-w / 2 + t / 2, 0, 0);
    visualGroup.add(leftSide);

    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), woodMat);
    rightSide.position.set(w / 2 - t / 2, 0, 0);
    visualGroup.add(rightSide);

    // Top, Bottom + 4 interior shelves
    const shelfCount = 5;
    for (let i = 0; i <= shelfCount; i++) {
      const sy = -h / 2 + t / 2 + (i * (h - t)) / shelfCount;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - t * 2, t, d - t), woodMat);
      shelf.position.set(0, sy, t / 2);
      visualGroup.add(shelf);
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('fridge') || nameLower.includes('freezer') || item.category === 'Appliances') {
    // 5. FRIDGE-FREEZER: White glossy body, two doors, vertical metallic handle
    const whiteGloss = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0,
      roughness: 0.22,
      metalness: 0.12,
    });
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x2b2a27,
      roughness: 0.6,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.3,
      metalness: 0.8,
    });

    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d - 1.5, 2, 1.2), whiteGloss);
    body.position.set(0, 0, -0.75);
    body.castShadow = castShadow;
    visualGroup.add(body);

    // Split line between upper freezer door and lower fridge door
    const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 1.2, 2), seamMat);
    seam.position.set(0, h * 0.12, d / 2 - 1);
    visualGroup.add(seam);

    // Vertical handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(1.8, h * 0.45, 1.5), handleMat);
    handle.position.set(w * 0.36, -h * 0.08, d / 2 - 0.75);
    visualGroup.add(handle);

    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('tv') || nameLower.includes('television') || nameLower.includes('monitor')) {
    // 6. TV: Thin dark slab wrapped in padded grey moving blanket + straps
    const blanketMat = new THREE.MeshStandardMaterial({
      map: assetCache.getMovingBlanketTexture(),
      roughness: 0.88,
    });
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.25,
      metalness: 0.4,
    });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.7 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.8), blanketMat);
    body.castShadow = castShadow;
    visualGroup.add(body);

    // Inner screen patch showing through protective wrap
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, h * 0.65, d + 0.3), screenMat);
    visualGroup.add(patch);

    // Securing straps
    for (const sx of [-w * 0.28, w * 0.28]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(2.2, h + 0.5, d + 0.5), strapMat);
      strap.position.set(sx, 0, 0);
      visualGroup.add(strap);
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('suitcase') || item.category === 'Luggage') {
    // 7. SUITCASE: Hard shell with ribs, top handle, and wheels inside w x h x d
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x9e473b,
      roughness: 0.4,
      metalness: 0.18,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.7 });

    const wheelH = Math.min(3, h * 0.08);
    const handleH = Math.min(3, h * 0.08);
    const bodyH = h - wheelH - handleH;

    const shell = new THREE.Mesh(
      new RoundedBoxGeometry(w, bodyH, d, 2, 2),
      shellMat
    );
    shell.position.set(0, (wheelH - handleH) / 2, 0);
    shell.castShadow = castShadow;
    visualGroup.add(shell);

    // Moulded shell ribs
    for (const offset of [-0.25, 0, 0.25]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.85, 1.2, d + 0.4),
        shellMat
      );
      rib.position.set(0, bodyH * offset, 0);
      visualGroup.add(rib);
    }

    // Top handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, handleH, d * 0.25), trimMat);
    handle.position.set(0, h / 2 - handleH / 2, 0);
    visualGroup.add(handle);

    // 4 small wheels at bottom corners
    for (const wx of [-w * 0.35, w * 0.35]) {
      for (const wz of [-d * 0.35, d * 0.35]) {
        const wheel = new THREE.Mesh(new THREE.BoxGeometry(2.5, wheelH, 2.5), trimMat);
        wheel.position.set(wx, -h / 2 + wheelH / 2, wz);
        visualGroup.add(wheel);
      }
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('desk') || nameLower.includes('table')) {
    // 8. DESK: Timber top slab + 4 metal/wood legs inside w x h x d
    const topWood = new THREE.MeshStandardMaterial({ color: 0xa47549, roughness: 0.65 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x262523, roughness: 0.5, metalness: 0.5 });

    const topThick = Math.max(3.5, h * 0.08);
    const topMesh = new THREE.Mesh(new RoundedBoxGeometry(w, topThick, d, 2, 0.6), topWood);
    topMesh.position.set(0, h / 2 - topThick / 2, 0);
    topMesh.castShadow = castShadow;
    visualGroup.add(topMesh);

    const legW = Math.max(3, Math.min(w, d) * 0.07);
    const legH = h - topThick;
    for (const lx of [-w / 2 + legW, w / 2 - legW]) {
      for (const lz of [-d / 2 + legW, d / 2 - legW]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW), legMat);
        leg.position.set(lx, -topThick / 2, lz);
        visualGroup.add(leg);
      }
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('chair')) {
    // 9. CHAIR: Seat, backrest, central pedestal & star base inside w x h x d
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x383633, roughness: 0.85 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.5, metalness: 0.4 });

    const seatY = -h * 0.06;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(w * 0.82, h * 0.1, d * 0.82, 2, 1.5), seatMat);
    seat.position.set(0, seatY, 0);
    visualGroup.add(seat);

    const back = new THREE.Mesh(
      new RoundedBoxGeometry(w * 0.76, h * 0.48, d * 0.14, 2, 1.5),
      seatMat
    );
    back.position.set(0, seatY + h * 0.28, -d * 0.34);
    visualGroup.add(back);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, h * 0.42, 10), frameMat);
    post.position.set(0, -h * 0.28, 0);
    visualGroup.add(post);

    const baseBar1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 3, 4), frameMat);
    baseBar1.position.set(0, -h / 2 + 2, 0);
    visualGroup.add(baseBar1);

    const baseBar2 = new THREE.Mesh(new THREE.BoxGeometry(4, 3, d * 0.85), frameMat);
    baseBar2.position.set(0, -h / 2 + 2, 0);
    visualGroup.add(baseBar2);
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('lamp')) {
    // 10. LAMP: Base, stem, and shade inside w x h x d
    const brassMat = new THREE.MeshStandardMaterial({ color: 0x9c7444, roughness: 0.35, metalness: 0.7 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.85 });

    const isHorizontal = w > h * 1.4;
    if (isHorizontal) {
      const box = new THREE.Mesh(
        new RoundedBoxGeometry(w, h, d, 2, 1),
        new THREE.MeshStandardMaterial({ map: assetCache.getMovingBlanketTexture(), roughness: 0.85 })
      );
      visualGroup.add(box);
    } else {
      const r = Math.min(w, d) / 2;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.85, 4, 16), brassMat);
      base.position.set(0, -h / 2 + 2, 0);
      visualGroup.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, h * 0.75, 10), brassMat);
      stem.position.set(0, -h * 0.08, 0);
      visualGroup.add(stem);

      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.65, r * 0.95, h * 0.28, 16),
        shadeMat
      );
      shade.position.set(0, h / 2 - h * 0.15, 0);
      visualGroup.add(shade);
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else if (nameLower.includes('plant')) {
    // 11. PLANT: Terracotta pot + leafy foliage inside w x h x d
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb35437, roughness: 0.82 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.78 });

    const r = Math.min(w, d) / 2;
    const potH = h * 0.38;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.56, potH, 16), potMat);
    pot.position.set(0, -h / 2 + potH / 2, 0);
    visualGroup.add(pot);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 14, 12), leafMat);
    canopy.scale.set(1, (h * 0.62) / (r * 1.84), 1);
    canopy.position.set(0, -h / 2 + potH + (h * 0.62) / 2 - 2, 0);
    visualGroup.add(canopy);
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  } else {
    // 12. GENERIC WRAPPED ITEM (moving blanket fabric with securing straps)
    const blanketMat = new THREE.MeshStandardMaterial({
      map: assetCache.getMovingBlanketTexture(),
      roughness: 0.88,
      metalness: 0.04,
    });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x9c7444, roughness: 0.6 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), blanketMat);
    body.castShadow = castShadow;
    body.receiveShadow = castShadow;
    visualGroup.add(body);

    for (const offset of [-0.26, 0.26]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(2, w * 0.04), h + 0.4, d + 0.4),
        strapMat
      );
      strap.position.set(w * offset, 0, 0);
      visualGroup.add(strap);
    }
    addManifestTagSticker(visualGroup, item.stepOrder, item.name, w, h, d);
  }

  // Red "FRAGILE" sticker on the side of fragile items (replaces glowing outline)
  if (item.fragile) {
    addFragileSticker(visualGroup, w, h, d);
  }

  // If leftover ("LEFT BEHIND"), add the red tag & hand-drawn ghost doodle above it on the pavement
  if (isLeftover) {
    const tagTex = assetCache.getLeftBehindBannerTexture(item.name);
    const tagSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false })
    );
    tagSprite.position.set(0, h / 2 + 18, 0);
    tagSprite.scale.set(52, 17, 1);
    group.add(tagSprite);
  }

  // Invisible exact packer bounding box for 100% accurate raycasting & bounding verification
  const exactBoxGeo = new THREE.BoxGeometry(w, h, d);
  const hitBox = new THREE.Mesh(
    exactBoxGeo,
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.userData = { instanceId: item.instanceId };
  group.add(hitBox);

  // Thin green outline (#2F6B3A) for "Show proof" and red outline (#C2362B) for rejected/leftover
  const proofEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.8, h + 0.8, d + 0.8));
  const proofPassEdge = new THREE.LineSegments(
    proofEdgesGeo,
    new THREE.LineBasicMaterial({ color: 0x2f6b3a })
  );
  proofPassEdge.visible = false;
  group.add(proofPassEdge);

  const proofFailEdge = new THREE.LineSegments(
    proofEdgesGeo,
    new THREE.LineBasicMaterial({ color: 0xc2362b })
  );
  proofFailEdge.visible = isLeftover;
  group.add(proofFailEdge);

  // Active selection outline in hi-vis yellow (#F2D21B)
  const selectedEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 2.0, h + 2.0, d + 2.0)),
    new THREE.LineBasicMaterial({ color: 0xf2d21b })
  );
  selectedEdge.visible = false;
  group.add(selectedEdge);

  return {
    group,
    hitBox,
    proofPassEdge,
    proofFailEdge,
    selectedEdge,
  };
}
