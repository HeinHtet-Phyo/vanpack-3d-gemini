/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VanPreset, InventoryItem, PlacedItem, VerificationProof, VerificationCheck, MultiVanPackingResult } from '../types';
import { packVan, calculateBaseSupport, MIN_SUPPORT_RATIO, GAP_CM } from './packer';
import { calculatePriceSavings } from './vans';

/**
 * Per-item verification status used by the 3D "Show Proof" overlay.
 */
export interface ItemProofStatus {
  instanceId: string;
  passed: boolean;
  insideBounds: boolean;
  noOverlap: boolean;
  supportOk: boolean;
  fragileOk: boolean;
  supportPct: number;
  summaryText: string;
  failedChecks: string[];
}

/**
 * Evaluates a single placed or leftover item against deterministic spatial invariants
 * for the 3D "Show Proof" visual overlay.
 *
 * @param item - The placed or leftover item
 * @param van - Current van preset
 * @param allPlaced - All placed items in the van
 * @returns ItemProofStatus with per-check booleans and tooltip summary
 */
export function verifySingleItem(
  item: PlacedItem,
  van: VanPreset,
  allPlaced: PlacedItem[]
): ItemProofStatus {
  if (item.isLeftover) {
    return {
      instanceId: item.instanceId,
      passed: false,
      insideBounds: false,
      noOverlap: true,
      supportOk: false,
      fragileOk: true,
      supportPct: 0,
      summaryText: `❌ Leftover: Could not fit inside ${van.label}`,
      failedChecks: ['Exceeds available van cargo space or payload'],
    };
  }

  const failedChecks: string[] = [];

  // 1. Inside van boundaries
  const insideBounds =
    item.x_cm >= -0.1 &&
    item.y_cm >= -0.1 &&
    item.z_cm >= -0.1 &&
    item.x_cm + item.w_cm <= van.length_cm + 0.1 &&
    item.y_cm + item.h_cm <= van.height_cm + 0.1 &&
    item.z_cm + item.d_cm <= van.width_cm + 0.1;
  if (!insideBounds) {
    failedChecks.push('Out of van bounds');
  }

  // 2. Pairwise overlap check
  let noOverlap = true;
  for (const other of allPlaced) {
    if (other.instanceId === item.instanceId) continue;
    const verticalSeparation =
      item.y_cm + item.h_cm <= other.y_cm + 0.01 || other.y_cm + other.h_cm <= item.y_cm + 0.01;
    if (verticalSeparation) continue;

    const separatedX =
      item.x_cm + item.w_cm + GAP_CM <= other.x_cm + 0.01 ||
      other.x_cm + other.w_cm + GAP_CM <= item.x_cm + 0.01;
    const separatedZ =
      item.z_cm + item.d_cm + GAP_CM <= other.z_cm + 0.01 ||
      other.z_cm + other.d_cm + GAP_CM <= item.z_cm + 0.01;

    if (!separatedX && !separatedZ) {
      noOverlap = false;
      failedChecks.push(`Overlaps with ${other.name}`);
      break;
    }
  }

  // 3. Base support >= 70%
  const rawSupport =
    item.y_cm <= 0.01
      ? 1.0
      : calculateBaseSupport(
          item.x_cm,
          item.y_cm,
          item.z_cm,
          item.w_cm,
          item.d_cm,
          allPlaced.filter((p) => p.instanceId !== item.instanceId)
        );
  const supportPct = Math.round(rawSupport * 100);
  const supportOk = rawSupport >= MIN_SUPPORT_RATIO - 0.01;
  if (!supportOk) {
    failedChecks.push(`Insufficient base support (${supportPct}% < 70%)`);
  }

  // 4. Fragile top check
  let fragileOk = true;
  if (item.fragile) {
    for (const other of allPlaced) {
      if (other.instanceId === item.instanceId) continue;
      const isAbove = other.y_cm >= item.y_cm + item.h_cm - 0.5;
      if (isAbove) {
        const xOverlap = Math.max(
          0,
          Math.min(item.x_cm + item.w_cm, other.x_cm + other.w_cm) - Math.max(item.x_cm, other.x_cm)
        );
        const zOverlap = Math.max(
          0,
          Math.min(item.z_cm + item.d_cm, other.z_cm + other.d_cm) - Math.max(item.z_cm, other.z_cm)
        );
        if (xOverlap > 0 && zOverlap > 0) {
          fragileOk = false;
          failedChecks.push(`Fragile violation: ${other.name} stacked on top`);
          break;
        }
      }
    }
  }

  const passed = insideBounds && noOverlap && supportOk && fragileOk;
  const summaryText = passed
    ? `✅ Verified: Inside Bounds · 0 Overlaps · ${supportPct}% Base Support`
    : `❌ Failed: ${failedChecks.join(', ')}`;

  return {
    instanceId: item.instanceId,
    passed,
    insideBounds,
    noOverlap,
    supportOk,
    fragileOk,
    supportPct,
    summaryText,
    failedChecks,
  };
}

/**
 * Runs independent mathematical checks on the packed van items.
 * Guaranteed to run in pure TypeScript code without model influence.
 *
 * @param van - Van specification
 * @param inventory - Original inventory items list
 * @returns Complete verification proof object
 */
export function verifyVanPacking(van: VanPreset, inventory: InventoryItem[]): VerificationProof {
  const { placedItems, leftoverItems } = packVan(van, inventory);

  const checks: VerificationCheck[] = [];
  const failureReasons: string[] = [];

  // Total weight calculation
  const totalPackedWeightKg = placedItems.reduce((acc, it) => acc + it.weight_kg, 0);

  // Volume calculations in m³
  const vanVolumeM3 = (van.length_cm * van.width_cm * van.height_cm) / 1_000_000;
  const usedVolumeM3 = placedItems.reduce((acc, it) => acc + (it.w_cm * it.d_cm * it.h_cm) / 1_000_000, 0);
  const volumeUsedPct = vanVolumeM3 > 0 ? Math.round((usedVolumeM3 / vanVolumeM3) * 100) : 0;

  // -------------------------------------------------------------
  // Check 1: Boundary check
  // Every placed item must be completely inside the van's cargo dimensions
  // -------------------------------------------------------------
  let boundaryViolations = 0;
  for (const it of placedItems) {
    const exceedsX = it.x_cm < 0 || it.x_cm + it.w_cm > van.length_cm + 0.1;
    const exceedsY = it.y_cm < 0 || it.y_cm + it.h_cm > van.height_cm + 0.1;
    const exceedsZ = it.z_cm < 0 || it.z_cm + it.d_cm > van.width_cm + 0.1;
    if (exceedsX || exceedsY || exceedsZ) {
      boundaryViolations++;
    }
  }

  const check1Passed = boundaryViolations === 0;
  checks.push({
    id: 'boundaries',
    label: 'All items inside van boundaries',
    passed: check1Passed,
    critical: true,
    explanation: check1Passed
      ? `All ${placedItems.length} items fit within ${van.length_cm}L × ${van.width_cm}W × ${van.height_cm}H cm.`
      : `${boundaryViolations} item(s) exceed the van dimensions.`,
  });
  if (!check1Passed) failureReasons.push('Items exceed internal van dimensions');

  // -------------------------------------------------------------
  // Check 2: Pairwise box intersection test
  // No two placed items overlap (strictly separated by at least 2cm horizontal safety margin)
  // -------------------------------------------------------------
  let overlapCount = 0;
  for (let i = 0; i < placedItems.length; i++) {
    for (let j = i + 1; j < placedItems.length; j++) {
      const a = placedItems[i];
      const b = placedItems[j];

      const verticalSeparation = (a.y_cm + a.h_cm <= b.y_cm + 0.01) || (b.y_cm + b.h_cm <= a.y_cm + 0.01);
      if (verticalSeparation) continue;

      const separatedX = (a.x_cm + a.w_cm + GAP_CM <= b.x_cm + 0.01) || (b.x_cm + b.w_cm + GAP_CM <= a.x_cm + 0.01);
      const separatedZ = (a.z_cm + a.d_cm + GAP_CM <= b.z_cm + 0.01) || (b.z_cm + b.d_cm + GAP_CM <= a.z_cm + 0.01);

      if (!separatedX && !separatedZ) {
        overlapCount++;
      }
    }
  }

  const check2Passed = overlapCount === 0;
  checks.push({
    id: 'overlaps',
    label: 'Zero item overlaps (Pairwise AABB test)',
    passed: check2Passed,
    critical: true,
    explanation: check2Passed
      ? `Passed pairwise collision test with ${GAP_CM} cm safety buffer.`
      : `Detected ${overlapCount} overlapping item pair(s).`,
  });
  if (!check2Passed) failureReasons.push('Items overlap in 3D space');

  // -------------------------------------------------------------
  // Check 3: Base support test (>= 70%)
  // Every elevated item must have at least 70% of its base supported by items beneath it
  // -------------------------------------------------------------
  let unsupportedItems = 0;
  for (const it of placedItems) {
    if (it.y_cm > 0.01) {
      const support = calculateBaseSupport(
        it.x_cm,
        it.y_cm,
        it.z_cm,
        it.w_cm,
        it.d_cm,
        placedItems.filter((p) => p.instanceId !== it.instanceId)
      );
      if (support < MIN_SUPPORT_RATIO - 0.01) {
        unsupportedItems++;
      }
    }
  }

  const check3Passed = unsupportedItems === 0;
  checks.push({
    id: 'support',
    label: 'Base support stability (≥70% supported)',
    passed: check3Passed,
    critical: true,
    explanation: check3Passed
      ? `All elevated items have ≥70% base support from solid cargo below.`
      : `${unsupportedItems} item(s) lack required 70% base support.`,
  });
  if (!check3Passed) failureReasons.push('Items lack 70% base support');

  // -------------------------------------------------------------
  // Check 4: Payload limit check
  // Total weight must not exceed the van's legal payload limit
  // -------------------------------------------------------------
  const check4Passed = totalPackedWeightKg <= van.max_payload_kg;
  checks.push({
    id: 'payload',
    label: `Weight within payload limit (${totalPackedWeightKg} kg / ${van.max_payload_kg} kg)`,
    passed: check4Passed,
    critical: true,
    explanation: check4Passed
      ? `Cargo weight is ${Math.round((totalPackedWeightKg / van.max_payload_kg) * 100)}% of the ${van.max_payload_kg} kg maximum payload.`
      : `Cargo exceeds maximum payload limit by ${totalPackedWeightKg - van.max_payload_kg} kg.`,
  });
  if (!check4Passed) failureReasons.push(`Exceeds legal payload limit (${totalPackedWeightKg}kg > ${van.max_payload_kg}kg)`);

  // -------------------------------------------------------------
  // Check 5: Fragile item protection
  // Items marked fragile must never have anything resting on top
  // -------------------------------------------------------------
  let fragileViolations = 0;
  for (const fragileItem of placedItems.filter((p) => p.fragile)) {
    for (const other of placedItems) {
      if (other.instanceId === fragileItem.instanceId) continue;
      const isAbove = other.y_cm >= fragileItem.y_cm + fragileItem.h_cm - 0.5;
      if (isAbove) {
        const xOverlap = Math.max(0, Math.min(fragileItem.x_cm + fragileItem.w_cm, other.x_cm + other.w_cm) - Math.max(fragileItem.x_cm, other.x_cm));
        const zOverlap = Math.max(0, Math.min(fragileItem.z_cm + fragileItem.d_cm, other.z_cm + other.d_cm) - Math.max(fragileItem.z_cm, other.z_cm));
        if (xOverlap > 0 && zOverlap > 0) {
          fragileViolations++;
        }
      }
    }
  }

  const check5Passed = fragileViolations === 0;
  checks.push({
    id: 'fragile',
    label: 'Fragile items protected (Nothing on top)',
    passed: check5Passed,
    critical: true,
    explanation: check5Passed
      ? `All fragile items (TVs, plants, lamps) sit at the top layer with zero items on top.`
      : `${fragileViolations} item(s) are resting on fragile items.`,
  });
  if (!check5Passed) failureReasons.push('Cargo stacked on top of fragile items');

  // -------------------------------------------------------------
  // Check 6: All items placed (0 leftovers)
  // -------------------------------------------------------------
  const check6Passed = leftoverItems.length === 0;
  checks.push({
    id: 'completeness',
    label: `All items fit (${placedItems.length} placed, ${leftoverItems.length} leftover)`,
    passed: check6Passed,
    critical: true,
    explanation: check6Passed
      ? `100% of belongings fit in a single trip.`
      : `${leftoverItems.length} item(s) could not fit inside this van size.`,
  });
  if (!check6Passed) {
    failureReasons.push(`${leftoverItems.length} item(s) could not fit inside this van`);
  }

  const fitsAll = checks.every((c) => c.passed);

  return {
    vanId: van.id,
    vanName: van.name,
    fitsAll,
    totalWeightKg: totalPackedWeightKg,
    maxPayloadKg: van.max_payload_kg,
    usedVolumeM3: Math.round(usedVolumeM3 * 100) / 100,
    vanVolumeM3: Math.round(vanVolumeM3 * 100) / 100,
    volumeUsedPct,
    checks,
    placedItems,
    leftoverItems,
    failureReasons,
  };
}

/**
 * Packs and verifies inventory across all configured vans and determines the smallest, cheapest fitting van.
 * Vans requiring a special C1/C licence are only recommended if allowSpecialLicence is true.
 *
 * @param vans - Array of van presets
 * @param inventory - List of items to pack
 * @param allowSpecialLicence - True if user ticked "I have a C1/C licence or will hire a driver"
 * @returns MultiVanPackingResult with proofs and recommendation
 */
export function evaluateAllVans(
  vans: VanPreset[],
  inventory: InventoryItem[],
  allowSpecialLicence = false
): MultiVanPackingResult {
  const vanProofs: Record<string, VerificationProof> = {};

  for (const van of vans) {
    vanProofs[van.id] = verifyVanPacking(van, inventory);
  }

  const eligibleVans = vans.filter(
    (v) => allowSpecialLicence || !v.requiresSpecialLicence
  );
  const fittingVans = eligibleVans.filter((v) => vanProofs[v.id]?.fitsAll);

  let recommendedVan: VanPreset | null = null;
  if (fittingVans.length > 0) {
    const sorted = [...fittingVans].sort((a, b) => {
      if (a.price_gbp !== b.price_gbp) return a.price_gbp - b.price_gbp;
      const volA = a.length_cm * a.width_cm * a.height_cm;
      const volB = b.length_cm * b.width_cm * b.height_cm;
      return volA - volB;
    });
    recommendedVan = sorted[0];
  }

  const savingsGbp = calculatePriceSavings(recommendedVan, vans);

  return {
    vanProofs,
    recommendedVanId: recommendedVan ? recommendedVan.id : null,
    savingsGbp,
  };
}
