/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, DoorwaySpec, DoorFitResult } from '../types';

/**
 * Standard UK doorway default dimensions in cm (30 inches × 78 inches = 76.2 × 198.1 cm)
 */
export const DEFAULT_DOORWAY: DoorwaySpec = {
  width_cm: 76,
  height_cm: 198,
};

/**
 * Checks if a 3D box can pass through a 2D doorway opening of given width and height.
 * Tests all three primary 2D cross-sections: (W x D), (W x H), and (D x H).
 *
 * @param item - The item to evaluate
 * @param doorway - Doorway width and height in cm
 * @returns DoorFitResult with pass/fail and minimal clearance dimensions
 */
export function checkItemDoorFit(item: InventoryItem, doorway: DoorwaySpec): DoorFitResult {
  const { width_cm: w, depth_cm: d, height_cm: h } = item;
  const dw = doorway.width_cm;
  const dh = doorway.height_cm;

  // The 3 cross-sections
  const crossSections = [
    { w: Math.min(w, d), h: Math.max(w, d) },
    { w: Math.min(w, h), h: Math.max(w, h) },
    { w: Math.min(d, h), h: Math.max(d, h) },
  ];

  // Sort cross-sections by area ascending to find the smallest face
  crossSections.sort((a, b) => a.w * a.h - b.w * b.h);

  const doorMin = Math.min(dw, dh);
  const doorMax = Math.max(dw, dh);

  let fits = false;
  let smallestPassableSection = crossSections[0];

  for (const cs of crossSections) {
    // Cross-section fits if its smaller dimension <= door's smaller dimension
    // AND its larger dimension <= door's larger dimension
    if (cs.w <= doorMin && cs.h <= doorMax) {
      fits = true;
      smallestPassableSection = cs;
      break;
    }
  }

  // Calculate clearance margin (smallest clearance difference)
  const marginW = doorMin - smallestPassableSection.w;
  const marginH = doorMax - smallestPassableSection.h;
  const marginCm = Math.min(marginW, marginH);

  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    fits,
    smallestCrossSection: smallestPassableSection,
    doorWidth: dw,
    doorHeight: dh,
    marginCm,
  };
}

/**
 * Evaluates doorway passability across all inventory items.
 *
 * @param items - List of inventory items
 * @param doorway - Doorway dimensions
 * @returns Array of DoorFitResult
 */
export function checkAllItemsDoorFit(items: InventoryItem[], doorway: DoorwaySpec): DoorFitResult[] {
  return items.map((item) => checkItemDoorFit(item, doorway));
}
