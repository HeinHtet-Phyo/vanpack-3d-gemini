/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, VanPreset, VerificationProof, PlacedItem } from '../types';
import { packVan } from './packer';

export type FloorLevel = 0 | 1 | 2 | 3; // 0 = Ground, 1 = 1st, 2 = 2nd, 3 = 3rd+
export type HelperOption = 'solo' | 'friends' | 'movers';

export interface MoveConfig {
  fromPostcode: string;
  toPostcode: string;
  distanceMiles: number;
  distanceSource: 'postcodes.io' | 'manual';
  isWeekend: boolean;
  fromFloor: FloorLevel;
  fromHasLift: boolean;
  toFloor: FloorLevel;
  toHasLift: boolean;
  helpers: HelperOption;
  inCongestionZone: boolean;
  congestionAutoSuggested: boolean;
  parkingSuspension: boolean;
  needBlanketsAndStraps: boolean;
  needBoxesCount: number;
  allowSpecialLicence: boolean;
  // Editable rates in Details ▾
  dieselPricePerLitreGbp: number;
  weekendSurchargePct: number;
  insurancePerDayGbp: number;
  congestionChargePerDayGbp: number;
  parkingSuspensionFeeGbp: number;
  moverHourlyRateGbp: number;
  blanketsFlatFeeGbp: number;
  boxUnitPriceGbp: number;
}

export const DEFAULT_MOVE_CONFIG: MoveConfig = {
  fromPostcode: 'SW7 2AZ',
  toPostcode: 'E2 8AA',
  distanceMiles: 6.4,
  distanceSource: 'postcodes.io',
  isWeekend: false,
  fromFloor: 1,
  fromHasLift: true,
  toFloor: 1,
  toHasLift: true,
  helpers: 'friends',
  inCongestionZone: false,
  congestionAutoSuggested: true,
  parkingSuspension: false,
  needBlanketsAndStraps: true,
  needBoxesCount: 0,
  allowSpecialLicence: false,
  dieselPricePerLitreGbp: 1.45,
  weekendSurchargePct: 15,
  insurancePerDayGbp: 15,
  congestionChargePerDayGbp: 15,
  parkingSuspensionFeeGbp: 40,
  moverHourlyRateGbp: 30,
  blanketsFlatFeeGbp: 10,
  boxUnitPriceGbp: 2,
};

export interface CostReceiptLine {
  id: string;
  label: string;
  amountGbp: number;
  formulaText: string;
}

export interface VanCostBreakdown {
  vanId: string;
  vanLabel: string;
  vanName: string;
  dayRateGbp: number;
  mpg: number;
  fitsSingleTrip: boolean;
  hasOversizeItemThatNeverFits: boolean;
  oversizeReasons: string[];
  tripsNeeded: number;
  daysNeeded: number;
  drivingMiles: number;
  loadingMinutes: number;
  drivingMinutes: number;
  unloadingMinutes: number;
  totalMinutes: number;
  totalHours: number;
  formattedDuration: string;
  hireCostGbp: number;
  fuelCostGbp: number;
  insuranceCostGbp: number;
  congestionCostGbp: number;
  parkingCostGbp: number;
  moversCostGbp: number;
  extrasCostGbp: number;
  totalCostGbp: number;
  receiptLines: CostReceiptLine[];
  tripFormulaExplanation: string;
}

/**
 * Checks whether a UK postcode is likely inside or entering the central London Congestion Charge zone.
 * Matches EC, WC, or central W1 / SW1 / SE1 / E1 / N1 / NW1 prefixes.
 */
export function isCentralLondonCongestionPostcode(postcode: string): boolean {
  const clean = postcode.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) return false;
  if (clean.startsWith('EC') || clean.startsWith('WC')) return true;
  const outwardMatch = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  const outward = outwardMatch ? outwardMatch[1] : clean;
  const centralOutwards = new Set([
    'W1',
    'W1A',
    'W1B',
    'W1C',
    'W1D',
    'W1F',
    'W1G',
    'W1H',
    'W1J',
    'W1K',
    'W1S',
    'W1T',
    'W1U',
    'W1W',
    'SW1',
    'SW1A',
    'SW1E',
    'SW1H',
    'SW1P',
    'SW1V',
    'SW1W',
    'SW1X',
    'SW1Y',
    'SE1',
    'E1',
    'N1',
    'NW1',
  ]);
  if (centralOutwards.has(outward)) return true;
  for (const prefix of ['W1', 'SW1', 'SE1', 'E1', 'N1', 'NW1']) {
    if (outward === prefix || (outward.startsWith(prefix) && isNaN(Number(outward[prefix.length])))) {
      return true;
    }
  }
  return false;
}

/**
 * Computes straight-line Haversine distance in miles between two lat/lon coordinates,
 * multiplied by 1.3 road factor.
 */
export function calculateRoadMilesFromLatLon(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { straightLineMiles: number; roadMiles: number } {
  const R_KM = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R_KM * c;
  const straightLineMiles = straightKm * 0.621371;
  const roadMiles = Math.max(0.8, Math.round(straightLineMiles * 1.3 * 10) / 10);
  return {
    straightLineMiles: Math.round(straightLineMiles * 10) / 10,
    roadMiles,
  };
}

/**
 * Queries free UK postcodes.io API for two postcodes and returns driving distance in miles (straight-line × 1.3).
 */
export async function lookupPostcodeDistanceMiles(
  fromPostcode: string,
  toPostcode: string
): Promise<{
  success: boolean;
  roadMiles?: number;
  straightLineMiles?: number;
  fromCoords?: { lat: number; lon: number };
  toCoords?: { lat: number; lon: number };
  error?: string;
}> {
  const cleanFrom = encodeURIComponent(fromPostcode.trim());
  const cleanTo = encodeURIComponent(toPostcode.trim());
  if (!cleanFrom || !cleanTo) {
    return { success: false, error: 'Enter both UK postcodes.' };
  }

  try {
    const [resFrom, resTo] = await Promise.all([
      fetch(`https://api.postcodes.io/postcodes/${cleanFrom}`),
      fetch(`https://api.postcodes.io/postcodes/${cleanTo}`),
    ]);

    if (!resFrom.ok || !resTo.ok) {
      return {
        success: false,
        error: 'Postcode not found on postcodes.io — you can type the miles below.',
      };
    }

    const dataFrom = await resFrom.json();
    const dataTo = await resTo.json();

    const lat1 = dataFrom?.result?.latitude;
    const lon1 = dataFrom?.result?.longitude;
    const lat2 = dataTo?.result?.latitude;
    const lon2 = dataTo?.result?.longitude;

    if (
      typeof lat1 !== 'number' ||
      typeof lon1 !== 'number' ||
      typeof lat2 !== 'number' ||
      typeof lon2 !== 'number'
    ) {
      return {
        success: false,
        error: 'Incomplete lat/long from postcodes.io — please enter miles manually.',
      };
    }

    const { straightLineMiles, roadMiles } = calculateRoadMilesFromLatLon(lat1, lon1, lat2, lon2);
    return {
      success: true,
      roadMiles,
      straightLineMiles,
      fromCoords: { lat: lat1, lon: lon1 },
      toCoords: { lat: lat2, lon: lon2 },
    };
  } catch {
    return {
      success: false,
      error: 'Could not reach postcodes.io — please type your distance in miles.',
    };
  }
}

/**
 * Converts leftover PlacedItems back into InventoryItems so the packer can re-run on leftovers
 * to confirm multi-trip count.
 */
function leftoversToInventoryItems(leftovers: PlacedItem[]): InventoryItem[] {
  return leftovers.map((p, idx) => ({
    id: `leftover-repack-${idx}-${p.instanceId}`,
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
    reasoning_short: 'Repacking leftover item for trip calculation',
  }));
}

/**
 * Formats minutes as "~Xh Ym" (e.g. "~4h 20m").
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const rounded = Math.max(15, Math.round(totalMinutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `~${mins}m`;
  if (mins === 0) return `~${hours}h`;
  return `~${hours}h ${mins}m`;
}

/**
 * Deterministically computes the exact total move cost for a specific van.
 * Every number and formula comes strictly from TypeScript code.
 */
export function calculateVanTotalCost(
  van: VanPreset,
  proof: VerificationProof,
  inventory: InventoryItem[],
  move: MoveConfig
): VanCostBreakdown {
  // 1. Total cargo volume and packing efficiency
  const totalCargoVolumeM3 = inventory.reduce(
    (sum, it) => sum + ((it.width_cm * it.depth_cm * it.height_cm) / 1_000_000) * it.quantity,
    0
  );
  const vanVolumeM3 = Math.max(0.1, (van.length_cm * van.width_cm * van.height_cm) / 1_000_000);
  const PACKING_EFFICIENCY = 0.65;

  // Volume-based trip estimate: ceil(total volume ÷ (van volume × packing efficiency))
  const volumeTrips = Math.max(
    1,
    Math.ceil(totalCargoVolumeM3 / (vanVolumeM3 * PACKING_EFFICIENCY))
  );

  // Confirm trips by re-running the packer on leftovers
  let packerTrips = 1;
  let hasOversizeItemThatNeverFits = false;
  const oversizeReasons: string[] = [];

  if (!proof.fitsAll && proof.leftoverItems.length > 0) {
    let remainingLeftovers = [...proof.leftoverItems];
    let safetyCounter = 0;

    while (remainingLeftovers.length > 0 && safetyCounter < 8) {
      safetyCounter++;
      const nextInventory = leftoversToInventoryItems(remainingLeftovers);
      const repackResult = packVan(van, nextInventory);

      if (repackResult.placedItems.length === 0) {
        // Remaining items are physically larger than the van's cargo bay even when empty
        hasOversizeItemThatNeverFits = true;
        for (const unplaceable of remainingLeftovers.slice(0, 2)) {
          oversizeReasons.push(
            `${unplaceable.name} (${unplaceable.original_w_cm}×${unplaceable.original_d_cm}×${unplaceable.original_h_cm}cm) exceeds ${van.label} cargo bay (${van.length_cm}×${van.width_cm}×${van.height_cm}cm)`
          );
        }
        packerTrips += 1;
        break;
      }

      packerTrips += 1;
      remainingLeftovers = repackResult.leftoverItems;
    }
  }

  const tripsNeeded = proof.fitsAll ? 1 : Math.max(2, volumeTrips, packerTrips);

  const tripFormulaExplanation = proof.fitsAll
    ? `1 trip (100% of items verified to fit inside ${van.label} in 1 load)`
    : `ceil(${totalCargoVolumeM3.toFixed(2)}m³ ÷ (${vanVolumeM3.toFixed(2)}m³ × 0.65 efficiency)) = ${volumeTrips}, confirmed by re-running packer on ${proof.leftoverItems.length} leftover(s) → ${tripsNeeded} trips${
        hasOversizeItemThatNeverFits
          ? ` (Note: ${oversizeReasons[0] || 'contains oversize item'})`
          : ''
      }`;

  // 2. Driving miles = (trips × 2 − 1) × move distance + 10 miles to collect and return the van
  const moveDistance = Math.max(0.5, Number(move.distanceMiles) || 5);
  const drivingMiles =
    Math.round(((tripsNeeded * 2 - 1) * moveDistance + 10) * 10) / 10;

  // 3. Fuel = miles ÷ mpg × 4.546 litres × diesel price (default £1.45/L)
  const mpg = van.mpg || 30;
  const litresUsed = (drivingMiles / mpg) * 4.546;
  const fuelCostGbp = Math.round(litresUsed * move.dieselPricePerLitreGbp);

  // 4. Labour time = loading + driving + unloading
  // Loading minutes = Σ per item (box 1.5 min, furniture 5 min, heavy appliance 8 min) × stairs factor (no lift: +25% per floor)
  let baseItemMinutes = 0;
  for (const item of inventory) {
    const qty = Math.max(1, item.quantity);
    let minsPerPiece = 5; // default furniture / electronics
    if (item.category === 'Boxes' || item.category === 'Luggage' || item.category === 'Misc') {
      minsPerPiece = 1.5;
    } else if (item.category === 'Appliances' || item.weight_kg >= 40) {
      minsPerPiece = 8;
    }
    baseItemMinutes += minsPerPiece * qty;
  }

  const fromStairsFactor = move.fromHasLift ? 1 : 1 + 0.25 * move.fromFloor;
  const toStairsFactor = move.toHasLift ? 1 : 1 + 0.25 * move.toFloor;

  // Each extra trip beyond 1 adds 20 min of re-securing/turnaround at pickup and drop-off
  const extraTripTurnaroundMins = (tripsNeeded - 1) * 20;
  const loadingMinutes = Math.round(baseItemMinutes * fromStairsFactor + extraTripTurnaroundMins);
  const unloadingMinutes = Math.round(baseItemMinutes * toStairsFactor + extraTripTurnaroundMins);
  // Driving time at 18 mph average in London
  const drivingMinutes = Math.round((drivingMiles / 18) * 60);

  const totalMinutes = loadingMinutes + drivingMinutes + unloadingMinutes;
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const formattedDuration = formatDurationMinutes(totalMinutes);

  // 5. Hire = day rate × days (1 day; 2 days if estimated total time > 9 hours; +0.9x day rate per extra trip beyond 1) + weekend surcharge (+15%)
  const daysNeeded = totalHours > 9 ? 2 : 1;
  const effectiveHireUnits = Math.max(daysNeeded, 1 + (tripsNeeded - 1) * 0.9);
  const weekendMultiplier = move.isWeekend ? 1 + move.weekendSurchargePct / 100 : 1;
  const hireCostGbp = Math.round(van.price_gbp * effectiveHireUnits * weekendMultiplier);

  // 6. Insurance / excess waiver: £15/day (editable)
  const insuranceCostGbp = Math.round(move.insurancePerDayGbp * daysNeeded);

  // 7. Congestion Charge: £15/day if ticked
  const congestionCostGbp = move.inCongestionZone
    ? Math.round(move.congestionChargePerDayGbp * daysNeeded)
    : 0;

  // 8. Parking: £0 or council parking suspension £40 (toggle)
  const parkingCostGbp = move.parkingSuspension ? Math.round(move.parkingSuspensionFeeGbp) : 0;

  // 9. Hired movers: 2 × £30/hour × labour hours (if 'movers' selected)
  const moversCostGbp =
    move.helpers === 'movers'
      ? Math.round(2 * move.moverHourlyRateGbp * totalHours)
      : 0;

  // 10. Optional extras: blankets/straps £10, boxes £2 each
  const blanketsCost = move.needBlanketsAndStraps ? move.blanketsFlatFeeGbp : 0;
  const boxesCost = Math.max(0, Math.round(move.needBoxesCount)) * move.boxUnitPriceGbp;
  const extrasCostGbp = Math.round(blanketsCost + boxesCost);

  const totalCostGbp =
    hireCostGbp +
    fuelCostGbp +
    insuranceCostGbp +
    congestionCostGbp +
    parkingCostGbp +
    moversCostGbp +
    extrasCostGbp;

  const receiptLines: CostReceiptLine[] = [
    {
      id: 'hire',
      label: `Van hire (${van.label}, ${
        tripsNeeded > 1 ? `${tripsNeeded} trips` : `${daysNeeded} day${daysNeeded > 1 ? 's' : ''}`
      }${move.isWeekend ? ` +${move.weekendSurchargePct}% wknd` : ''})`,
      amountGbp: hireCostGbp,
      formulaText: `£${van.price_gbp}/day × ${effectiveHireUnits.toFixed(1)} (${
        tripsNeeded > 1 ? `${tripsNeeded}-trip slot` : `${daysNeeded} day`
      })${
        move.isWeekend ? ` × ${(1 + move.weekendSurchargePct / 100).toFixed(2)} weekend` : ''
      } = £${hireCostGbp}`,
    },
    {
      id: 'fuel',
      label: `Diesel fuel (${drivingMiles} mi @ ${mpg} mpg)`,
      amountGbp: fuelCostGbp,
      formulaText: `(${tripsNeeded}×2−1)×${moveDistance}mi + 10mi depot = ${drivingMiles}mi ÷ ${mpg}mpg × 4.546L × £${move.dieselPricePerLitreGbp.toFixed(
        2
      )}/L = £${fuelCostGbp}`,
    },
    {
      id: 'insurance',
      label: `Insurance / excess waiver (${daysNeeded} day${daysNeeded > 1 ? 's' : ''})`,
      amountGbp: insuranceCostGbp,
      formulaText: `£${move.insurancePerDayGbp}/day × ${daysNeeded} day(s) = £${insuranceCostGbp}`,
    },
    {
      id: 'congestion',
      label: `London Congestion Charge (check current TfL rate)`,
      amountGbp: congestionCostGbp,
      formulaText: move.inCongestionZone
        ? `£${move.congestionChargePerDayGbp}/day × ${daysNeeded} day(s) = £${congestionCostGbp}`
        : `Not entering Congestion Charge zone = £0`,
    },
    {
      id: 'parking',
      label: `Council parking bay suspension`,
      amountGbp: parkingCostGbp,
      formulaText: move.parkingSuspension
        ? `Council bay suspension permit = £${parkingCostGbp}`
        : `Standard kerbs / driveway parking = £0`,
    },
    {
      id: 'movers',
      label:
        move.helpers === 'movers'
          ? `Hired 2 movers (${totalHours.toFixed(1)}h labour)`
          : `Helpers (${move.helpers === 'friends' ? 'You + friends' : 'Just you'})`,
      amountGbp: moversCostGbp,
      formulaText:
        move.helpers === 'movers'
          ? `2 movers × £${move.moverHourlyRateGbp}/hr × ${totalHours.toFixed(2)}h (${loadingMinutes}m load + ${drivingMinutes}m drive + ${unloadingMinutes}m unload) = £${moversCostGbp}`
          : `Self-load (${loadingMinutes}m load + ${drivingMinutes}m drive + ${unloadingMinutes}m unload = ${formattedDuration}) = £0`,
    },
    {
      id: 'extras',
      label: `Packing extras (${move.needBlanketsAndStraps ? 'blankets/straps' : 'no straps'}${
        move.needBoxesCount > 0 ? ` + ${move.needBoxesCount} boxes` : ''
      })`,
      amountGbp: extrasCostGbp,
      formulaText: `£${blanketsCost} blankets/straps + (${move.needBoxesCount} boxes × £${move.boxUnitPriceGbp}) = £${extrasCostGbp}`,
    },
  ];

  return {
    vanId: van.id,
    vanLabel: van.label,
    vanName: van.name,
    dayRateGbp: van.price_gbp,
    mpg,
    fitsSingleTrip: proof.fitsAll,
    hasOversizeItemThatNeverFits,
    oversizeReasons,
    tripsNeeded,
    daysNeeded,
    drivingMiles,
    loadingMinutes,
    drivingMinutes,
    unloadingMinutes,
    totalMinutes,
    totalHours,
    formattedDuration,
    hireCostGbp,
    fuelCostGbp,
    insuranceCostGbp,
    congestionCostGbp,
    parkingCostGbp,
    moversCostGbp,
    extrasCostGbp,
    totalCostGbp,
    receiptLines,
    tripFormulaExplanation,
  };
}
