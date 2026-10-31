/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GEMINI_CONFIG, logGeminiTelemetry } from '../config/gemini';
import { InventoryItem, ItemCategory } from '../types';

export type PhotoStatus = 'idle' | 'measuring' | 'done' | 'error';

/**
 * Represents a user-uploaded or camera-captured photo ready for Gemini analysis
 */
export interface UploadedPhoto {
  id: string;
  name: string;
  mimeType: string;
  /** Raw base64 payload without the data:image/...;base64, prefix */
  base64Data: string;
  /** Compact data URL for displaying thumbnails in the upload queue and review table */
  thumbnailUrl: string;
  /** Per-photo measurement status */
  status?: PhotoStatus;
  /** Items detected specifically from this photo */
  detectedItems?: InventoryItem[];
  /** Error message if measuring this photo failed */
  errorMsg?: string;
}

/**
 * Result of deterministic sanity validation on an item's dimensions and weight
 */
export interface ItemSanityValidation {
  isValid: boolean;
  errors: string[];
}

const VALID_CATEGORIES: ItemCategory[] = [
  'Furniture',
  'Boxes',
  'Appliances',
  'Electronics',
  'Luggage',
  'Misc',
];

/**
 * Deterministic sanity check in code for item dimensions and weights.
 * Rejects impossible sizes (any dimension < 5 cm or > 300 cm, or weight > 200 kg or <= 0 kg)
 * so they are flagged in red in the Review table for the user to fix before packing.
 *
 * @param item - Inventory item to validate
 * @returns ItemSanityValidation with isValid boolean and human-readable error strings
 */
export function validateItemSanity(item: InventoryItem): ItemSanityValidation {
  const errors: string[] = [];

  const { width_cm: w, depth_cm: d, height_cm: h, weight_kg: weight } = item;

  if (!Number.isFinite(w) || w < 5 || w > 300) {
    errors.push(`Width (${w}cm) must be between 5cm and 300cm`);
  }
  if (!Number.isFinite(d) || d < 5 || d > 300) {
    errors.push(`Depth (${d}cm) must be between 5cm and 300cm`);
  }
  if (!Number.isFinite(h) || h < 5 || h > 300) {
    errors.push(`Height (${h}cm) must be between 5cm and 300cm`);
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 200) {
    errors.push(`Weight (${weight}kg) must be between 1kg and 200kg`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes a model-returned category string into a valid ItemCategory.
 *
 * @param raw - Category string from Gemini
 * @returns Valid ItemCategory
 */
function normalizeCategory(raw: string): ItemCategory {
  const found = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === String(raw || '').trim().toLowerCase()
  );
  return found || 'Misc';
}

/**
 * Validates that a raw JSON object returned by Gemini conforms to the expected item schema.
 *
 * @param raw - Raw item object from Gemini JSON output
 * @returns True if structurally valid
 */
export function isValidGeminiRawItem(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return false;
  if (!Number.isFinite(Number(raw.width_cm)) || Number(raw.width_cm) <= 0) return false;
  if (!Number.isFinite(Number(raw.depth_cm)) || Number(raw.depth_cm) <= 0) return false;
  if (!Number.isFinite(Number(raw.height_cm)) || Number(raw.height_cm) <= 0) return false;
  if (!Number.isFinite(Number(raw.weight_kg)) || Number(raw.weight_kg) <= 0) return false;
  return true;
}

/**
 * Normalizes an item name for duplicate comparison across multiple photos.
 */
function normalizeItemNameForMerge(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(uk|standard|the|a|an|large|medium|small|flat|packed|fabric|wooden|wood|leather|cardboard|removal|moving)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two items from different photos represent the same physical object
 * (same normalized name and dimensions within 22% tolerance).
 */
function areItemsDuplicateAcrossPhotos(a: InventoryItem, b: InventoryItem): boolean {
  const normA = normalizeItemNameForMerge(a.name);
  const normB = normalizeItemNameForMerge(b.name);
  const sameName =
    normA === normB ||
    (normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA)));
  if (!sameName) return false;

  const dimsA = [a.width_cm, a.depth_cm, a.height_cm].sort((x, y) => x - y);
  const dimsB = [b.width_cm, b.depth_cm, b.height_cm].sort((x, y) => x - y);

  for (let i = 0; i < 3; i++) {
    const avg = Math.max(1, (dimsA[i] + dimsB[i]) / 2);
    if (Math.abs(dimsA[i] - dimsB[i]) / avg > 0.22) {
      return false;
    }
  }
  return true;
}

/**
 * Merges incoming photo-detected items into an existing inventory list.
 * If the same object appears in two photos (same name + similar size), merges it
 * instead of duplicating and sets `mergedDuplicate: true`.
 *
 * @param existing - Existing inventory items
 * @param incoming - Newly detected items from a photo
 * @returns Merged inventory list and count of merged duplicates
 */
export function mergeDuplicateItems(
  existing: InventoryItem[],
  incoming: InventoryItem[]
): { mergedList: InventoryItem[]; mergedCount: number } {
  const result = existing.map((it) => ({ ...it }));
  let mergedCount = 0;

  for (const newItem of incoming) {
    const matchIdx = result.findIndex(
      (ex) => ex.source === 'photo' && areItemsDuplicateAcrossPhotos(ex, newItem)
    );

    if (matchIdx !== -1) {
      const target = result[matchIdx];
      const baseReasoning = target.reasoning_short || 'Estimated from photo';
      result[matchIdx] = {
        ...target,
        mergedDuplicate: true,
        confidence: Math.max(target.confidence, newItem.confidence),
        reasoning_short: baseReasoning.includes('Merged duplicate')
          ? baseReasoning
          : `${baseReasoning} · Merged duplicate across photos`,
      };
      mergedCount++;
    } else {
      result.push(newItem);
    }
  }

  return { mergedList: result, mergedCount };
}

/**
 * Sends a SINGLE photo to the server-side Gemini 4 Argon endpoint (/api/gemini/detect-items).
 * Rate-limited to one request per photo. Validates Gemini's JSON in code; if malformed, retries once.
 * Also retries up to 3 times with exponential backoff on 503/429 errors.
 *
 * @param photo - Single UploadedPhoto object
 * @param onRetryStatus - Optional callback invoked when a retry attempt starts
 * @returns Array of validated InventoryItem objects detected in this photo
 */
export async function detectItemsFromSinglePhoto(
  photo: UploadedPhoto,
  onRetryStatus?: (attempt: number, maxRetries: number) => void
): Promise<InventoryItem[]> {
  const requestBody = {
    images: [
      {
        mimeType: photo.mimeType,
        data: photo.base64Data,
      },
    ],
  };

  let attempt = 0;
  let malformedRetried = false;
  const maxRetries = GEMINI_CONFIG.MAX_RETRIES;

  while (attempt < maxRetries) {
    try {
      attempt++;
      if (attempt > 1 && onRetryStatus) {
        onRetryStatus(attempt, maxRetries);
      }

      const response = await fetch(GEMINI_CONFIG.ENDPOINTS.DETECT_ITEMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.success) {
        const status = response.status;
        const errMsg =
          data?.error || `Gemini photo detection failed (HTTP ${status})`;
        const isTransient =
          status === 429 ||
          status === 503 ||
          errMsg.includes('429') ||
          errMsg.includes('503') ||
          errMsg.toLowerCase().includes('overloaded') ||
          errMsg.toLowerCase().includes('exhausted');

        logGeminiTelemetry(
          `Single Photo Detection (${photo.name}) Attempt ${attempt} Failed`,
          { photoName: photo.name, model: GEMINI_CONFIG.MODEL_NAME },
          { status, error: errMsg }
        );

        if (attempt < maxRetries && isTransient) {
          const delay = GEMINI_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(errMsg);
      }

      // Validate Gemini JSON structure in code; if malformed, retry once
      if (!Array.isArray(data.items)) {
        if (!malformedRetried) {
          malformedRetried = true;
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        throw new Error('Gemini returned malformed JSON. Falling back to manual entry.');
      }

      const validRawItems = data.items.filter(isValidGeminiRawItem);
      if (data.items.length > 0 && validRawItems.length === 0) {
        if (!malformedRetried) {
          malformedRetried = true;
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        throw new Error('Gemini returned invalid item fields. Falling back to manual entry.');
      }

      logGeminiTelemetry(
        `Photo Item Detection (/api/gemini/detect-items) · ${photo.name}`,
        {
          model: data.telemetry?.model || GEMINI_CONFIG.MODEL_NAME,
          thinkingLevel: GEMINI_CONFIG.THINKING_LEVEL,
          photoName: photo.name,
          prompt: data.telemetry?.prompt,
          config: data.telemetry?.config,
        },
        data.telemetry?.output || validRawItems
      );

      const timestamp = Date.now();
      return validRawItems.map((raw: any, idx: number) => {
        let box2d: [number, number, number, number] | undefined;
        if (Array.isArray(raw.box_2d) && raw.box_2d.length >= 4) {
          const ymin = Math.max(0, Math.min(1000, Math.round(Number(raw.box_2d[0]) || 0)));
          const xmin = Math.max(0, Math.min(1000, Math.round(Number(raw.box_2d[1]) || 0)));
          const ymax = Math.max(ymin + 40, Math.min(1000, Math.round(Number(raw.box_2d[2]) || 1000)));
          const xmax = Math.max(xmin + 40, Math.min(1000, Math.round(Number(raw.box_2d[3]) || 1000)));
          box2d = [ymin, xmin, ymax, xmax];
        } else {
          // Deterministic grid fallback box if model omitted coordinates
          const col = idx % 3;
          const row = Math.floor(idx / 3) % 2;
          box2d = [
            180 + row * 360,
            80 + col * 290,
            480 + row * 360,
            340 + col * 290,
          ];
        }

        return {
          id: `gemini-item-${photo.id}-${timestamp}-${idx}`,
          name: String(raw.name || 'Detected Belonging').trim(),
          category: normalizeCategory(raw.category),
          quantity: Math.max(1, Math.round(Number(raw.quantity) || 1)),
          width_cm: Math.round(Number(raw.width_cm) || 0),
          depth_cm: Math.round(Number(raw.depth_cm) || 0),
          height_cm: Math.round(Number(raw.height_cm) || 0),
          weight_kg: Math.round(Number(raw.weight_kg) || 0),
          fragile: Boolean(raw.fragile),
          can_stack_on_top: Boolean(raw.can_stack_on_top),
          can_rotate: Boolean(raw.can_rotate),
          confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
          reasoning_short: String(
            raw.reasoning_short || 'Compared to the door frame ≈ 200cm'
          ),
          photoThumbnail: photo.thumbnailUrl,
          source: 'photo',
          box_2d: box2d,
        };
      });
    } catch (err: any) {
      if (attempt >= maxRetries) {
        throw new Error(
          err?.message ||
            'Gemini could not measure this photo. Retry or add items manually.'
        );
      }
      const delay = GEMINI_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Photo measurement timed out. Please retry or add items manually.');
}

/**
 * Legacy batch helper kept for compatibility: processes photos sequentially one request per photo.
 */
export async function detectItemsFromPhotos(
  photos: UploadedPhoto[],
  onRetryStatus?: (attempt: number, maxRetries: number) => void
): Promise<InventoryItem[]> {
  let combined: InventoryItem[] = [];
  for (const photo of photos.slice(0, 6)) {
    const items = await detectItemsFromSinglePhoto(photo, onRetryStatus);
    const merged = mergeDuplicateItems(combined, items);
    combined = merged.mergedList;
  }
  return combined;
}
