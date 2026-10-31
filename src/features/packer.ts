/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, VanPreset, PlacedItem } from '../types';

/**
 * Uniform horizontal safety clearance buffer between adjacent items in cm
 */
export const GAP_CM = 2;

/**
 * Minimum fraction of an item's bottom footprint that must be supported (70%)
 */
export const MIN_SUPPORT_RATIO = 0.70;

interface CandidatePoint {
  x: number;
  y: number;
  z: number;
}

interface Orientation {
  w: number;
  d: number;
  h: number;
  label: string;
}

/**
 * Expands grouped inventory items into individual physical instances and prepares them for packing.
 * Sorts non-fragile before fragile, stackable before non-stackable, then descending by weight and volume.
 *
 * @param items - List of inventory items with quantities
 * @returns Sorted array of individual item instances
 */
export function expandAndSortInventory(
  items: InventoryItem[]
): (InventoryItem & { instanceIndex: number; instanceId: string })[] {
  const instances: (InventoryItem & { instanceIndex: number; instanceId: string })[] = [];

  for (const item of items) {
    const qty = Math.max(1, Math.round(item.quantity || 1));
    for (let i = 0; i < qty; i++) {
      instances.push({
        ...item,
        instanceIndex: i + 1,
        instanceId: `${item.id}-${i + 1}`,
      });
    }
  }

  // Deterministic multi-tier sort:
  // 1. Sturdy / Non-fragile first (fragile last so they sit on top / near rear doors)
  // 2. Can stack on top first (so stable bases are loaded first onto the floor)
  // 3. Heaviest items first (low center of gravity near cab wall)
  // 4. Largest volume first
  instances.sort((a, b) => {
    if (a.fragile !== b.fragile) {
      return a.fragile ? 1 : -1;
    }
    if (a.can_stack_on_top !== b.can_stack_on_top) {
      return a.can_stack_on_top ? -1 : 1;
    }
    if (b.weight_kg !== a.weight_kg) {
      return b.weight_kg - a.weight_kg;
    }
    const volA = a.width_cm * a.depth_cm * a.height_cm;
    const volB = b.width_cm * b.depth_cm * b.height_cm;
    return volB - volA;
  });

  return instances;
}

/**
 * Returns all valid 3D orientations for an item depending on its can_rotate flag.
 * Respects can_rotate; mattresses, flat-pack frames, bookshelves, and sofas can stand on edge.
 *
 * @param item - The item to generate orientations for
 * @returns Array of width (X), depth (Z), height (Y) orientations
 */
export function getValidOrientations(item: InventoryItem): Orientation[] {
  const { width_cm: w, depth_cm: d, height_cm: h, can_rotate, name, category } = item;
  const lower = name.toLowerCase();
  const isMattress = lower.includes('mattress');
  const isSofa = lower.includes('sofa');
  const isBedFrame = lower.includes('bed');
  const isShelving = lower.includes('book') || lower.includes('shelf');

  if (!can_rotate) {
    return [{ w, d, h, label: 'Upright standard' }];
  }

  // Horizontal 90-degree yaw rotations (maintaining original height H)
  const orientations: Orientation[] = [
    { w, d, h, label: 'Standard flat' },
    { w: d, d: w, h, label: 'Rotated 90°' },
  ];

  // Upright / on-edge orientations for mattresses, sofas, flat-packs, shelves, and boxes
  if (isMattress || isBedFrame || isShelving || isSofa || category === 'Furniture' || category === 'Boxes') {
    orientations.push(
      { w, d: h, h: d, label: 'On-edge lengthwise' },
      { w: h, d, h: w, label: 'On-edge crosswise' },
      { w: d, d: h, h: w, label: 'Upright on-edge 90°' },
      { w: h, d: w, h: d, label: 'Upright side-wall' }
    );
  }

  // Deduplicate identical dimension combinations
  const seen = new Set<string>();
  const uniqueOrientations: Orientation[] = [];
  for (const o of orientations) {
    const key = `${o.w}x${o.d}x${o.h}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueOrientations.push(o);
    }
  }

  return uniqueOrientations;
}

/**
 * Checks if a candidate box placement collides with van boundaries or any already placed item.
 * Enforces a strict 2 cm horizontal safety gap between items.
 *
 * @param x - Candidate X position in cm
 * @param y - Candidate Y position in cm
 * @param z - Candidate Z position in cm
 * @param w - Item width in cm (X)
 * @param d - Item depth in cm (Z)
 * @param h - Item height in cm (Y)
 * @param van - Van specifications
 * @param placed - Already placed items
 * @returns True if the candidate placement is completely inside boundaries and collision-free
 */
export function isPlacementCollisionFree(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  van: VanPreset,
  placed: PlacedItem[]
): boolean {
  // 1. Inside van cargo boundaries
  if (x < 0 || y < 0 || z < 0) return false;
  if (x + w > van.length_cm) return false;
  if (y + h > van.height_cm) return false;
  if (z + d > van.width_cm) return false;

  // 2. Pairwise non-collision with 2cm horizontal safety buffer
  for (const p of placed) {
    const yOverlap = Math.max(y, p.y_cm) < Math.min(y + h, p.y_cm + p.h_cm);
    if (!yOverlap) continue;

    const noXCollision = x + w + GAP_CM <= p.x_cm || p.x_cm + p.w_cm + GAP_CM <= x;
    const noZCollision = z + d + GAP_CM <= p.z_cm || p.z_cm + p.d_cm + GAP_CM <= z;

    if (!noXCollision && !noZCollision) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates the exact supported area fraction (0.0 to 1.0) of an item's base footprint.
 * Enforces that items resting directly below must have can_stack_on_top = true and fragile = false.
 *
 * @param x - Candidate X position in cm
 * @param y - Candidate Y position in cm
 * @param z - Candidate Z position in cm
 * @param w - Item width in cm
 * @param d - Item depth in cm
 * @param placed - Already placed items
 * @returns Support ratio between 0 and 1.0
 */
export function calculateBaseSupport(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  placed: PlacedItem[]
): number {
  if (y <= 0.01) {
    return 1.0;
  }

  const baseArea = w * d;
  if (baseArea <= 0) return 0;

  let supportedArea = 0;

  for (const p of placed) {
    const isDirectlyBelow = Math.abs(p.y_cm + p.h_cm - y) < 0.5;
    if (!isDirectlyBelow) continue;

    if (p.fragile || !p.can_stack_on_top) {
      return 0;
    }

    const xOverlap = Math.max(0, Math.min(x + w, p.x_cm + p.w_cm) - Math.max(x, p.x_cm));
    const zOverlap = Math.max(0, Math.min(z + d, p.z_cm + p.d_cm) - Math.max(z, p.z_cm));

    supportedArea += xOverlap * zOverlap;
  }

  return Math.min(1.0, supportedArea / baseArea);
}

/**
 * Generates a human-friendly, deterministic loading instruction based on an item's exact 3D placement.
 *
 * @param item - The placed item
 * @param allPlaced - All placed items in the van
 * @returns Short actionable loading instruction string
 */
export function getLoadingInstruction(item: PlacedItem, allPlaced?: PlacedItem[]): string {
  if (item.isLeftover) {
    return 'Does not fit in this van size';
  }
  const parts: string[] = [];
  if (item.y_cm <= 0.5) {
    if (item.x_cm <= 5) {
      parts.push('load on floor against cab wall');
    } else {
      parts.push(`load on floor (${Math.round(item.x_cm)}cm from cab)`);
    }
  } else {
    // Find primary supporting item beneath it
    const supporter = allPlaced?.find(
      (p) =>
        p.instanceId !== item.instanceId &&
        Math.abs(p.y_cm + p.h_cm - item.y_cm) < 1 &&
        Math.max(item.x_cm, p.x_cm) < Math.min(item.x_cm + item.w_cm, p.x_cm + p.w_cm) &&
        Math.max(item.z_cm, p.z_cm) < Math.min(item.z_cm + item.d_cm, p.z_cm + p.d_cm)
    );
    if (supporter) {
      parts.push(`stack on top of ${supporter.name}`);
    } else {
      parts.push(`stack at ${Math.round(item.y_cm)}cm height`);
    }
  }

  if (item.orientationLabel.toLowerCase().includes('edge') || item.orientationLabel.toLowerCase().includes('upright')) {
    parts.push(item.orientationLabel.toLowerCase());
  }
  if (item.fragile) {
    parts.push('fragile — keep nothing on top');
  }

  return parts.join(', ');
}

/**
 * Runs the deterministic 3D bin-packing heuristic for a given van specification.
 *
 * @param van - Van specification
 * @param items - Inventory items list
 * @returns Object containing placedItems and leftoverItems
 */
export function packVan(
  van: VanPreset,
  items: InventoryItem[]
): { placedItems: PlacedItem[]; leftoverItems: PlacedItem[] } {
  const instances = expandAndSortInventory(items);
  const placedItems: PlacedItem[] = [];
  const leftoverItems: PlacedItem[] = [];

  let currentPayloadKg = 0;

  // Extreme candidate points initialized at cab-left-floor origin (0, 0, 0)
  const candidatePoints: CandidatePoint[] = [{ x: 0, y: 0, z: 0 }];

  function addCandidatePoints(
    itemX: number,
    itemY: number,
    itemZ: number,
    itemW: number,
    itemD: number,
    itemH: number
  ) {
    const nextX = itemX + itemW + GAP_CM;
    const nextZ = itemZ + itemD + GAP_CM;
    const nextY = itemY + itemH;

    // Primary extreme points from the newly placed box
    candidatePoints.push(
      { x: nextX, y: itemY, z: itemZ },
      { x: itemX, y: itemY, z: nextZ },
      { x: itemX, y: nextY, z: itemZ },
      // Projections onto floor and sidewalls
      { x: nextX, y: 0, z: itemZ },
      { x: nextX, y: 0, z: 0 },
      { x: itemX, y: 0, z: nextZ },
      { x: 0, y: 0, z: nextZ },
      { x: nextX, y: itemY, z: 0 },
      { x: 0, y: itemY, z: nextZ }
    );

    // Projections onto top surfaces of existing items for tight multi-box stacking
    for (const p of placedItems) {
      const topY = p.y_cm + p.h_cm;
      if (topY < van.height_cm) {
        candidatePoints.push(
          { x: nextX, y: topY, z: itemZ },
          { x: itemX, y: topY, z: nextZ }
        );
      }
    }

    // Deduplicate and filter out points outside van bounds
    const unique = new Map<string, CandidatePoint>();
    for (const pt of candidatePoints) {
      if (pt.x >= 0 && pt.x < van.length_cm && pt.y >= 0 && pt.y < van.height_cm && pt.z >= 0 && pt.z < van.width_cm) {
        const key = `${Math.round(pt.x)}_${Math.round(pt.y)}_${Math.round(pt.z)}`;
        if (!unique.has(key)) {
          unique.set(key, pt);
        }
      }
    }

    candidatePoints.length = 0;
    candidatePoints.push(...Array.from(unique.values()));
    candidatePoints.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 0.01) return a.y - b.y;
      if (Math.abs(a.x - b.x) > 0.01) return a.x - b.x;
      return a.z - b.z;
    });
  }

  for (const instance of instances) {
    // Check if adding this item would exceed van max payload
    if (currentPayloadKg + instance.weight_kg > van.max_payload_kg) {
      leftoverItems.push({
        instanceId: instance.instanceId,
        itemId: instance.id,
        name: instance.name,
        category: instance.category,
        stepOrder: 0,
        x_cm: van.length_cm + 35 + (leftoverItems.length % 3) * 65,
        y_cm: 0,
        z_cm: Math.floor(leftoverItems.length / 3) * 65,
        w_cm: instance.width_cm,
        d_cm: instance.depth_cm,
        h_cm: instance.height_cm,
        original_w_cm: instance.width_cm,
        original_d_cm: instance.depth_cm,
        original_h_cm: instance.height_cm,
        orientationLabel: 'Leftover (Exceeds payload)',
        weight_kg: instance.weight_kg,
        fragile: instance.fragile,
        can_stack_on_top: instance.can_stack_on_top,
        supportRatio: 0,
        isLeftover: true,
      });
      continue;
    }

    const orientations = getValidOrientations(instance);
    let bestPlacement: {
      pt: CandidatePoint;
      orient: Orientation;
      supportRatio: number;
      score: number;
    } | null = null;

    for (const pt of candidatePoints) {
      for (const orient of orientations) {
        if (!isPlacementCollisionFree(pt.x, pt.y, pt.z, orient.w, orient.d, orient.h, van, placedItems)) {
          continue;
        }

        const supportRatio = calculateBaseSupport(pt.x, pt.y, pt.z, orient.w, orient.d, placedItems);
        if (supportRatio < MIN_SUPPORT_RATIO) {
          continue;
        }

        // Orientation tie-breaker:
        // - If item is stackable, prefer flat orientation (smaller height orient.h) to create a wide shelf
        // - If item is NOT stackable (e.g. mattress, bookshelf), prefer standing on edge (smaller floor area orient.w * orient.d)
        const orientationBias = instance.can_stack_on_top && !instance.fragile
          ? orient.h * 0.5 + orient.w * 0.2
          : (orient.w * orient.d) * 0.005 + orient.w * 0.2;

        // Primary score favors lowest Y (floor), then closest to cab (X), then sidewall (Z)
        const score = pt.y * 10_000 + pt.x * 120 + pt.z * 20 + orientationBias;

        if (!bestPlacement || score < bestPlacement.score) {
          bestPlacement = {
            pt,
            orient,
            supportRatio,
            score,
          };
        }
      }
    }

    if (bestPlacement) {
      const placed: PlacedItem = {
        instanceId: instance.instanceId,
        itemId: instance.id,
        name: instance.name,
        category: instance.category,
        stepOrder: placedItems.length + 1,
        x_cm: bestPlacement.pt.x,
        y_cm: bestPlacement.pt.y,
        z_cm: bestPlacement.pt.z,
        w_cm: bestPlacement.orient.w,
        d_cm: bestPlacement.orient.d,
        h_cm: bestPlacement.orient.h,
        original_w_cm: instance.width_cm,
        original_d_cm: instance.depth_cm,
        original_h_cm: instance.height_cm,
        orientationLabel: bestPlacement.orient.label,
        weight_kg: instance.weight_kg,
        fragile: instance.fragile,
        can_stack_on_top: instance.can_stack_on_top,
        supportRatio: bestPlacement.supportRatio,
        isLeftover: false,
      };

      placedItems.push(placed);
      currentPayloadKg += instance.weight_kg;

      addCandidatePoints(placed.x_cm, placed.y_cm, placed.z_cm, placed.w_cm, placed.d_cm, placed.h_cm);
    } else {
      leftoverItems.push({
        instanceId: instance.instanceId,
        itemId: instance.id,
        name: instance.name,
        category: instance.category,
        stepOrder: 0,
        x_cm: van.length_cm + 35 + (leftoverItems.length % 3) * 65,
        y_cm: 0,
        z_cm: Math.floor(leftoverItems.length / 3) * 65,
        w_cm: instance.width_cm,
        d_cm: instance.depth_cm,
        h_cm: instance.height_cm,
        original_w_cm: instance.width_cm,
        original_d_cm: instance.depth_cm,
        original_h_cm: instance.height_cm,
        orientationLabel: 'Leftover (Does not fit space)',
        weight_kg: instance.weight_kg,
        fragile: instance.fragile,
        can_stack_on_top: instance.can_stack_on_top,
        supportRatio: 0,
        isLeftover: true,
      });
    }
  }

  return { placedItems, leftoverItems };
}
