/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VanPreset, PlacedItem } from '../types';

/**
 * Standard UK removal van fleet (10 options, from tiny micro van to 18-tonne lorry).
 * Keeps the 4 original presets (Small, Medium, Large, Luton) at their exact dimensions and prices.
 */
export const DEFAULT_VANS: VanPreset[] = [
  {
    id: 'micro',
    name: 'Car-Derived Micro Van (Berlingo)',
    label: 'Micro Van',
    length_cm: 150,
    width_cm: 120,
    height_cm: 110,
    max_payload_kg: 500,
    price_gbp: 40,
    mpg: 45,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Citroën Berlingo / Peugeot Partner. Ultra-compact for a few student boxes and suitcases.',
  },
  {
    id: 'small',
    name: 'Small Van (SWB)',
    label: 'Small Van',
    length_cm: 180,
    width_cm: 150,
    height_cm: 120,
    max_payload_kg: 700,
    price_gbp: 50,
    mpg: 40,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Ford Transit Connect / VW Caddy Maxi SWB. Ideal for small room boxes and luggage.',
  },
  {
    id: 'medium',
    name: 'Medium Van (MWB)',
    label: 'Medium Van',
    length_cm: 255,
    width_cm: 175,
    height_cm: 140,
    max_payload_kg: 1000,
    price_gbp: 65,
    mpg: 35,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Ford Transit Custom / Vauxhall Vivaro. Ideal for studio moves with a single bed and desk.',
  },
  {
    id: 'lwb_medium',
    name: 'Long-Wheelbase Medium (Transit LWB)',
    label: 'LWB Medium Van',
    length_cm: 300,
    width_cm: 175,
    height_cm: 170,
    max_payload_kg: 1100,
    price_gbp: 72,
    mpg: 32,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Ford Transit LWB Medium Roof. Extra floor length and standing headroom for larger studios.',
  },
  {
    id: 'large',
    name: 'Large Van (LWB High Top)',
    label: 'Large Van',
    length_cm: 340,
    width_cm: 178,
    height_cm: 190,
    max_payload_kg: 1300,
    price_gbp: 80,
    mpg: 30,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Mercedes Sprinter / Transit LWB High Roof. Generous 3.4m floor for compact 1-bed flats.',
  },
  {
    id: 'xlwb',
    name: 'Extra-Long High-Roof (Sprinter XLWB)',
    label: 'Sprinter XLWB',
    length_cm: 430,
    width_cm: 178,
    height_cm: 190,
    max_payload_kg: 1200,
    price_gbp: 90,
    mpg: 28,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Mercedes Sprinter XLWB. 4.3m load bay for long sofas, though ceiling is 190cm.',
  },
  {
    id: 'luton',
    name: 'Luton Van with Tail Lift',
    label: 'Luton Van',
    length_cm: 400,
    width_cm: 200,
    height_cm: 220,
    max_payload_kg: 1000,
    price_gbp: 95,
    mpg: 24,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Full square box body (220cm tall) with tail lift. Best for 1–2 bed flats with tall wardrobes/bookshelves.',
  },
  {
    id: 'luton_xl',
    name: 'Luton XL Box Van',
    label: 'Luton XL',
    length_cm: 450,
    width_cm: 210,
    height_cm: 230,
    max_payload_kg: 1000,
    price_gbp: 110,
    mpg: 22,
    licenceType: 'car',
    licenceLabel: 'Car licence (Cat B)',
    requiresSpecialLicence: false,
    description: 'Extended 4.5m Luton box body with high 230cm ceiling. Fits 2-bed house shares.',
  },
  {
    id: 'truck_75t',
    name: '7.5-Tonne Box Truck',
    label: '7.5t Truck',
    length_cm: 600,
    width_cm: 240,
    height_cm: 240,
    max_payload_kg: 2500,
    price_gbp: 160,
    mpg: 15,
    licenceType: 'c1',
    licenceLabel: '⚠ Needs a C1 licence',
    requiresSpecialLicence: true,
    description: 'DAF LF / Iveco Eurocargo 7.5t. Huge 34.5m³ box and 2,500kg payload for multi-bedroom homes.',
  },
  {
    id: 'lorry_18t',
    name: '18-Tonne Removal Lorry',
    label: '18t Removal Lorry',
    length_cm: 750,
    width_cm: 245,
    height_cm: 260,
    max_payload_kg: 8000,
    price_gbp: 280,
    mpg: 10,
    licenceType: 'c',
    licenceLabel: '⚠ Needs a C licence + professional driver',
    requiresSpecialLicence: true,
    description: 'Commercial pantechnicon removal lorry (47.8m³, 8,000kg payload) for full family house moves.',
  },
];

const LOCAL_STORAGE_KEY = 'vanpack3d_vans_presets_v2';

/**
 * Loads current van presets from localStorage or returns the 10 default UK presets.
 */
export function loadVanPresets(): VanPreset[] {
  if (typeof window === 'undefined') {
    return DEFAULT_VANS;
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return DEFAULT_VANS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === DEFAULT_VANS.length) {
      return parsed;
    }
  } catch {
    // Fall back to defaults on corrupt storage
  }
  return DEFAULT_VANS;
}

/**
 * Saves customized van presets to localStorage.
 */
export function saveVanPresets(vans: VanPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vans));
  } catch (err) {
    console.warn('Could not save van presets to localStorage:', err);
  }
}

/**
 * Resets van presets to factory defaults.
 */
export function resetVanPresetsToDefault(): VanPreset[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
  return [...DEFAULT_VANS];
}

/**
 * Calculates internal cargo volume in cubic metres (m³).
 */
export function calculateVanVolumeM3(van: VanPreset): number {
  const volumeM3 = (van.length_cm * van.width_cm * van.height_cm) / 1_000_000;
  return Math.round(volumeM3 * 100) / 100;
}

/**
 * Computes day-rate price difference saved between chosen van and the Luton Van (£95).
 */
export function calculatePriceSavings(chosenVan: VanPreset | null, allVans: VanPreset[]): number {
  if (!chosenVan) return 0;
  const luton = allVans.find((v) => v.id === 'luton') || allVans[allVans.length - 1];
  const diff = luton.price_gbp - chosenVan.price_gbp;
  return Math.max(0, diff);
}

/**
 * Generates a plain-English reason why a leftover item could not fit inside a given van.
 * Example: "Tall Bookshelf 200cm is taller than the Large Van's 190cm height"
 */
export function getLeftoverReason(item: PlacedItem, van: VanPreset): string {
  const w = item.original_w_cm || item.w_cm;
  const d = item.original_d_cm || item.d_cm;
  const h = item.original_h_cm || item.h_cm;

  if (item.orientationLabel.toLowerCase().includes('payload')) {
    return `${item.name} (${item.weight_kg}kg) exceeds the ${van.label}'s ${van.max_payload_kg}kg payload limit`;
  }

  const maxItemDim = Math.max(w, d, h);
  const maxVanDim = Math.max(van.length_cm, van.width_cm, van.height_cm);

  if (h > van.height_cm && (h === maxItemDim || !item.can_stack_on_top)) {
    if (h > maxVanDim) {
      return `${item.name} ${h}cm is taller than the ${van.label}'s ${van.height_cm}cm height (and ${van.length_cm}cm floor)`;
    }
    return `${item.name} ${h}cm is taller than the ${van.label}'s ${van.height_cm}cm height`;
  }

  if (maxItemDim > van.length_cm) {
    return `${item.name} ${maxItemDim}cm is longer than the ${van.label}'s ${van.length_cm}cm floor`;
  }

  if (w > van.width_cm && d > van.width_cm) {
    return `${item.name} (${w}×${d}cm) is wider than the ${van.label}'s ${van.width_cm}cm width`;
  }

  return `${item.name} (${w}×${d}×${h}cm) has no remaining floor or ≥70% supported stacking space in the ${van.label}`;
}
