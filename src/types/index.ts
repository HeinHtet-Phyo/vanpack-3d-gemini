/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Categories of items recognized in VanPack 3D
 */
export type ItemCategory =
  | 'Furniture'
  | 'Boxes'
  | 'Appliances'
  | 'Electronics'
  | 'Luggage'
  | 'Misc';

/**
 * Inventory item represented in the user-editable item cards
 */
export interface InventoryItem {
  /** Unique identifier */
  id: string;
  /** Display name of the item (e.g. "Double Mattress", "Medium Box") */
  name: string;
  /** Broad item category */
  category: ItemCategory;
  /** Number of identical physical items */
  quantity: number;
  /** Width in centimetres (X axis when unrotated) */
  width_cm: number;
  /** Depth in centimetres (Z axis when unrotated) */
  depth_cm: number;
  /** Height in centimetres (Y axis when unrotated) */
  height_cm: number;
  /** Approximate unit weight in kilograms */
  weight_kg: number;
  /** If true, item is fragile and must never have heavy items placed on top */
  fragile: boolean;
  /** If true, other items can safely be stacked on top of this item */
  can_stack_on_top: boolean;
  /** If true, the item can be turned sideways / rotated during packing */
  can_rotate: boolean;
  /** AI detection confidence score (0.0 to 1.0) */
  confidence: number;
  /** Brief reasoning or measurement reference note */
  reasoning_short?: string;
  /** Optional base64 data URL thumbnail of the uploaded photo this item was detected in */
  photoThumbnail?: string;
  /** Source of the item ('demo' | 'photo' | 'manual') */
  source?: 'demo' | 'photo' | 'manual';
  /** True if this item was merged from duplicate detections across multiple photos */
  mergedDuplicate?: boolean;
  /** Normalized 2D bounding box [ymin, xmin, ymax, xmax] in 0..1000 coordinates from Gemini vision */
  box_2d?: [number, number, number, number];
}

export type VanLicenceType = 'car' | 'c1' | 'c';

/**
 * Standard UK removal van specification (10 options from micro van to 18t lorry)
 */
export interface VanPreset {
  /** Identifier key (e.g. 'micro', 'small', 'medium', 'lwb_medium', 'large', 'xlwb', 'luton', 'luton_xl', 'truck_75t', 'lorry_18t') */
  id: string;
  /** Display name (e.g. "Small Van (SWB)") */
  name: string;
  /** Short summary label */
  label: string;
  /** Internal cargo floor length in cm (X axis) */
  length_cm: number;
  /** Internal cargo width in cm (Z axis) */
  width_cm: number;
  /** Internal cargo ceiling height in cm (Y axis) */
  height_cm: number;
  /** Maximum legal cargo payload in kg */
  max_payload_kg: number;
  /** Example rental price per day in GBP (£) */
  price_gbp: number;
  /** Typical fuel economy in miles per imperial gallon (mpg) */
  mpg?: number;
  /** Required driving licence category ('car' | 'c1' | 'c') */
  licenceType?: VanLicenceType;
  /** Human-readable licence label */
  licenceLabel?: string;
  /** True if this vehicle requires a C1 or C licence / professional driver */
  requiresSpecialLicence?: boolean;
  /** Descriptive vehicle examples (e.g. Ford Transit Custom) */
  description: string;
}

/**
 * Individual physical item placed inside a van by the 3D packing engine
 */
export interface PlacedItem {
  /** Unique ID for this specific physical box / instance */
  instanceId: string;
  /** Parent InventoryItem id */
  itemId: string;
  /** Name of item */
  name: string;
  /** Category */
  category: ItemCategory;
  /** Sequential loading step (1-indexed order) */
  stepOrder: number;
  /** Coordinate X (cm) - distance from cab bulkhead along van length */
  x_cm: number;
  /** Coordinate Y (cm) - height above van cargo floor */
  y_cm: number;
  /** Coordinate Z (cm) - distance from left wall along van width */
  z_cm: number;
  /** Placed bounding box width in cm along X */
  w_cm: number;
  /** Placed bounding box depth in cm along Z */
  d_cm: number;
  /** Placed bounding box height in cm along Y */
  h_cm: number;
  /** Original unrotated dimensions */
  original_w_cm: number;
  /** Original unrotated dimensions */
  original_d_cm: number;
  /** Original unrotated dimensions */
  original_h_cm: number;
  /** Rotation description (e.g. "Default", "Yaw 90°", "On-edge upright") */
  orientationLabel: string;
  /** Weight in kg */
  weight_kg: number;
  /** Fragile flag */
  fragile: boolean;
  /** Stackable flag */
  can_stack_on_top: boolean;
  /** Calculated base support percentage (0 to 1.0) */
  supportRatio: number;
  /** If true, could not fit inside this van and is an unplaced leftover */
  isLeftover?: boolean;
}

/**
 * Individual verification invariant check result
 */
export interface VerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  explanation: string;
  critical: boolean;
}

/**
 * Independent verification suite output for a specific van
 */
export interface VerificationProof {
  vanId: string;
  vanName: string;
  /** True if and only if all 6 checks passed */
  fitsAll: boolean;
  /** Total weight of all items attempted or placed */
  totalWeightKg: number;
  /** Van payload limit */
  maxPayloadKg: number;
  /** Total volume of packed items in cubic metres */
  usedVolumeM3: number;
  /** Van internal cargo volume in cubic metres */
  vanVolumeM3: number;
  /** Percentage of van volume utilized */
  volumeUsedPct: number;
  /** List of 6 explicit mathematical checks */
  checks: VerificationCheck[];
  /** Items successfully placed */
  placedItems: PlacedItem[];
  /** Items that could not fit or were rejected */
  leftoverItems: PlacedItem[];
  /** Detailed error or warning messages */
  failureReasons: string[];
}

/**
 * Complete packing result across all vans
 */
export interface MultiVanPackingResult {
  /** Map of van ID to its verification proof */
  vanProofs: Record<string, VerificationProof>;
  /** ID of smallest, cheapest van where fitsAll is true (null if none fit) */
  recommendedVanId: string | null;
  /** Money saved in GBP compared to largest Luton van */
  savingsGbp: number;
}

/**
 * Doorway measurement spec for the "Will it fit through the door?" checker
 */
export interface DoorwaySpec {
  width_cm: number;
  height_cm: number;
}

/**
 * Doorway fit evaluation for an item
 */
export interface DoorFitResult {
  itemId: string;
  name: string;
  category: ItemCategory;
  fits: boolean;
  smallestCrossSection: {
    w: number;
    h: number;
  };
  doorWidth: number;
  doorHeight: number;
  marginCm: number;
}
