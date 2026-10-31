/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  VanPreset,
  MultiVanPackingResult,
  PlacedItem,
  ItemCategory,
} from '../types';
import { getLoadingInstruction } from './packer';
import { getLeftoverReason } from './vans';
import { verifySingleItem, ItemProofStatus } from './verifier';
import { buildRealisticVanScene, buildRealisticItemMesh } from './scene3dModels';
import { MovingDayVoiceMode } from './voiceMode';
import {
  MANIFEST_CATEGORY_COLORS,
  GhostDoodle,
  ManifestSheetHeader,
} from '../components/ManifestPrimitives';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  ShieldCheck,
  Camera,
  AlertTriangle,
  ArrowRight,
  Layers,
  X,
} from 'lucide-react';

interface Scene3DProps {
  vans: VanPreset[];
  packingResult: MultiVanPackingResult;
  selectedVanId: string;
  onSelectVan: (vanId: string) => void;
  onLoad1BedDemo?: () => void;
  onLoadStudioDemo?: () => void;
  onGoToResults?: () => void;
  tourForceProofOverlay?: boolean;
}

export type CameraPresetMode = 'rear' | 'cutaway' | 'top' | 'cinematic';

/** Tracks whether the 3D loading animation has auto-played once on first view */
let hasAutoPlayedFirstView = false;

interface ActiveSlideAnimation {
  instanceId: string;
  startPos: THREE.Vector3;
  doorEntryPos: THREE.Vector3;
  finalPos: THREE.Vector3;
  progress: number; // 0..1
}

/**
 * Computes the neat pavement waiting position behind the van for an item before it is loaded,
 * or for a leftover ("LEFT BEHIND") item that doesn't fit.
 */
function getPavementWaitingPosition(
  item: PlacedItem,
  index: number,
  vanLength: number,
  vanWidth: number,
  isLeftover: boolean
): THREE.Vector3 {
  const pavementSurfaceY = -24; // Top of raised pavement kerb behind the van
  const restingY = pavementSurfaceY + item.h_cm / 2;

  if (isLeftover) {
    // Leftover items sit prominently on the front pavement edge behind the rear doors
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = vanLength + 78 + row * 95;
    const z = (col - 1) * 105 + vanWidth / 2;
    return new THREE.Vector3(x, restingY, z);
  }

  // Queued items waiting to be loaded sit in a neat grid on the pavement behind the van
  const cols = 5;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = vanLength + 68 + row * 72;
  const z = (col - (cols - 1) / 2) * 76 + vanWidth / 2;
  return new THREE.Vector3(x, restingY, z);
}

/**
 * Formats the loading instruction in terse uppercase manifest style.
 */
function formatManifestInstruction(item: PlacedItem, allPlaced: PlacedItem[], van: VanPreset): string {
  if (item.isLeftover) {
    return `LEFT BEHIND · ${getLeftoverReason(item, van).toUpperCase()}`;
  }
  const raw = getLoadingInstruction(item, allPlaced);
  if (raw.includes('against the cab wall')) return 'LOAD ON FLOOR · AGAINST CAB WALL';
  if (raw.includes('on the van floor')) return 'LOAD ON VAN FLOOR';
  return raw.replace(/^Load\s+/i, '').toUpperCase();
}

/**
 * Screen 3: Realistic 3D Loading Scene ("The Removal Manifest" + Procedural Cutaway Panel Van).
 * Places every item at the EXACT coordinates, rotation, and bounding box from the deterministic packer.
 */
export const Scene3D: React.FC<Scene3DProps> = ({
  vans,
  packingResult,
  selectedVanId,
  onSelectVan,
  onLoad1BedDemo,
  onLoadStudioDemo,
  onGoToResults,
  tourForceProofOverlay,
}) => {
  const { vanProofs, recommendedVanId } = packingResult;
  const activeVan = useMemo(
    () => vans.find((v) => v.id === selectedVanId) || vans[0],
    [vans, selectedVanId]
  );
  const activeProof = useMemo(
    () => vanProofs[activeVan.id] || Object.values(vanProofs)[0],
    [vanProofs, activeVan.id]
  );

  const totalSteps = activeProof.placedItems.length;

  // Playback, camera, detail & overlay states
  const [visibleStepCount, setVisibleStepCount] = useState<number>(totalSteps);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.5);
  const [showProofOverlay, setShowProofOverlay] = useState<boolean>(false);
  const [lowDetail, setLowDetail] = useState<boolean>(false);
  const [aoEnabled, setAoEnabled] = useState<boolean>(true);
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPresetMode>('cutaway');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isVanFading, setIsVanFading] = useState<boolean>(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Sync tour proof overlay toggle if guided tour is active
  useEffect(() => {
    if (typeof tourForceProofOverlay === 'boolean') {
      setShowProofOverlay(tourForceProofOverlay);
    }
  }, [tourForceProofOverlay]);

  // Pre-compute per-item proof status for all placed and leftover items
  const itemProofMap = useMemo(() => {
    const map: Record<string, ItemProofStatus> = {};
    for (const item of activeProof.placedItems) {
      map[item.instanceId] = verifySingleItem(item, activeVan, activeProof.placedItems);
    }
    for (const lo of activeProof.leftoverItems) {
      map[lo.instanceId] = verifySingleItem(lo, activeVan, activeProof.placedItems);
    }
    return map;
  }, [activeProof, activeVan]);

  const sceneControllerRef = useRef<{
    triggerSlideIn: (instanceId: string) => void;
    setCameraPreset: (mode: CameraPresetMode) => void;
  } | null>(null);

  // Smooth fade when switching vans + auto-play loading animation once on first view
  useEffect(() => {
    setIsVanFading(true);
    const fadeTimer = window.setTimeout(() => setIsVanFading(false), 160);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!hasAutoPlayedFirstView && activeProof.placedItems.length > 0 && !prefersReducedMotion) {
      hasAutoPlayedFirstView = true;
      setVisibleStepCount(1);
      setIsPlaying(true);
      setSelectedInstanceId(activeProof.placedItems[0]?.instanceId || null);
      setTimeout(() => {
        if (activeProof.placedItems[0]) {
          sceneControllerRef.current?.triggerSlideIn(activeProof.placedItems[0].instanceId);
        }
      }, 60);
    } else {
      setIsPlaying(false);
      setVisibleStepCount(activeProof.placedItems.length);
      setSelectedInstanceId(null);
    }

    return () => window.clearTimeout(fadeTimer);
  }, [activeVan.id, activeProof.placedItems]);

  // Step playback timer: slides items one by one from pavement through the rear doors
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.max(160, Math.round(680 / playbackSpeed));
    const timer = window.setInterval(() => {
      setVisibleStepCount((prev) => {
        if (prev >= totalSteps) {
          setIsPlaying(false);
          return totalSteps;
        }
        const nextStep = prev + 1;
        const newlyPlaced = activeProof.placedItems[nextStep - 1];
        if (newlyPlaced) {
          sceneControllerRef.current?.triggerSlideIn(newlyPlaced.instanceId);
          setSelectedInstanceId(newlyPlaced.instanceId);
        }
        // When the final item is loaded, trigger the slow cinematic pull-back
        if (nextStep >= totalSteps) {
          setIsPlaying(false);
          setActiveCameraPreset('cinematic');
          sceneControllerRef.current?.setCameraPreset('cinematic');
        }
        return nextStep;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed, totalSteps, activeProof.placedItems]);

  // Auto-scroll checklist to selected item
  useEffect(() => {
    if (selectedInstanceId && rowRefs.current[selectedInstanceId]) {
      rowRefs.current[selectedInstanceId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedInstanceId]);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    // Start outside behind the rear doors when beginning loading animation
    if (visibleStepCount >= totalSteps && totalSteps > 0) {
      setActiveCameraPreset('rear');
      sceneControllerRef.current?.setCameraPreset('rear');
      setVisibleStepCount(1);
      const firstItem = activeProof.placedItems[0];
      if (firstItem) {
        setTimeout(() => {
          sceneControllerRef.current?.triggerSlideIn(firstItem.instanceId);
          setSelectedInstanceId(firstItem.instanceId);
        }, 30);
      }
    }
    setIsPlaying(true);
  }, [isPlaying, visibleStepCount, totalSteps, activeProof.placedItems]);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setVisibleStepCount((prev) => {
      const next = prev >= totalSteps ? 1 : prev + 1;
      const item = activeProof.placedItems[next - 1];
      if (item) {
        setTimeout(() => {
          sceneControllerRef.current?.triggerSlideIn(item.instanceId);
          setSelectedInstanceId(item.instanceId);
        }, 20);
      }
      if (next === totalSteps) {
        setActiveCameraPreset('cinematic');
        sceneControllerRef.current?.setCameraPreset('cinematic');
      }
      return next;
    });
  }, [totalSteps, activeProof.placedItems]);

  const handleResetAnimation = useCallback(() => {
    setIsPlaying(false);
    setVisibleStepCount(0);
    setSelectedInstanceId(null);
    setActiveCameraPreset('rear');
    sceneControllerRef.current?.setCameraPreset('rear');
  }, []);

  const handleShowAll = useCallback(() => {
    setIsPlaying(false);
    setVisibleStepCount(totalSteps);
    setActiveCameraPreset('cutaway');
    sceneControllerRef.current?.setCameraPreset('cutaway');
  }, [totalSteps]);

  const handleSelectCameraPreset = useCallback((mode: CameraPresetMode) => {
    setActiveCameraPreset(mode);
    sceneControllerRef.current?.setCameraPreset(mode);
  }, []);

  // Active item for the manifest step line caption
  const activeStepItem: PlacedItem | null = useMemo(() => {
    if (selectedInstanceId) {
      const found =
        activeProof.placedItems.find((p) => p.instanceId === selectedInstanceId) ||
        activeProof.leftoverItems.find((p) => p.instanceId === selectedInstanceId);
      if (found) return found;
    }
    if (visibleStepCount > 0 && visibleStepCount <= activeProof.placedItems.length) {
      return activeProof.placedItems[visibleStepCount - 1];
    }
    return activeProof.placedItems[0] || null;
  }, [selectedInstanceId, visibleStepCount, activeProof]);

  // Inspected item for the manifest-style 3-stamp tooltip card
  const inspectedItem: PlacedItem | null = useMemo(() => {
    const targetId = selectedInstanceId || hoveredInstanceId;
    if (!targetId) return null;
    return (
      activeProof.placedItems.find((p) => p.instanceId === targetId) ||
      activeProof.leftoverItems.find((p) => p.instanceId === targetId) ||
      null
    );
  }, [selectedInstanceId, hoveredInstanceId, activeProof]);

  const stateRef = useRef({
    activeVan,
    activeProof,
    visibleStepCount,
    showProofOverlay,
    lowDetail,
    aoEnabled,
    selectedInstanceId,
    playbackSpeed,
    itemProofMap,
  });
  stateRef.current = {
    activeVan,
    activeProof,
    visibleStepCount,
    showProofOverlay,
    lowDetail,
    aoEnabled,
    selectedInstanceId,
    playbackSpeed,
    itemProofMap,
  };

  // ============================================================================
  // THREE.JS REALISTIC CUTAWAY VAN & PAVEMENT SLIDE-LOADING SCENE
  // ============================================================================
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL probe
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        setWebglError('WebGL is not supported or disabled in this browser.');
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      setWebglError('Could not initialize WebGL graphics context.');
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Failed to create Three.js WebGLRenderer.');
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 540;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene, Warm Daylight Sky Background & RoomEnvironment PMREM
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdad2c4); // Warm London overcast sky
    scene.fog = new THREE.FogExp2(0xdad2c4, 0.00042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls (can't go under ground)
    const camera = new THREE.PerspectiveCamera(40, width / height, 4, 4200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 120;
    controls.maxDistance = 1500;
    controls.maxPolarAngle = Math.PI / 2 - 0.03; // Never dip below tarmac ground

    const cameraGoalPos = new THREE.Vector3();
    const cameraGoalTarget = new THREE.Vector3();
    let isTransitioningCamera = false;
    let cameraDampSpeed = 5.5;

    controls.addEventListener('start', () => {
      isTransitioningCamera = false;
    });

    /**
     * Computes camera position & look-at target for each preset ("rear", "cutaway", "top", "cinematic").
     */
    function applyCameraPreset(mode: CameraPresetMode, immediate = false) {
      const van = stateRef.current.activeVan;
      const L = van.length_cm;
      const W = van.width_cm;
      const H = van.height_cm;
      const maxDim = Math.max(L, W, H);

      if (mode === 'rear') {
        // Outside behind the van, looking through the open rear doors
        cameraGoalPos.set(L * 0.85 + 280, H * 0.78 + 30, W * 0.48 + 115);
        cameraGoalTarget.set(0, H * 0.38, 0);
        cameraDampSpeed = 5.5;
      } else if (mode === 'top') {
        // Top-down architectural plan view
        cameraGoalPos.set(0, maxDim * 2.15 + 180, 24);
        cameraGoalTarget.set(0, 20, 0);
        cameraDampSpeed = 6.0;
      } else if (mode === 'cinematic') {
        // Slow cinematic pull-back showing the full loaded cutaway van & cab
        cameraGoalPos.set(maxDim * 0.48, H * 1.15 + 55, maxDim * 1.48 + 90);
        cameraGoalTarget.set(-20, H * 0.36, 0);
        cameraDampSpeed = 2.4;
      } else {
        // Side cutaway (default): clear view into the cutaway cargo bay & rear pavement
        cameraGoalPos.set(maxDim * 0.52, H * 1.2 + 45, maxDim * 1.28 + 60);
        cameraGoalTarget.set(10, H * 0.38, 0);
        cameraDampSpeed = 5.5;
      }

      if (immediate) {
        camera.position.copy(cameraGoalPos);
        controls.target.copy(cameraGoalTarget);
        controls.update();
        isTransitioningCamera = false;
      } else {
        isTransitioningCamera = true;
      }
    }

    // 4. Physically Correct Lighting: Warm Street/Garage Key Light + Cool Fill Light
    const warmKeyLight = new THREE.DirectionalLight(0xffe4bc, 2.2);
    warmKeyLight.position.set(260, 520, 340);
    warmKeyLight.castShadow = !isSoftwareGl;
    warmKeyLight.shadow.mapSize.width = 1024;
    warmKeyLight.shadow.mapSize.height = 1024;
    warmKeyLight.shadow.camera.near = 60;
    warmKeyLight.shadow.camera.far = 1600;
    const shadowBound = 520;
    warmKeyLight.shadow.camera.left = -shadowBound;
    warmKeyLight.shadow.camera.right = shadowBound;
    warmKeyLight.shadow.camera.top = shadowBound;
    warmKeyLight.shadow.camera.bottom = -shadowBound;
    warmKeyLight.shadow.bias = -0.0005;
    warmKeyLight.shadow.normalBias = 0.025;
    scene.add(warmKeyLight);

    const coolFillLight = new THREE.DirectionalLight(0xc7d8e8, 0.95);
    coolFillLight.position.set(-340, 280, -240);
    scene.add(coolFillLight);

    const ambientHemi = new THREE.HemisphereLight(0xf4efe6, 0x4a453d, 0.65);
    scene.add(ambientHemi);

    // 5. Post-Processing Ambient Occlusion (SSAOPass) with Auto-FPS Fallback (<40 FPS)
    let composer: EffectComposer | null = null;
    let ssaoPass: SSAOPass | null = null;
    if (!isSoftwareGl) {
      try {
        composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        ssaoPass = new SSAOPass(scene, camera, width, height);
        ssaoPass.kernelRadius = 14;
        ssaoPass.minDistance = 0.002;
        ssaoPass.maxDistance = 0.08;
        composer.addPass(ssaoPass);

        const outputPass = new OutputPass();
        composer.addPass(outputPass);
      } catch {
        composer = null;
        ssaoPass = null;
      }
    }

    // Scene groups
    const vanStructureGroup = new THREE.Group();
    const itemsRootGroup = new THREE.Group();
    scene.add(vanStructureGroup);
    scene.add(itemsRootGroup);

    const activeAnimations = new Map<string, ActiveSlideAnimation>();
    const itemEntriesMap = new Map<
      string,
      {
        group: THREE.Group;
        hitBox: THREE.Mesh;
        proofPassEdge: THREE.LineSegments;
        proofFailEdge: THREE.LineSegments;
        selectedEdge: THREE.LineSegments;
        itemData: PlacedItem;
        packedPos: THREE.Vector3;
        waitingPos: THREE.Vector3;
      }
    >();
    const raycastTargets: THREE.Object3D[] = [];

    function clearGroupResources(group: THREE.Group) {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        child.traverse((obj: any) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              // Do not dispose shared cached textures in assetCache
              m.dispose();
            }
          }
        });
      }
    }

    /**
     * Rebuilds the cutaway panel van and all realistic item meshes when the van preset,
     * packing result, or low-detail toggle changes.
     */
    function rebuildVanAndItems(preserveCamera = false) {
      const { activeVan: van, activeProof: proof, lowDetail: isLowDetail } = stateRef.current;

      activeAnimations.clear();
      clearGroupResources(vanStructureGroup);
      clearGroupResources(itemsRootGroup);
      itemEntriesMap.clear();
      raycastTargets.length = 0;

      const L = van.length_cm;
      const W = van.width_cm;

      // Center the cargo bay at world (-L/2, 0, -W/2) so packer (0..L, 0..H, 0..W) maps directly
      vanStructureGroup.position.set(-L / 2, 0, -W / 2);
      itemsRootGroup.position.set(-L / 2, 0, -W / 2);

      // Build procedural cutaway panel van, plywood walls, open rear doors, wheels, and tarmac
      buildRealisticVanScene(van, vanStructureGroup, !isSoftwareGl && !isLowDetail);

      // Build placed items
      proof.placedItems.forEach((item, index) => {
        const built = buildRealisticItemMesh(item, isLowDetail, !isSoftwareGl && !isLowDetail);

        // Exact deterministic packer center coordinate
        const packedPos = new THREE.Vector3(
          item.x_cm + item.w_cm / 2,
          item.y_cm + item.h_cm / 2,
          item.z_cm + item.d_cm / 2
        );
        const waitingPos = getPavementWaitingPosition(item, index, L, W, false);

        const isLoaded = item.stepOrder <= stateRef.current.visibleStepCount;
        built.group.position.copy(isLoaded ? packedPos : waitingPos);

        itemsRootGroup.add(built.group);
        raycastTargets.push(built.hitBox);

        itemEntriesMap.set(item.instanceId, {
          ...built,
          itemData: item,
          packedPos,
          waitingPos,
        });
      });

      // Build leftover ("LEFT BEHIND") items on the pavement behind the van
      proof.leftoverItems.forEach((item, index) => {
        const built = buildRealisticItemMesh(item, isLowDetail, !isSoftwareGl && !isLowDetail);
        const waitingPos = getPavementWaitingPosition(item, index, L, W, true);
        built.group.position.copy(waitingPos);

        itemsRootGroup.add(built.group);
        raycastTargets.push(built.hitBox);

        itemEntriesMap.set(item.instanceId, {
          ...built,
          itemData: item,
          packedPos: waitingPos,
          waitingPos,
        });
      });

      if (!preserveCamera) {
        applyCameraPreset('cutaway', false);
      }
    }

    /**
     * Triggers the smooth slide-and-settle loading animation from the pavement waiting spot
     * through the open rear doors to the exact deterministic packer coordinate.
     */
    function triggerSlideIn(instanceId: string) {
      const entry = itemEntriesMap.get(instanceId);
      if (!entry || entry.itemData.isLeftover) return;

      const van = stateRef.current.activeVan;
      const startPos = entry.waitingPos.clone();
      // Midpoint right at the open rear doors threshold
      const doorEntryPos = new THREE.Vector3(
        van.length_cm + 16,
        Math.max(entry.packedPos.y, entry.itemData.h_cm / 2 + 4),
        entry.packedPos.z
      );
      const finalPos = entry.packedPos.clone();

      entry.group.position.copy(startPos);
      activeAnimations.set(instanceId, {
        instanceId,
        startPos,
        doorEntryPos,
        finalPos,
        progress: 0,
      });
    }

    sceneControllerRef.current = {
      triggerSlideIn,
      setCameraPreset: (mode: CameraPresetMode) => applyCameraPreset(mode, false),
    };

    // Initial build (start behind rear doors looking into the van, then glide to cutaway)
    applyCameraPreset('rear', true);
    rebuildVanAndItems(false);

    let lastVanBuildSig = `${stateRef.current.activeVan.id}_${stateRef.current.activeVan.length_cm}_${stateRef.current.activeVan.width_cm}_${stateRef.current.activeVan.height_cm}_${stateRef.current.activeProof.placedItems.length}_${stateRef.current.activeProof.leftoverItems.length}_${stateRef.current.activeProof.totalWeightKg}`;
    let lastDetailFlag = stateRef.current.lowDetail;

    // 6. Raycasting for Hover & Click Inspection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastRaycastTime = 0;

    const handlePointerMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastRaycastTime < 35) return;
      lastRaycastTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(raycastTargets, false);

      if (hits.length > 0) {
        const hitId = hits[0].object.userData?.instanceId as string | undefined;
        if (hitId && itemEntriesMap.has(hitId)) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredInstanceId(hitId);
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredInstanceId(null);
    };

    const handlePointerLeave = () => {
      setHoveredInstanceId(null);
    };

    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handleClick = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(raycastTargets, false);

      if (hits.length > 0) {
        const hitId = hits[0].object.userData?.instanceId as string | undefined;
        if (hitId) {
          setSelectedInstanceId((prev) => (prev === hitId ? null : hitId));
          return;
        }
      }
      setSelectedInstanceId(null);
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('mouseleave', handlePointerLeave);
    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('click', handleClick);

    // 7. Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 8. Animation Loop + Automatic <40 FPS AO Guard
    const clock = new THREE.Clock();
    let frameId = 0;
    let isDisposed = false;
    let fpsSampleFrames = 0;
    let fpsSampleElapsed = 0;
    let aoAutoDisabled = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;

      const rawDelta = Math.min(clock.getDelta(), 0.1);
      const current = stateRef.current;

      // Monitor FPS and automatically disable AO if FPS < 40, or enable Low Detail if FPS < 30
      if (!isSoftwareGl && !current.lowDetail) {
        fpsSampleFrames++;
        fpsSampleElapsed += rawDelta;
        if (fpsSampleElapsed >= 1.5) {
          const avgFps = fpsSampleFrames / fpsSampleElapsed;
          if (avgFps < 30) {
            aoAutoDisabled = true;
            setAoEnabled(false);
            setLowDetail(true);
          } else if (avgFps < 40 && !aoAutoDisabled && current.aoEnabled) {
            aoAutoDisabled = true;
            setAoEnabled(false);
          }
          fpsSampleFrames = 0;
          fpsSampleElapsed = 0;
        }
      }

      // Check if van preset or detail mode changed
      const sig = `${current.activeVan.id}_${current.activeVan.length_cm}_${current.activeVan.width_cm}_${current.activeVan.height_cm}_${current.activeProof.placedItems.length}_${current.activeProof.leftoverItems.length}_${current.activeProof.totalWeightKg}`;
      if (sig !== lastVanBuildSig) {
        lastVanBuildSig = sig;
        rebuildVanAndItems(false);
      } else if (current.lowDetail !== lastDetailFlag) {
        lastDetailFlag = current.lowDetail;
        rebuildVanAndItems(true);
      }

      // Advance slide-and-settle animations through the rear doors
      if (activeAnimations.size > 0) {
        const stepSpeed = 1.65 * current.playbackSpeed;
        activeAnimations.forEach((anim, id) => {
          const entry = itemEntriesMap.get(id);
          if (!entry) {
            activeAnimations.delete(id);
            return;
          }

          anim.progress = Math.min(1, anim.progress + rawDelta * stepSpeed);
          const t = anim.progress;

          if (t < 1) {
            // Smooth cubic ease-out + tiny settle bounce at the end
            const eased = 1 - Math.pow(1 - t, 3);
            if (eased < 0.45) {
              // Phase 1: Slide from pavement queue to rear doors threshold
              const p1 = eased / 0.45;
              entry.group.position.lerpVectors(anim.startPos, anim.doorEntryPos, p1);
            } else {
              // Phase 2: Glide from rear doors threshold into exact packer coordinate + tiny settle bounce
              const p2 = (eased - 0.45) / 0.55;
              entry.group.position.lerpVectors(anim.doorEntryPos, anim.finalPos, p2);
              const bounce = Math.sin(p2 * Math.PI) * (1 - p2) * 3.2;
              entry.group.position.y += bounce;
            }
          } else {
            // Snap 100% to the exact deterministic packer coordinate
            entry.group.position.copy(anim.finalPos);
            activeAnimations.delete(id);
          }
        });
      }

      // Sync non-animating item positions (loaded inside van vs waiting on pavement) & outlines
      itemEntriesMap.forEach((entry, id) => {
        const { itemData, group, proofPassEdge, proofFailEdge, selectedEdge, packedPos, waitingPos } =
          entry;

        if (!itemData.isLeftover && !activeAnimations.has(id)) {
          const isLoaded = itemData.stepOrder <= current.visibleStepCount;
          const targetPos = isLoaded ? packedPos : waitingPos;
          group.position.copy(targetPos);
        }

        selectedEdge.visible = current.selectedInstanceId === id;

        if (current.showProofOverlay) {
          const pStatus = current.itemProofMap[id];
          const passed = pStatus ? pStatus.passed : !itemData.isLeftover;
          proofPassEdge.visible = passed;
          proofFailEdge.visible = !passed;
        } else {
          proofPassEdge.visible = false;
          proofFailEdge.visible = Boolean(itemData.isLeftover);
        }
      });

      // Smooth camera transition damping
      if (isTransitioningCamera) {
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          cameraGoalPos.x,
          cameraDampSpeed,
          rawDelta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          cameraGoalPos.y,
          cameraDampSpeed,
          rawDelta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          cameraGoalPos.z,
          cameraDampSpeed,
          rawDelta
        );

        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          cameraGoalTarget.x,
          cameraDampSpeed,
          rawDelta
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          cameraGoalTarget.y,
          cameraDampSpeed,
          rawDelta
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          cameraGoalTarget.z,
          cameraDampSpeed,
          rawDelta
        );

        if (camera.position.distanceTo(cameraGoalPos) < 1.8) {
          isTransitioningCamera = false;
        }
      }

      controls.update();

      const useComposer =
        !isSoftwareGl && composer && ssaoPass && current.aoEnabled && !current.lowDetail;
      if (useComposer) {
        ssaoPass!.enabled = true;
        composer!.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('mouseleave', handlePointerLeave);
      renderer.domElement.removeEventListener('mousedown', handlePointerDown);
      renderer.domElement.removeEventListener('click', handleClick);

      clearGroupResources(vanStructureGroup);
      clearGroupResources(itemsRootGroup);
      if (composer) composer.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Summarize leftover items for the failure banner
  const leftoverSummaryText = useMemo(() => {
    if (activeProof.leftoverItems.length === 0) return '';
    const counts = new Map<string, number>();
    for (const lo of activeProof.leftoverItems) {
      counts.set(lo.name, (counts.get(lo.name) || 0) + 1);
    }
    const list = Array.from(counts.entries())
      .slice(0, 4)
      .map(([name, qty]) => (qty > 1 ? `${name} (×${qty})` : name))
      .join(', ');
    return counts.size > 4 ? `${list}…` : list;
  }, [activeProof.leftoverItems]);

  const weightPct = Math.min(
    100,
    Math.round((activeProof.totalWeightKg / activeProof.maxPayloadKg) * 100)
  );

  // WebGL Fallback UI
  if (webglError) {
    return (
      <div className="manifest-sheet p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-[#C2362B] mx-auto" />
        <h2 className="text-2xl font-bold font-display text-[#1B1A17]">
          3D LOADING BAY UNAVAILABLE ({webglError})
        </h2>
        <p className="text-xs font-mono text-[#1B1A17]/80 max-w-md mx-auto">
          All deterministic coordinates and 6-point mathematical proofs have been computed. Open the 2D Delivery Ticket &amp; Results view below.
        </p>
        <button
          onClick={onGoToResults}
          className="btn-hivis px-6 py-2.5 text-sm font-display font-bold uppercase cursor-pointer"
        >
          Open 2D Delivery Ticket &amp; Proofs →
        </button>
      </div>
    );
  }

  const inspectedProofStatus = inspectedItem ? itemProofMap[inspectedItem.instanceId] : null;

  return (
    <div className="space-y-5">
      {/* Top Manifest Dispatch Header & Van Switcher Crate Tabs */}
      <div className="manifest-sheet p-4 space-y-4">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          {/* Van Switcher Tabs (Small / Medium / Large / Luton) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase text-[#1B1A17] mr-1">
              VAN FLEET:
            </span>
            {vans.map((van) => {
              const proof = vanProofs[van.id];
              const isSelected = van.id === activeVan.id;
              const isRecommended = van.id === recommendedVanId;
              const fits = proof?.fitsAll;

              return (
                <button
                  key={van.id}
                  onClick={() => onSelectVan(van.id)}
                  className={`px-3.5 py-2 border-2 border-[#1B1A17] rounded-[2px] text-xs font-mono uppercase transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#F2D21B] text-[#1B1A17] font-bold shadow-[3px_3px_0_#1B1A17]'
                      : fits
                      ? 'bg-[#FAF6EE] text-[#1B1A17] hover:bg-[#C8A26B]'
                      : 'bg-[#EBE3D5] text-[#1B1A17]/85 hover:bg-[#C8A26B]/60'
                  }`}
                >
                  <span className="font-display text-base tracking-wide">{van.label}</span>
                  {isRecommended && (
                    <span
                      title="Recommended smallest & cheapest fitting van"
                      className="px-1.5 py-0.2 bg-[#1B1A17] text-[#F2D21B] text-[10px] font-bold"
                    >
                      ★ REC
                    </span>
                  )}
                  <span
                    className={`font-mono font-bold text-[11px] px-1.5 py-0.2 border border-[#1B1A17] ${
                      fits
                        ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                        : 'bg-[#C2362B] text-[#F4EFE6]'
                    }`}
                  >
                    {fits ? 'PASS ✓' : 'REJECT'} · £{van.price_gbp}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Space Used & Payload Gauges + Demo Switchers */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 pt-3 xl:pt-0 border-t-2 xl:border-t-0 border-[#1B1A17]">
            {/* Space Used Stamp Box */}
            <div className="bg-[#EBE3D5] border-2 border-[#1B1A17] px-3 py-1.5 font-mono text-xs flex items-center gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9C7444]">SPACE USED</div>
                <div className="text-lg font-bold tabular-nums text-[#1B1A17]">
                  {activeProof.volumeUsedPct}%
                </div>
              </div>
              <div className="text-[11px] tabular-nums text-[#1B1A17]/80 border-l border-[#1B1A17]/40 pl-2.5">
                <div>
                  {activeProof.usedVolumeM3} / {activeProof.vanVolumeM3} m³
                </div>
                <div>
                  {activeVan.length_cm}×{activeVan.width_cm}×{activeVan.height_cm}cm
                </div>
              </div>
            </div>

            {/* Weight Bar Stamp Box */}
            <div className="bg-[#EBE3D5] border-2 border-[#1B1A17] px-3 py-1.5 font-mono text-xs min-w-[165px]">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                <span className="text-[#9C7444]">PAYLOAD</span>
                <span className="tabular-nums text-[#1B1A17]">
                  {activeProof.totalWeightKg} / {activeProof.maxPayloadKg} kg
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#FAF6EE] border border-[#1B1A17] mt-1">
                <div
                  className={`h-full ${
                    activeProof.totalWeightKg > activeProof.maxPayloadKg
                      ? 'bg-[#C2362B]'
                      : 'bg-[#2F6B3A]'
                  }`}
                  style={{ width: `${weightPct}%` }}
                />
              </div>
            </div>

            {/* Quick Demo Switchers */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onLoadStudioDemo}
                className="btn-manifest px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase cursor-pointer"
                title="Load Small Studio Move (£30 saved vs Luton)"
              >
                Studio Move
              </button>
              <button
                onClick={onLoad1BedDemo}
                className="btn-manifest px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase cursor-pointer"
                title="Load 1-Bed Student Flat Demo"
              >
                1-Bed Flat
              </button>
            </div>
          </div>
        </div>

        {/* Deterministic Pass / Fail Stamp Banner */}
        {activeProof.fitsAll ? (
          <div className="bg-[#2F6B3A]/15 border-2 border-[#2F6B3A] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs font-mono font-bold text-[#1B1A17]">
              <span className="px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] font-display text-sm tracking-wider uppercase">
                INSPECTED ✓
              </span>
              <span>
                EVERYTHING FITS, VERIFIED BY CODE — ALL {activeProof.placedItems.length} ITEMS LOADED INSIDE {activeVan.label.toUpperCase()} (£{activeVan.price_gbp}/DAY)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProofOverlay((p) => !p)}
                className={`px-3 py-1 border-2 border-[#1B1A17] text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer ${
                  showProofOverlay
                    ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                    : 'bg-[#FAF6EE] text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {showProofOverlay ? 'Hide 3D Proof [✓]' : 'Show Proof in 3D'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#C2362B]/15 border-2 border-[#C2362B] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-mono font-bold text-[#1B1A17]">
              <span className="px-2 py-0.5 bg-[#C2362B] text-[#F4EFE6] font-display text-sm tracking-wider uppercase">
                REJECTED
              </span>
              <GhostDoodle className="w-5 h-5 text-[#C2362B] shrink-0" />
              <span>
                {activeProof.leftoverItems.length} ITEM(S) LEFT BEHIND ON PAVEMENT: {leftoverSummaryText}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProofOverlay((p) => !p)}
                className={`px-3 py-1 border-2 border-[#1B1A17] text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer ${
                  showProofOverlay
                    ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                    : 'bg-[#FAF6EE] text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {showProofOverlay ? 'Hide 3D Proof [✓]' : 'Show Proof in 3D'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Split Layout: 3D Realistic Loading Scene (8 cols) + Manifest Loading Sheet (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 3D Cutaway Van Viewport & Controls (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="relative manifest-sheet overflow-hidden">
            {/* WebGL Mount Container with smooth fade when switching vans */}
            <div
              ref={canvasMountRef}
              className={`w-full h-[460px] sm:h-[540px] select-none bg-[#DAD2C4] transition-opacity duration-150 ${
                isVanFading ? 'opacity-60' : 'opacity-100'
              }`}
              aria-label={`Interactive 3D cutaway van loading scene for ${activeVan.name}`}
            />

            {/* Top-Left HUD: Camera Preset Buttons ("Rear doors", "Side cutaway", "Top-down plan") */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => handleSelectCameraPreset('rear')}
                className={`px-2.5 py-1 border-2 border-[#1B1A17] text-[11px] font-mono font-bold uppercase flex items-center gap-1 cursor-pointer ${
                  activeCameraPreset === 'rear'
                    ? 'bg-[#F2D21B] text-[#1B1A17]'
                    : 'bg-[#FAF6EE]/95 text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
              >
                <Camera className="w-3 h-3" />
                Rear doors
              </button>
              <button
                onClick={() => handleSelectCameraPreset('cutaway')}
                className={`px-2.5 py-1 border-2 border-[#1B1A17] text-[11px] font-mono font-bold uppercase flex items-center gap-1 cursor-pointer ${
                  activeCameraPreset === 'cutaway'
                    ? 'bg-[#F2D21B] text-[#1B1A17]'
                    : 'bg-[#FAF6EE]/95 text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
              >
                <Camera className="w-3 h-3" />
                Side cutaway
              </button>
              <button
                onClick={() => handleSelectCameraPreset('top')}
                className={`px-2.5 py-1 border-2 border-[#1B1A17] text-[11px] font-mono font-bold uppercase flex items-center gap-1 cursor-pointer ${
                  activeCameraPreset === 'top'
                    ? 'bg-[#F2D21B] text-[#1B1A17]'
                    : 'bg-[#FAF6EE]/95 text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
              >
                <Camera className="w-3 h-3" />
                Top-down plan
              </button>
            </div>

            {/* Top-Right HUD: "Low detail" Toggle & AO Status */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <button
                onClick={() => setLowDetail((prev) => !prev)}
                className={`px-2.5 py-1 border-2 border-[#1B1A17] text-[11px] font-mono font-bold uppercase flex items-center gap-1 cursor-pointer ${
                  lowDetail
                    ? 'bg-[#F2D21B] text-[#1B1A17]'
                    : 'bg-[#FAF6EE]/95 text-[#1B1A17] hover:bg-[#C8A26B]'
                }`}
                title="Fall back to plain textured boxes for older GPUs"
              >
                <Layers className="w-3 h-3" />
                {lowDetail ? 'Low detail: ON' : 'Low detail'}
              </button>
            </div>

            {/* Manifest-Style 3-Stamp Inspection Card when Clicking/Hovering an Item */}
            {inspectedItem && (
              <div className="absolute bottom-12 left-3 z-20 bg-[#FAF6EE] border-2 border-[#1B1A17] p-3.5 max-w-[330px] shadow-[4px_4px_0_#1B1A17] font-mono text-xs space-y-2">
                <div className="flex items-start justify-between gap-2 border-b border-[#1B1A17] pb-1.5">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#9C7444]">
                      {inspectedItem.isLeftover
                        ? 'PAVEMENT REJECT TAG'
                        : `LOADING STEP #${String(inspectedItem.stepOrder).padStart(2, '0')} OF ${String(totalSteps).padStart(2, '0')}`}
                    </div>
                    <div className="font-display text-lg font-bold text-[#1B1A17] leading-tight">
                      {inspectedItem.name}
                    </div>
                  </div>
                  {selectedInstanceId && (
                    <button
                      onClick={() => setSelectedInstanceId(null)}
                      className="p-0.5 text-[#1B1A17] hover:bg-[#C8A26B] cursor-pointer"
                      title="Close inspection card"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums bg-[#EBE3D5] p-1.5 border border-[#1B1A17]">
                  <div>
                    <span className="text-[#1B1A17]/70">SIZE: </span>
                    <strong>
                      {inspectedItem.w_cm}×{inspectedItem.d_cm}×{inspectedItem.h_cm}cm
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#1B1A17]/70">WEIGHT: </span>
                    <strong>{inspectedItem.weight_kg} kg</strong>
                  </div>
                </div>

                {/* 3 Deterministic Checks Stamped ✓ */}
                {inspectedProofStatus && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>1. INSIDE VAN BOUNDS</span>
                      <span
                        className={`px-1.5 py-0.2 font-bold border border-[#1B1A17] ${
                          inspectedProofStatus.insideBounds
                            ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                            : 'bg-[#C2362B] text-[#F4EFE6]'
                        }`}
                      >
                        {inspectedProofStatus.insideBounds ? 'STAMPED ✓' : 'REJECTED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span>2. NO OVERLAP (2cm GAP)</span>
                      <span
                        className={`px-1.5 py-0.2 font-bold border border-[#1B1A17] ${
                          inspectedProofStatus.noOverlap
                            ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                            : 'bg-[#C2362B] text-[#F4EFE6]'
                        }`}
                      >
                        {inspectedProofStatus.noOverlap ? 'STAMPED ✓' : 'REJECTED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span>3. ≥70% BASE SUPPORT</span>
                      <span
                        className={`px-1.5 py-0.2 font-bold border border-[#1B1A17] ${
                          inspectedProofStatus.supportOk && inspectedProofStatus.fragileOk
                            ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                            : 'bg-[#C2362B] text-[#F4EFE6]'
                        }`}
                      >
                        {inspectedProofStatus.supportOk && inspectedProofStatus.fragileOk
                          ? `STAMPED ✓ (${inspectedProofStatus.supportPct}%)`
                          : 'REJECTED'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Strip inside 3D Viewport: Legend & Controls Hint */}
            <div className="absolute bottom-2 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-[11px] font-mono">
              <div className="bg-[#FAF6EE]/95 border border-[#1B1A17] px-2.5 py-1 flex flex-wrap items-center gap-3 text-[#1B1A17]">
                <span className="font-bold">CAB AT LEFT (0cm) → REAR DOORS AT RIGHT ({activeVan.length_cm}cm)</span>
                <span className="px-1.5 bg-[#C2362B] text-[#FAF6EE] font-bold">FRAGILE STICKER</span>
                {activeProof.leftoverItems.length > 0 && (
                  <span className="text-[#C2362B] font-bold">LEFT BEHIND ON PAVEMENT</span>
                )}
              </div>
              <div className="bg-[#FAF6EE]/95 border border-[#1B1A17] px-2.5 py-1 text-[#1B1A17] hidden sm:block">
                DRAG TO ORBIT · SCROLL TO ZOOM · CLICK ITEM TO STAMP-INSPECT
              </div>
            </div>
          </div>

          {/* Under-3D Manifest Step Caption & Playback Controls */}
          <div className="manifest-sheet p-4 space-y-3">
            {/* Manifest Line Step Caption: e.g. "07 / 31 · SOFA, 2-SEAT · AGAINST CAB WALL" */}
            <div className="bg-[#EBE3D5] border-2 border-[#1B1A17] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
              {activeStepItem ? (
                <div className="flex flex-wrap items-center gap-2 text-[#1B1A17] font-bold">
                  <span className="bg-[#1B1A17] text-[#F2D21B] px-2 py-0.5 tabular-nums">
                    {activeStepItem.isLeftover
                      ? 'LEFT BEHIND'
                      : `${String(activeStepItem.stepOrder).padStart(2, '0')} / ${String(
                          totalSteps
                        ).padStart(2, '0')}`}
                  </span>
                  <span>·</span>
                  <span className="uppercase">{activeStepItem.name}</span>
                  <span>·</span>
                  <span className="text-[#9C7444]">
                    {formatManifestInstruction(
                      activeStepItem,
                      activeProof.placedItems,
                      activeVan
                    )}
                  </span>
                </div>
              ) : (
                <div className="text-[#1B1A17] font-bold">
                  00 / {String(totalSteps).padStart(2, '0')} · ALL ITEMS QUEUED ON PAVEMENT BEHIND VAN · PRESS PLAY OR STEP
                </div>
              )}

              <div className="tabular-nums font-bold text-[#1B1A17]">
                LOADED: {visibleStepCount} / {totalSteps}
              </div>
            </div>

            {/* Play / Pause / Step / Reset Controls & Speed Slider */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePlayToggle}
                  className="btn-hivis px-4 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Play Loading
                    </>
                  )}
                </button>

                <button
                  onClick={handleStepForward}
                  className="btn-manifest px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Step
                </button>

                <button
                  onClick={handleResetAnimation}
                  className="btn-manifest px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Pavement
                </button>

                {visibleStepCount < totalSteps && (
                  <button
                    onClick={handleShowAll}
                    className="btn-manifest bg-[#C8A26B] px-3 py-2 text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    Load All ({totalSteps})
                  </button>
                )}
              </div>

              {/* Speed Slider (0.5x – 3x) */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <label htmlFor="speed-slider" className="font-bold uppercase text-[#1B1A17]">
                  SPEED:
                </label>
                <input
                  id="speed-slider"
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.25}
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="w-28 accent-[#1B1A17] cursor-pointer"
                />
                <span className="tabular-nums font-bold text-[#1B1A17] w-10">
                  {playbackSpeed.toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Priority 3: Second Superpower — Moving-Day Voice Mode (Performer) */}
            <MovingDayVoiceMode
              placedItems={activeProof.placedItems}
              currentStepOrder={activeStepItem ? activeStepItem.stepOrder : 1}
              onSyncStepTo3D={(stepOrder, instanceId) => {
                setIsPlaying(false);
                setVisibleStepCount(stepOrder);
                setSelectedInstanceId(instanceId);
                setTimeout(() => {
                  sceneControllerRef.current?.triggerSlideIn(instanceId);
                }, 20);
              }}
            />
          </div>
        </div>

        {/* Right Column: Manifest Loading Sequence Sheet (4 cols) */}
        <div className="lg:col-span-4 manifest-sheet flex flex-col max-h-[690px]">
          <ManifestSheetHeader
            manifestNo="LOAD SHEET VP-SEQ"
            title="LOADING SEQUENCE"
            subtitle="Click any line to slide & inspect in 3D"
            rightBadge={
              <span className="font-mono text-xs font-bold bg-[#F4EFE6] border border-[#1B1A17] px-2 py-0.5 tabular-nums">
                {activeProof.placedItems.length} LOADED
              </span>
            }
          />

          <div className="flex-1 overflow-y-auto divide-y divide-[#1B1A17]/30 p-2 space-y-1 font-mono">
            {activeProof.placedItems.map((item) => {
              const isSelected = selectedInstanceId === item.instanceId;
              const isLoaded = item.stepOrder <= visibleStepCount;
              const instruction = getLoadingInstruction(item, activeProof.placedItems);
              const catColor = MANIFEST_CATEGORY_COLORS[item.category];

              return (
                <button
                  key={item.instanceId}
                  ref={(el) => {
                    rowRefs.current[item.instanceId] = el;
                  }}
                  onClick={() => {
                    setIsPlaying(false);
                    setSelectedInstanceId(item.instanceId);
                    if (visibleStepCount < item.stepOrder) {
                      setVisibleStepCount(item.stepOrder);
                    }
                    sceneControllerRef.current?.triggerSlideIn(item.instanceId);
                  }}
                  className={`w-full text-left p-2.5 border transition-colors flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#F2D21B] border-2 border-[#1B1A17]'
                      : isLoaded
                      ? 'bg-[#FAF6EE] hover:bg-[#C8A26B]/40 border-[#1B1A17]/40'
                      : 'bg-[#EBE3D5]/60 opacity-60 hover:opacity-100 border-[#1B1A17]/30'
                  }`}
                >
                  <span
                    className="w-6 h-6 border border-[#1B1A17] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 text-[#F4EFE6]"
                    style={{ backgroundColor: catColor }}
                  >
                    {String(item.stepOrder).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#1B1A17] font-sans truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-[#1B1A17]/80 shrink-0">
                        {item.w_cm}×{item.d_cm}×{item.h_cm}cm · {item.weight_kg}kg
                      </span>
                    </div>
                    <div className="text-[10px] text-[#1B1A17]/75 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{instruction}</span>
                      {item.fragile && (
                        <span className="px-1 bg-[#C2362B] text-[#F4EFE6] font-bold uppercase">
                          FRAGILE
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Leftover ("LEFT BEHIND") items at bottom of checklist */}
            {activeProof.leftoverItems.length > 0 && (
              <div className="pt-3 px-1 pb-2 space-y-1.5">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-[#C2362B] flex items-center gap-1.5">
                  <GhostDoodle className="w-4 h-4 text-[#C2362B]" />
                  <span>LEFT BEHIND ON PAVEMENT ({activeProof.leftoverItems.length})</span>
                </div>
                {activeProof.leftoverItems.map((lo) => {
                  const isSelected = selectedInstanceId === lo.instanceId;
                  return (
                    <button
                      key={lo.instanceId}
                      ref={(el) => {
                        rowRefs.current[lo.instanceId] = el;
                      }}
                      onClick={() => setSelectedInstanceId(lo.instanceId)}
                      className={`w-full text-left p-2.5 text-xs cursor-pointer border-2 space-y-1 ${
                        isSelected
                          ? 'bg-[#F2D21B] border-[#1B1A17]'
                          : 'bg-[#C2362B]/15 border-[#C2362B] hover:bg-[#C2362B]/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#C2362B] font-bold flex items-center gap-1.5 truncate">
                          <GhostDoodle className="w-4 h-4 text-[#C2362B] shrink-0" />
                          <span>LEFT BEHIND: {lo.name}</span>
                        </span>
                        <span className="text-[11px] tabular-nums text-[#1B1A17] shrink-0">
                          {lo.w_cm}×{lo.d_cm}×{lo.h_cm}cm
                        </span>
                      </div>
                      <div className="text-[11px] font-sans text-[#1B1A17]">
                        {getLeftoverReason(lo, activeVan)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer CTA to Delivery Ticket & Rubber Stamp Proofs */}
          <div className="p-3 border-t-2 border-[#1B1A17] bg-[#EBE3D5]">
            <button
              onClick={onGoToResults}
              className="btn-manifest w-full py-2.5 text-xs font-mono font-bold uppercase flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Open Delivery Ticket &amp; 6 Stamp Proofs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
