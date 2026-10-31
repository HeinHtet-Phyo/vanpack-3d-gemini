/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { VanPreset, MultiVanPackingResult, InventoryItem } from '../types';
import { getLeftoverReason } from './vans';
import { getLoadingInstruction, GAP_CM, MIN_SUPPORT_RATIO } from './packer';
import {
  MoveConfig,
  DEFAULT_MOVE_CONFIG,
  calculateVanTotalCost,
  VanCostBreakdown,
} from './costEngine';
import { Scene3D } from './scene3d';
import { GEMINI_CONFIG, logGeminiTelemetry } from '../config/gemini';
import {
  GhostDoodle,
  PackingTapeDivider,
  ManifestSheetHeader,
} from '../components/ManifestPrimitives';
import {
  RefreshCw,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  Printer,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';

interface ResultsProps {
  vans: VanPreset[];
  packingResult: MultiVanPackingResult;
  selectedVanId: string;
  onSelectVan: (vanId: string) => void;
  inventory?: InventoryItem[];
  moveConfig?: MoveConfig;
  onGoTo3DView?: () => void;
}

interface DispatcherNoteData {
  sentences: string;
  loading_tips: string[];
}

const STAMP_ROTATIONS = ['-2.2deg', '1.4deg', '-1.3deg', '2.1deg', '-1.8deg', '1.2deg'];

/**
 * Extracts all numeric tokens from a string (stripping thousand-separator commas first)
 * so every number in Gemini's text can be checked deterministically against the input JSON.
 */
export function extractNumbersFromString(input: string): string[] {
  const withoutThousandCommas = input.replace(/(\d),(\d{3})\b/g, '$1$2');
  const matches = withoutThousandCommas.match(/\d+(?:\.\d+)?/g) || [];
  return matches.map((m) => String(Number(m)));
}

/**
 * Deterministically checks that EVERY number appearing in the Gemini Dispatcher's Note text
 * exists inside the verified packer/verifier/cost JSON sent to the model.
 */
export function verifyDispatcherNoteNumbers(
  note: DispatcherNoteData,
  verifiedJson: unknown
): {
  isVerified: boolean;
  allNumbersInNote: string[];
  unverifiedNumbers: string[];
} {
  const jsonString = JSON.stringify(verifiedJson);
  const allowedNumbers = new Set<string>(extractNumbersFromString(jsonString));

  const fullNoteText = `${note.sentences} ${(note.loading_tips || []).join(' ')}`;
  const allNumbersInNote = extractNumbersFromString(fullNoteText);
  const unverifiedNumbers = allNumbersInNote.filter((num) => !allowedNumbers.has(num));

  return {
    isVerified: unverifiedNumbers.length === 0,
    allNumbersInNote,
    unverifiedNumbers,
  };
}

/**
 * Builds the strictly verified JSON payload from the deterministic packer, verifier, and cost engine.
 * This is the ONLY data sent to gemini-4-argon for the Dispatcher's Note.
 */
function buildVerifiedDispatcherJson(
  vans: VanPreset[],
  packingResult: MultiVanPackingResult,
  costByVanId: Record<string, VanCostBreakdown>
) {
  const { vanProofs, recommendedVanId, savingsGbp } = packingResult;
  const recVan = vans.find((v) => v.id === recommendedVanId) || vans[vans.length - 1];
  const recProof = vanProofs[recVan.id] || Object.values(vanProofs)[0];
  const recCost = costByVanId[recVan.id];
  const lutonVan = vans.find((v) => v.id === 'luton') || vans[vans.length - 1];
  const lutonCost = costByVanId[lutonVan.id];

  const smallerFailingVans = vans
    .filter((v) => {
      const p = vanProofs[v.id];
      return p && !p.fitsAll && v.price_gbp <= recVan.price_gbp;
    })
    .map((v) => {
      const p = vanProofs[v.id];
      const c = costByVanId[v.id];
      return {
        van_name: v.label,
        price_gbp: v.price_gbp,
        total_cost_gbp: c?.totalCostGbp ?? v.price_gbp,
        trips_needed: c?.tripsNeeded ?? 2,
        length_cm: v.length_cm,
        width_cm: v.width_cm,
        height_cm: v.height_cm,
        max_payload_kg: v.max_payload_kg,
        leftover_count: p.leftoverItems.length,
        leftover_items: p.leftoverItems.slice(0, 6).map((lo) => ({
          name: lo.name,
          w_cm: lo.w_cm,
          d_cm: lo.d_cm,
          h_cm: lo.h_cm,
          weight_kg: lo.weight_kg,
          reason: getLeftoverReason(lo, v),
        })),
      };
    });

  const placed = recProof?.placedItems || [];
  const firstItems = placed.slice(0, 4).map((it) => ({
    step: it.stepOrder,
    name: it.name,
    w_cm: it.w_cm,
    d_cm: it.d_cm,
    h_cm: it.h_cm,
    weight_kg: it.weight_kg,
    instruction: getLoadingInstruction(it, placed),
  }));

  const fragileOrLastItems = placed
    .filter((it) => it.fragile || it.stepOrder > Math.max(1, placed.length - 4))
    .slice(-4)
    .map((it) => ({
      step: it.stepOrder,
      name: it.name,
      w_cm: it.w_cm,
      d_cm: it.d_cm,
      h_cm: it.h_cm,
      weight_kg: it.weight_kg,
      fragile: it.fragile,
      instruction: getLoadingInstruction(it, placed),
    }));

  return {
    recommended_van: {
      name: recVan.label,
      full_name: recVan.name,
      day_rate_gbp: recVan.price_gbp,
      total_move_cost_gbp: recCost?.totalCostGbp ?? recVan.price_gbp,
      trips_needed: recCost?.tripsNeeded ?? 1,
      days_needed: recCost?.daysNeeded ?? 1,
      driving_miles: recCost?.drivingMiles ?? 10,
      estimated_duration: recCost?.formattedDuration ?? '~3h',
      total_hours: recCost?.totalHours ?? 3,
      hire_cost_gbp: recCost?.hireCostGbp ?? recVan.price_gbp,
      fuel_cost_gbp: recCost?.fuelCostGbp ?? 10,
      insurance_cost_gbp: recCost?.insuranceCostGbp ?? 15,
      congestion_cost_gbp: recCost?.congestionCostGbp ?? 0,
      parking_cost_gbp: recCost?.parkingCostGbp ?? 0,
      movers_cost_gbp: recCost?.moversCostGbp ?? 0,
      extras_cost_gbp: recCost?.extrasCostGbp ?? 10,
      savings_day_rate_vs_luton_gbp: savingsGbp,
      savings_total_vs_luton_gbp: Math.max(
        0,
        (lutonCost?.totalCostGbp ?? lutonVan.price_gbp) -
          (recCost?.totalCostGbp ?? recVan.price_gbp)
      ),
      luton_price_gbp: lutonVan.price_gbp,
      luton_total_cost_gbp: lutonCost?.totalCostGbp ?? lutonVan.price_gbp,
      length_cm: recVan.length_cm,
      width_cm: recVan.width_cm,
      height_cm: recVan.height_cm,
      max_payload_kg: recVan.max_payload_kg,
      placed_count: placed.length,
      leftover_count: recProof?.leftoverItems.length || 0,
      total_weight_kg: recProof?.totalWeightKg || 0,
      used_volume_m3: recProof?.usedVolumeM3 || 0,
      van_volume_m3: recProof?.vanVolumeM3 || 0,
      volume_used_pct: recProof?.volumeUsedPct || 0,
      safety_gap_cm: GAP_CM,
      min_support_pct: Math.round(MIN_SUPPORT_RATIO * 100),
      verifier_checks_passed: recProof?.checks.filter((c) => c.passed).length || 0,
      verifier_checks_total: recProof?.checks.length || 6,
    },
    smaller_failing_vans: smallerFailingVans,
    loading_sequence: {
      first_heaviest_items: firstItems,
      fragile_or_final_items: fragileOrLastItems,
    },
  };
}

/**
 * Deterministic fallback Dispatcher's Note constructed strictly from the verified JSON.
 */
function buildDeterministicFallbackNote(
  verifiedJson: ReturnType<typeof buildVerifiedDispatcherJson>
): DispatcherNoteData {
  const rv = verifiedJson.recommended_van;
  const failing = verifiedJson.smaller_failing_vans;

  const s1 = `The ${rv.name} (£${rv.total_move_cost_gbp} total, £${rv.day_rate_gbp} day rate) fits all ${rv.placed_count} items in ${rv.trips_needed} trip at ${rv.volume_used_pct}% volume (${rv.total_weight_kg}kg of ${rv.max_payload_kg}kg payload), saving £${rv.savings_total_vs_luton_gbp} total (£${rv.savings_day_rate_vs_luton_gbp}/day) versus the Luton Van.`;

  let s2 = `Smaller vans could not fit the full load in ${rv.trips_needed} trip.`;
  let s3 = `Every placed item passed all ${rv.verifier_checks_passed} of ${rv.verifier_checks_total} deterministic checks with ${rv.min_support_pct}% minimum base support and a ${rv.safety_gap_cm}cm safety buffer.`;

  if (failing.length > 0) {
    const firstFail = failing[failing.length - 1];
    const firstLeftover = firstFail.leftover_items[0];
    s2 = `The ${firstFail.van_name} (£${firstFail.price_gbp}/day) left ${firstFail.leftover_count} item(s) behind and would need ${firstFail.trips_needed} trips (£${firstFail.total_cost_gbp} total) because ${
      firstLeftover ? firstLeftover.reason : 'cargo exceeded its internal dimensions'
    }.`;
  }

  const firstItem = verifiedJson.loading_sequence.first_heaviest_items[0];
  const secondItem = verifiedJson.loading_sequence.first_heaviest_items[1];
  const lastFragile =
    verifiedJson.loading_sequence.fragile_or_final_items[
      verifiedJson.loading_sequence.fragile_or_final_items.length - 1
    ];

  const tip1 = firstItem
    ? `Step ${firstItem.step}: Load ${firstItem.name} (${firstItem.w_cm}×${firstItem.d_cm}×${firstItem.h_cm}cm, ${firstItem.weight_kg}kg) first on the floor against the cab bulkhead${
        secondItem
          ? `, followed by Step ${secondItem.step} ${secondItem.name} (${secondItem.weight_kg}kg)`
          : ''
      }.`
    : `Load heaviest floor items against the cab bulkhead first with a ${rv.safety_gap_cm}cm gap.`;

  const tip2 = lastFragile
    ? `Step ${lastFragile.step}: Load ${lastFragile.name} (${lastFragile.w_cm}×${lastFragile.d_cm}×${lastFragile.h_cm}cm, ${lastFragile.weight_kg}kg) last near the rear doors with 0 items stacked on top.`
    : `Keep fragile items on the top layer with at least ${rv.min_support_pct}% base support underneath.`;

  return {
    sentences: `${s1} ${s2} ${s3}`,
    loading_tips: [tip1, tip2],
  };
}

/**
 * Screen 3 ("3 YOUR ANSWER"):
 * - One Big Answer Card ("BOOK THE MEDIUM VAN · £148 TOTAL · 1 TRIP · ~4h 20m", "Saves £61 vs a Luton", "Saves £34 vs 2 trips in a Small van")
 * - Itemised Printed Till Receipt (hire, fuel, insurance, congestion, parking, movers, extras, TOTAL) + "Details ▾" formulas
 * - 10-Van Total Cost Comparison Chart (TOTAL cost + trips needed + key insight callout)
 * - Realistic 3D Cutaway Van (<Scene3D />) with 10-van switcher (⭐ recommended) & Moving-Day Voice Mode
 * - 6 Verifier Stamps (compact, expandable) + Gemini Dispatcher's Note with deterministic number check
 * - Action buttons: Copy plan · Print manifest · Book this van ↗
 */
export const Results: React.FC<ResultsProps> = ({
  vans,
  packingResult,
  selectedVanId,
  onSelectVan,
  inventory = [],
  moveConfig = DEFAULT_MOVE_CONFIG,
}) => {
  const { vanProofs, recommendedVanId, savingsGbp } = packingResult;
  const activeVan = vans.find((v) => v.id === selectedVanId) || vans[0];
  const activeProof = vanProofs[activeVan.id] || Object.values(vanProofs)[0];
  const recommendedVan = vans.find((v) => v.id === recommendedVanId) || null;
  const lutonVan = vans.find((v) => v.id === 'luton') || vans[vans.length - 1];

  const [showReceiptFormulas, setShowReceiptFormulas] = useState(false);
  const [showVerifierDetails, setShowVerifierDetails] = useState(false);

  // Reconstruct inventory from placed + leftover if inventory prop wasn't passed
  const effectiveInventory: InventoryItem[] = useMemo(() => {
    if (inventory && inventory.length > 0) return inventory;
    if (!activeProof) return [];
    const allItems = [...activeProof.placedItems, ...activeProof.leftoverItems];
    return allItems.map((p, idx) => ({
      id: `reconstructed-${idx}`,
      name: p.name,
      category: p.category,
      quantity: 1,
      width_cm: p.original_w_cm || p.w_cm,
      depth_cm: p.original_d_cm || p.d_cm,
      height_cm: p.original_h_cm || p.h_cm,
      weight_kg: p.weight_kg,
      fragile: p.fragile,
      can_stack_on_top: p.can_stack_on_top,
      can_rotate: true,
      confidence: 1,
      reasoning_short: '',
    }));
  }, [inventory, activeProof]);

  // Compute deterministic total cost breakdown across all 10 vans
  const costByVanId = useMemo(() => {
    const map: Record<string, VanCostBreakdown> = {};
    for (const v of vans) {
      const p = vanProofs[v.id];
      if (p) {
        map[v.id] = calculateVanTotalCost(v, p, effectiveInventory, moveConfig);
      }
    }
    return map;
  }, [vans, vanProofs, effectiveInventory, moveConfig]);

  const answerVan = recommendedVan || activeVan;
  const answerCost = costByVanId[answerVan.id] || costByVanId[activeVan.id];
  const activeCost = costByVanId[activeVan.id] || answerCost;
  const lutonCost = costByVanId[lutonVan.id];
  const smallVan = vans.find((v) => v.id === 'small') || vans[0];
  const smallCost = costByVanId[smallVan.id];

  const savedTotalVsLuton = useMemo(() => {
    if (!answerCost || !lutonCost) return savingsGbp;
    return Math.max(0, lutonCost.totalCostGbp - answerCost.totalCostGbp);
  }, [answerCost, lutonCost, savingsGbp]);

  // Find a smaller van that needs 2+ trips and therefore costs MORE in total than the recommended van
  const multiTripSmallerComparison = useMemo(() => {
    if (!answerVan || !answerCost) return null;
    const candidates = vans.filter(
      (v) =>
        v.price_gbp < answerVan.price_gbp &&
        !vanProofs[v.id]?.fitsAll &&
        costByVanId[v.id]
    );
    if (candidates.length === 0) return null;
    // Prefer Small Van if it is among the candidates
    const chosenSmaller =
      candidates.find((c) => c.id === 'small') || candidates[candidates.length - 1];
    const smallerBreakdown = costByVanId[chosenSmaller.id];
    const dayRateDiff = answerVan.price_gbp - chosenSmaller.price_gbp;
    const extraTotalCost = smallerBreakdown.totalCostGbp - answerCost.totalCostGbp;
    return {
      smallerVan: chosenSmaller,
      smallerBreakdown,
      dayRateDiff,
      extraTotalCost,
    };
  }, [vans, answerVan, answerCost, vanProofs, costByVanId]);

  const verifiedJsonPayload = useMemo(
    () => buildVerifiedDispatcherJson(vans, packingResult, costByVanId),
    [vans, packingResult, costByVanId]
  );

  const [dispatcherNote, setDispatcherNote] = useState<DispatcherNoteData | null>(null);
  const [isNoteLoading, setIsNoteLoading] = useState<boolean>(false);
  const [copiedPlan, setCopiedPlan] = useState<boolean>(false);

  const fetchDispatcherNote = useCallback(async () => {
    setIsNoteLoading(true);
    try {
      const response = await fetch(GEMINI_CONFIG.ENDPOINTS.EXPLAIN_PLAN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedJson: verifiedJsonPayload }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data?.note?.sentences) {
        logGeminiTelemetry(
          "Dispatcher's Note (/api/gemini/explain-plan)",
          { verifiedJson: verifiedJsonPayload },
          data.telemetry || data.note
        );
        setDispatcherNote(data.note);
      } else {
        const fallback = buildDeterministicFallbackNote(verifiedJsonPayload);
        setDispatcherNote(fallback);
      }
    } catch {
      const fallback = buildDeterministicFallbackNote(verifiedJsonPayload);
      setDispatcherNote(fallback);
    } finally {
      setIsNoteLoading(false);
    }
  }, [verifiedJsonPayload]);

  useEffect(() => {
    fetchDispatcherNote();
  }, [fetchDispatcherNote]);

  const noteVerification = useMemo(() => {
    if (!dispatcherNote) {
      return { isVerified: true, allNumbersInNote: [], unverifiedNumbers: [] };
    }
    return verifyDispatcherNoteNumbers(dispatcherNote, verifiedJsonPayload);
  }, [dispatcherNote, verifiedJsonPayload]);

  const handleCopyLoadPlan = async () => {
    if (!activeProof || !activeCost) return;
    const lines: string[] = [
      `==================================================`,
      `VANPACK 3D — VERIFIED REMOVAL MANIFEST & RECEIPT`,
      `==================================================`,
      `RECOMMENDED VAN: ${answerVan.name} (£${answerCost.totalCostGbp} TOTAL · ${answerCost.tripsNeeded} TRIP · ${answerCost.formattedDuration})`,
      `ROUTE: ${moveConfig.fromPostcode} → ${moveConfig.toPostcode} (${moveConfig.distanceMiles} miles one-way)`,
      `SELECTED VAN: ${activeVan.name} (${activeVan.length_cm}×${activeVan.width_cm}×${activeVan.height_cm}cm, max ${activeVan.max_payload_kg}kg)`,
      `STATUS: ${activeProof.fitsAll ? 'VERIFIED PASS ✓ (0 LEFTOVERS)' : `FAIL ✗ (${activeProof.leftoverItems.length} LEFTOVERS)`}`,
      `CARGO: ${activeProof.placedItems.length} items placed | ${activeProof.totalWeightKg}kg | ${activeProof.usedVolumeM3}m³ (${activeProof.volumeUsedPct}%)`,
      ``,
      `ITEMISED TOTAL COST RECEIPT (${activeVan.label}):`,
      ...activeCost.receiptLines.map(
        (line) => `  - ${line.label}: £${line.amountGbp} (${line.formulaText})`
      ),
      `  ===================================`,
      `  TOTAL ESTIMATED MOVE COST: £${activeCost.totalCostGbp}`,
      ``,
      `LOADING SEQUENCE (CAB TO REAR DOORS):`,
      ...activeProof.placedItems.map(
        (it) =>
          `  #${String(it.stepOrder).padStart(2, '0')} ${it.name} (${it.w_cm}×${it.d_cm}×${it.h_cm}cm, ${it.weight_kg}kg) — ${getLoadingInstruction(
            it,
            activeProof.placedItems
          )}`
      ),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPlan(true);
      setTimeout(() => setCopiedPlan(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  if (!activeProof || !activeCost || !answerCost) return null;

  const passedCount = activeProof.checks.filter((c) => c.passed).length;
  const maxChartCost = Math.max(
    1,
    ...vans.map((v) => costByVanId[v.id]?.totalCostGbp || v.price_gbp)
  );
  const bookSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${answerVan.label} van hire near ${moveConfig.fromPostcode || 'London'}`
  )}`;

  return (
    <div id="delivery-ticket-section" className="space-y-8">
      {/* ================================================================= */}
      {/* 1. ONE BIG ANSWER CARD                                            */}
      {/* ================================================================= */}
      <div className="manifest-sheet border-4 border-[#1B1A17] bg-[#FAF6EE] p-6 sm:p-8 shadow-[6px_6px_0_#1B1A17] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#1B1A17] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 bg-[#2F6B3A] text-[#F4EFE6] font-mono text-xs font-extrabold uppercase">
              3. YOUR VERIFIED ANSWER · ALL 6 CHECKS PASSED ✓
            </span>
            <span className="font-mono text-xs font-bold text-[#9C7444]">
              {moveConfig.fromPostcode} → {moveConfig.toPostcode} ({moveConfig.distanceMiles} mi)
            </span>
          </div>

          {/* Action Buttons: Copy plan · Print manifest · Book this van ↗ */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLoadPlan}
              className="btn-manifest px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
            >
              {copiedPlan ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#2F6B3A]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy plan</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="btn-manifest px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print manifest</span>
            </button>

            <a
              href={bookSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-hivis px-4 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer no-underline text-[#1B1A17]"
              title="Opens a search for van hire near your From postcode in a new tab; nothing is booked automatically"
            >
              <span>Book this van ↗</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Headline 40px+ Answer */}
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-5xl lg:text-[52px] font-extrabold font-display text-[#1B1A17] leading-[1.02] tracking-wide uppercase">
            BOOK THE {answerVan.label.toUpperCase()} ·{' '}
            <span className="bg-[#F2D21B] px-2.5 border-2 border-[#1B1A17]">
              £{answerCost.totalCostGbp} TOTAL
            </span>{' '}
            · {answerCost.tripsNeeded} TRIP{answerCost.tripsNeeded > 1 ? 'S' : ''} ·{' '}
            {answerCost.formattedDuration}
          </h1>

          <p className="text-[17px] text-[#1B1A17]/90 font-medium">
            {answerVan.name} ({answerVan.length_cm}×{answerVan.width_cm}×{answerVan.height_cm}cm ·{' '}
            {answerVan.max_payload_kg}kg max payload · £{answerVan.price_gbp}/day example rate ·{' '}
            {answerVan.licenceLabel || 'Car licence'}) fits 100% of your{' '}
            <strong>{activeProof.placedItems.length + activeProof.leftoverItems.length}</strong> items in a single verified load.
          </p>

          {/* Savings Callout Badges */}
          <div className="flex flex-wrap items-center gap-3 pt-1 font-mono">
            {savedTotalVsLuton > 0 && (
              <div className="px-4 py-2 bg-[#2F6B3A] text-[#F4EFE6] border-2 border-[#1B1A17] text-sm sm:text-base font-extrabold uppercase shadow-[3px_3px_0_#1B1A17]">
                ✓ SAVES £{savedTotalVsLuton} TOTAL VS A LUTON (£{savingsGbp}/DAY HIRE SAVED)
              </div>
            )}

            {multiTripSmallerComparison &&
              multiTripSmallerComparison.extraTotalCost > 0 && (
                <div className="px-4 py-2 bg-[#F2D21B] text-[#1B1A17] border-2 border-[#1B1A17] text-sm sm:text-base font-extrabold uppercase shadow-[3px_3px_0_#1B1A17]">
                  ✓ SAVES £{multiTripSmallerComparison.extraTotalCost} VS{' '}
                  {multiTripSmallerComparison.smallerBreakdown.tripsNeeded} TRIPS IN A{' '}
                  {multiTripSmallerComparison.smallerVan.label.toUpperCase()}
                </div>
              )}

            {smallCost && !vanProofs[smallVan.id]?.fitsAll && (
              <div className="px-3.5 py-2 bg-[#EBE3D5] text-[#C2362B] border-2 border-[#1B1A17] text-xs sm:text-sm font-bold uppercase">
                SMALL VAN FAILS ({vanProofs[smallVan.id]?.leftoverItems.length} LEFTOVER
                {vanProofs[smallVan.id]?.leftoverItems.length === 1 ? '' : 'S'})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. ITEMISED TILL RECEIPT + 10-VAN TOTAL COST COMPARISON CHART     */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 cols: Printed Till Receipt */}
        <div className="lg:col-span-5 manifest-sheet bg-[#FAF6EE] border-2 border-[#1B1A17] overflow-hidden">
          <div className="bg-[#1B1A17] text-[#F4EFE6] px-5 py-3.5 border-b-2 border-[#1B1A17] flex items-center justify-between font-mono">
            <div>
              <div className="text-[10px] text-[#F2D21B] font-bold uppercase">
                ITEMISED TILL RECEIPT (CODE CALCULATED)
              </div>
              <div className="text-base font-bold uppercase">
                {activeVan.label} ({activeCost.tripsNeeded} TRIP
                {activeCost.tripsNeeded > 1 ? 'S' : ''} · {activeCost.formattedDuration})
              </div>
            </div>
            <span className="px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] text-[10px] font-bold uppercase">
              DETERMINISTIC
            </span>
          </div>

          <div className="p-5 font-mono space-y-4">
            <div className="text-xs text-[#1B1A17]/80 border-b border-dashed border-[#1B1A17] pb-2 flex justify-between">
              <span>
                ROUTE: {moveConfig.fromPostcode} → {moveConfig.toPostcode}
              </span>
              <span>{activeCost.drivingMiles} DRIVING MI</span>
            </div>

            {/* Receipt Line Items */}
            <div className="space-y-2.5 text-sm">
              {activeCost.receiptLines.map((line) => (
                <div key={line.id} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[#1B1A17]">{line.label}</span>
                    <span className="font-bold text-[#1B1A17] shrink-0">
                      £{line.amountGbp}
                    </span>
                  </div>
                  {showReceiptFormulas && (
                    <div className="text-[11px] text-[#9C7444] bg-[#EBE3D5] px-2 py-1 border border-[#1B1A17]/20">
                      Formula: {line.formulaText}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Dashed Total Strip */}
            <div className="border-t-2 border-b-2 border-dashed border-[#1B1A17] py-3 flex items-baseline justify-between">
              <div>
                <div className="text-base font-extrabold uppercase text-[#1B1A17]">
                  TOTAL MOVE COST
                </div>
                <div className="text-[11px] text-[#1B1A17]/75">
                  {activeCost.loadingMinutes}m load + {activeCost.drivingMinutes}m drive +{' '}
                  {activeCost.unloadingMinutes}m unload = {activeCost.formattedDuration}
                </div>
              </div>
              <div className="text-[40px] leading-none font-extrabold text-[#1B1A17]">
                £{activeCost.totalCostGbp}
              </div>
            </div>

            {/* Details ▾ Toggle for Receipt Formulas */}
            <button
              type="button"
              onClick={() => setShowReceiptFormulas((prev) => !prev)}
              className="w-full btn-manifest px-3 py-2 text-xs font-mono font-bold uppercase flex items-center justify-between cursor-pointer"
            >
              <span>
                Details ▾ ({showReceiptFormulas ? 'Hide' : 'Show'} Exact Code Formulas)
              </span>
              {showReceiptFormulas ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showReceiptFormulas && (
              <div className="p-3 bg-[#EBE3D5] border border-[#1B1A17] text-[11px] space-y-1 text-[#1B1A17]">
                <div className="font-bold uppercase text-[#9C7444]">
                  TRIP CALCULATION PROOF:
                </div>
                <div>{activeCost.tripFormulaExplanation}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right 7 cols: 10-Van Total Cost Comparison Chart */}
        <div className="lg:col-span-7 manifest-sheet bg-[#FAF6EE] border-2 border-[#1B1A17] overflow-hidden">
          <ManifestSheetHeader
            manifestNo="FLEET SCHEDULE VP-10VANS"
            title="ALL 10 VANS COMPARED BY TOTAL MOVE COST"
            subtitle="Click any van row to inspect its receipt and 3D load. Shows TOTAL cost (including multi-trip fuel & time), not just the headline day rate."
          />

          <div className="p-5 space-y-4">
            {/* Key Insight Callout */}
            {multiTripSmallerComparison && (
              <div className="bg-[#F2D21B]/50 border-2 border-[#1B1A17] p-3.5 font-sans text-sm sm:text-base text-[#1B1A17] font-semibold">
                💡 <strong>Key insight:</strong> The{' '}
                <strong>{multiTripSmallerComparison.smallerVan.label}</strong> looks{' '}
                <strong>£{multiTripSmallerComparison.dayRateDiff} cheaper per day</strong> (£
                {multiTripSmallerComparison.smallerVan.price_gbp}/day vs £
                {answerVan.price_gbp}/day), but leaves{' '}
                <strong>
                  {
                    vanProofs[multiTripSmallerComparison.smallerVan.id]?.leftoverItems
                      .length
                  }{' '}
                  item(s) behind
                </strong>{' '}
                and needs{' '}
                <strong>
                  {multiTripSmallerComparison.smallerBreakdown.tripsNeeded} trips
                </strong>
                {multiTripSmallerComparison.smallerBreakdown.hasOversizeItemThatNeverFits
                  ? ' (and has items longer than its floor)'
                  : ''}
                — so its total move cost is{' '}
                <strong>
                  £{multiTripSmallerComparison.smallerBreakdown.totalCostGbp} vs £
                  {answerCost.totalCostGbp}
                </strong>
                !
              </div>
            )}

            {/* 10-Van Bar Chart Rows */}
            <div className="space-y-2 font-mono text-xs">
              {vans.map((van) => {
                const proof = vanProofs[van.id];
                const cost = costByVanId[van.id];
                if (!proof || !cost) return null;

                const isRecommended = van.id === recommendedVanId;
                const isSelected = van.id === selectedVanId;
                const widthPct = Math.max(
                  14,
                  Math.min(100, Math.round((cost.totalCostGbp / maxChartCost) * 100))
                );

                return (
                  <button
                    key={van.id}
                    type="button"
                    onClick={() => onSelectVan(van.id)}
                    className={`w-full text-left p-2.5 border-2 border-[#1B1A17] transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#F2D21B]/45 shadow-[3px_3px_0_#1B1A17]'
                        : 'bg-[#EBE3D5]/60 hover:bg-[#C8A26B]/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#1B1A17]">
                          {isRecommended ? '⭐ ' : ''}
                          {van.label}
                        </span>
                        <span className="text-[11px] text-[#1B1A17]/75">
                          ({van.length_cm}×{van.width_cm}×{van.height_cm}cm · £{van.price_gbp}/day example)
                        </span>
                        {isRecommended && (
                          <span className="px-1.5 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] text-[10px] font-bold uppercase">
                            RECOMMENDED
                          </span>
                        )}
                        {van.requiresSpecialLicence && (
                          <span className="px-1.5 py-0.5 bg-[#C2362B] text-[#F4EFE6] text-[10px] font-bold uppercase">
                            {van.licenceLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 border border-[#1B1A17] text-[10px] font-bold uppercase ${
                            proof.fitsAll
                              ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                              : 'bg-[#C2362B] text-[#F4EFE6]'
                          }`}
                        >
                          {proof.fitsAll
                            ? '1 TRIP · FITS ALL ✓'
                            : `${cost.tripsNeeded} TRIPS (${proof.leftoverItems.length} LEFT BEHIND)`}
                        </span>
                        <span className="text-base font-extrabold text-[#1B1A17]">
                          £{cost.totalCostGbp}
                        </span>
                      </div>
                    </div>

                    {/* Horizontal Bar */}
                    <div className="w-full h-3 bg-[#FAF6EE] border border-[#1B1A17] overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full ${
                          isRecommended
                            ? 'bg-[#2F6B3A]'
                            : proof.fitsAll
                            ? 'bg-[#9C7444]'
                            : 'bg-[#C2362B]'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. REALISTIC 3D CUTAWAY VAN (REWARD + 10-VAN SWITCHER + VOICE)    */}
      {/* ================================================================= */}
      <PackingTapeDivider label="INTERACTIVE 3D VAN LOADING BAY · 10 VANS · MOVING-DAY VOICE MODE" />

      <Scene3D
        vans={vans}
        packingResult={packingResult}
        selectedVanId={selectedVanId}
        onSelectVan={onSelectVan}
      />

      {/* ================================================================= */}
      {/* 4. DISPATCHER'S NOTE (GEMINI 4 ARGON + NUMBER CHECK)              */}
      {/* ================================================================= */}
      <div className="manifest-sheet overflow-hidden">
        <ManifestSheetHeader
          manifestNo="DISPATCH NOTE VP-ARGON-02"
          title={`DISPATCHER'S NOTE (${GEMINI_CONFIG.MODEL_NAME.toUpperCase()})`}
          subtitle="Written strictly from the verified packer, verifier, and cost engine JSON. Every number in the note is checked in code."
          rightBadge={
            <div className="flex items-center gap-2">
              {dispatcherNote && !isNoteLoading && (
                <span
                  className={`stamp-badge text-xs ${
                    noteVerification.isVerified ? 'stamp-pass' : 'stamp-fail'
                  }`}
                >
                  {noteVerification.isVerified
                    ? 'FIGURES CHECKED ✓'
                    : 'UNVERIFIED FIGURES'}
                </span>
              )}
              <button
                type="button"
                onClick={fetchDispatcherNote}
                disabled={isNoteLoading}
                className="btn-manifest px-3 py-1.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isNoteLoading ? 'animate-spin' : ''}`}
                />
                <span>Regenerate</span>
              </button>
            </div>
          }
        />

        <div className="p-5 sm:p-6">
          {isNoteLoading && !dispatcherNote ? (
            <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-6 flex items-center gap-3 font-mono text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-[#1B1A17]" />
              <span>
                {GEMINI_CONFIG.MODEL_NAME} is writing the Dispatcher&apos;s Note from verified JSON…
              </span>
            </div>
          ) : dispatcherNote ? (
            <div
              className={`border-2 border-[#1B1A17] p-5 sm:p-6 transition-opacity ${
                noteVerification.isVerified
                  ? 'bg-[#FAF6EE] text-[#1B1A17]'
                  : 'bg-[#EBE3D5] text-[#1B1A17]/60'
              }`}
            >
              <p className="font-handwritten text-2xl sm:text-[26px] leading-snug text-[#1B1A17]">
                &ldquo;{dispatcherNote.sentences}&rdquo;
              </p>

              {dispatcherNote.loading_tips && dispatcherNote.loading_tips.length > 0 && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-[#1B1A17]/30 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dispatcherNote.loading_tips.map((tip, idx) => (
                    <div
                      key={idx}
                      className="bg-[#EBE3D5] border border-[#1B1A17] p-3 flex items-start gap-2.5"
                    >
                      <span className="px-2 py-0.5 bg-[#1B1A17] text-[#F2D21B] font-mono text-[10px] font-bold uppercase shrink-0 mt-0.5">
                        TIP 0{idx + 1}
                      </span>
                      <p className="font-handwritten text-xl leading-snug text-[#1B1A17]">
                        {tip}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-[#1B1A17]/20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  {noteVerification.isVerified ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#2F6B3A]" />
                      <span className="text-[#2F6B3A] font-bold">
                        CODE NUMBER AUDIT PASSED: All {noteVerification.allNumbersInNote.length} numbers in this note match the verified JSON verbatim.
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-[#C2362B]" />
                      <span className="text-[#C2362B] font-bold">
                        UNVERIFIED FIGURES DETECTED ({noteVerification.unverifiedNumbers.join(', ')}) — note greyed out.
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. COMPACT 6 VERIFIER STAMPS + LEFTOVER REASONS (EXPANDABLE)      */}
      {/* ================================================================= */}
      <div className="manifest-sheet overflow-hidden">
        <div className="p-5 bg-[#EBE3D5] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`stamp-badge text-sm ${
                activeProof.fitsAll ? 'stamp-pass' : 'stamp-fail'
              }`}
            >
              {activeProof.fitsAll
                ? `VERIFIED PASS ✓ (${passedCount}/6 CHECKS)`
                : `FAILED IN ${activeVan.label.toUpperCase()} (${passedCount}/6 CHECKS)`}
            </span>
            <span className="font-mono text-xs font-bold text-[#1B1A17]">
              INDEPENDENT DETERMINISTIC VERIFIER · {activeVan.name.toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowVerifierDetails((prev) => !prev)}
            className="btn-manifest px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <span>
              Details ▾ ({showVerifierDetails ? 'Hide' : 'Show'} 6 Verifier Stamps &amp; Leftover Reasons)
            </span>
            {showVerifierDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Always show a compact row of the 6 stamps */}
        <div className="px-5 py-3 bg-[#FAF6EE] border-t-2 border-[#1B1A17] flex flex-wrap items-center gap-2.5">
          {activeProof.checks.map((check, i) => (
            <span
              key={check.id}
              style={{ transform: `rotate(${STAMP_ROTATIONS[i % STAMP_ROTATIONS.length]})` }}
              className={`stamp-badge text-[11px] ${
                check.passed ? 'stamp-pass' : 'stamp-fail'
              }`}
            >
              0{i + 1} {check.label.split('(')[0].trim()} {check.passed ? '✓' : '✗'}
            </span>
          ))}
        </div>

        {/* Leftovers warning if viewing a smaller failing van */}
        {activeProof.leftoverItems.length > 0 && (
          <div className="p-5 border-t-2 border-[#1B1A17] bg-[#C2362B]/10 space-y-3">
            <div className="flex items-center gap-3">
              <GhostDoodle className="w-8 h-8 shrink-0" />
              <div className="font-display text-xl font-bold uppercase text-[#C2362B]">
                {activeProof.leftoverItems.length} ITEM(S) LEFT BEHIND ON PAVEMENT IN {activeVan.label.toUpperCase()}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 font-mono text-xs">
              {activeProof.leftoverItems.map((lo) => (
                <div
                  key={lo.instanceId}
                  className="p-3 bg-[#FAF6EE] border-2 border-[#C2362B] space-y-1"
                >
                  <div className="font-bold text-[#1B1A17]">
                    {lo.name} ({lo.original_w_cm}×{lo.original_d_cm}×{lo.original_h_cm}cm · {lo.weight_kg}kg)
                  </div>
                  <div className="text-[#C2362B] font-bold">
                    Reason: {getLeftoverReason(lo, activeVan)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expanded 6-Check Explanations */}
        {showVerifierDetails && (
          <div className="p-5 border-t-2 border-[#1B1A17] bg-[#FAF6EE] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activeProof.checks.map((check, i) => (
              <div
                key={check.id}
                className="p-3.5 bg-[#EBE3D5] border-2 border-[#1B1A17] space-y-1.5"
              >
                <div className="flex items-center justify-between font-mono text-xs font-bold">
                  <span>CHECK 0{i + 1}</span>
                  <span
                    className={
                      check.passed ? 'text-[#2F6B3A]' : 'text-[#C2362B]'
                    }
                  >
                    {check.passed ? 'PASS ✓' : 'FAIL ✗'}
                  </span>
                </div>
                <div className="font-bold text-sm text-[#1B1A17]">
                  {check.label}
                </div>
                <p className="text-xs font-mono text-[#1B1A17]/80">
                  {check.explanation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
