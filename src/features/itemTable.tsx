/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InventoryItem, ItemCategory } from '../types';
import { validateItemSanity } from './detection';
import { MANIFEST_CATEGORY_COLORS } from '../components/ManifestPrimitives';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Package,
  DoorOpen,
  XCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  ArrowRight,
} from 'lucide-react';

interface ItemTableProps {
  items: InventoryItem[];
  onUpdateItems: (items: InventoryItem[]) => void;
  onLoadDemoMove: () => void;
  onLoadStudioDemo?: () => void;
  onLoadTwoBedDemo?: () => void;
  onPackVan: () => void;
  onOpenDoorwayCheck: () => void;
  onGoToUpload?: () => void;
}

const CATEGORIES: ItemCategory[] = [
  'Furniture',
  'Boxes',
  'Appliances',
  'Electronics',
  'Luggage',
  'Misc',
];

/**
 * Screen 1 ("1 YOUR STUFF"): Simple, readable Item Cards.
 * - Each card shows name, size (W×D×H cm), weight (kg), quantity, confidence badge, and a small photo crop.
 * - Click any card to edit its dimensions, weight, or quantity.
 * - Advanced controls (rotation flags, stackable, fragile, doorway check) are hidden under a small "Details ▾" toggle.
 * - Sanity checks (<5cm or >300cm or >200kg) turn the card red and block packing until fixed.
 * - Low confidence (<70%) is highlighted amber with "Please check this size".
 */
export const ItemTable: React.FC<ItemTableProps> = ({
  items,
  onUpdateItems,
  onPackVan,
  onOpenDoorwayCheck,
}) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState<boolean>(false);

  // Live totals computed deterministically in code
  const totalPieces = items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity) || 0), 0);
  const totalWeightKg = items.reduce(
    (sum, it) =>
      sum + Math.max(0, Number(it.quantity) || 0) * Math.max(0, Number(it.weight_kg) || 0),
    0
  );
  const totalVolumeM3 = items.reduce((sum, it) => {
    const vol =
      (Math.max(0, Number(it.width_cm) || 0) *
        Math.max(0, Number(it.depth_cm) || 0) *
        Math.max(0, Number(it.height_cm) || 0) *
        Math.max(0, Number(it.quantity) || 0)) /
      1_000_000;
    return sum + vol;
  }, 0);

  // Deterministic sanity check across all items
  const sanityByItemId = React.useMemo(() => {
    const map: Record<string, { isValid: boolean; errors: string[] }> = {};
    for (const item of items) {
      map[item.id] = validateItemSanity(item);
    }
    return map;
  }, [items]);

  const invalidItemsCount = items.filter((it) => !sanityByItemId[it.id]?.isValid).length;
  const lowConfidenceCount = items.filter((it) => it.confidence < 0.7).length;
  const mergedCount = items.filter((it) => it.mergedDuplicate).length;

  const handleFieldChange = (id: string, field: keyof InventoryItem, value: any) => {
    const updated = items.map((it) => {
      if (it.id === id) {
        return { ...it, [field]: value };
      }
      return it;
    });
    onUpdateItems(updated);
  };

  const handleAddItem = () => {
    const newId = `item-${Date.now()}`;
    const newItem: InventoryItem = {
      id: newId,
      name: 'New Moving Box / Item',
      category: 'Boxes',
      quantity: 1,
      width_cm: 45,
      depth_cm: 35,
      height_cm: 35,
      weight_kg: 12,
      fragile: false,
      can_stack_on_top: true,
      can_rotate: true,
      confidence: 1.0,
      reasoning_short: 'Added manually by user',
      source: 'manual',
    };
    onUpdateItems([...items, newItem]);
    setEditingItemId(newId);
  };

  const handleDeleteItem = (id: string) => {
    onUpdateItems(items.filter((it) => it.id !== id));
    if (editingItemId === id) {
      setEditingItemId(null);
    }
  };

  /**
   * Renders a small cropped thumbnail from the photo (using box_2d if available)
   * or a clean category swatch badge.
   */
  const renderPhotoCrop = (item: InventoryItem) => {
    const catColor = MANIFEST_CATEGORY_COLORS[item.category] || '#9C7444';
    if (!item.photoThumbnail) {
      return (
        <div
          style={{ backgroundColor: catColor }}
          className="w-16 h-16 border-2 border-[#1B1A17] shrink-0 flex flex-col items-center justify-center text-[#F4EFE6] font-mono text-[10px] font-bold uppercase"
        >
          <Package className="w-5 h-5 mb-0.5" />
          <span>{item.category.slice(0, 4)}</span>
        </div>
      );
    }

    // If box_2d is present, focus object-position around the centre of the detected bounding box
    let objPos = '50% 50%';
    if (item.box_2d && item.box_2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      const cx = Math.round((xmin + xmax) / 20);
      const cy = Math.round((ymin + ymax) / 20);
      objPos = `${cx}% ${cy}%`;
    }

    return (
      <div className="w-16 h-16 border-2 border-[#1B1A17] shrink-0 overflow-hidden bg-[#EBE3D5] relative">
        <img
          src={item.photoThumbnail}
          alt={item.name}
          style={{ objectPosition: objPos }}
          className="w-full h-full object-cover scale-125"
        />
      </div>
    );
  };

  return (
    <div id="inventory-cards-section" className="manifest-sheet p-5 sm:p-8 space-y-6">
      {/* Header & Big Key Numbers (40px+ tabular mono) */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-[#1B1A17] pb-5">
        <div>
          <div className="text-xs font-mono font-bold uppercase text-[#9C7444]">
            YOUR CONFIRMED CARGO LIST · CLICK ANY ITEM CARD TO EDIT
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-[#1B1A17] mt-1">
            YOUR BELONGINGS ({items.length} ITEM TYPES)
          </h2>
          <p className="text-[17px] text-[#1B1A17]/85 mt-1">
            Check the sizes below. Click any card to adjust dimensions, or add items manually.
          </p>
        </div>

        {/* Big Readable Key Numbers (40px+) */}
        <div className="flex flex-wrap items-center gap-6 font-mono">
          <div>
            <div className="text-xs font-bold uppercase text-[#9C7444]">TOTAL ITEMS</div>
            <div className="text-[40px] leading-none font-extrabold text-[#1B1A17] mt-1">
              {totalPieces}
            </div>
          </div>
          <div className="border-l-2 border-[#1B1A17]/30 pl-6">
            <div className="text-xs font-bold uppercase text-[#9C7444]">VOLUME</div>
            <div className="text-[40px] leading-none font-extrabold text-[#1B1A17] mt-1">
              {totalVolumeM3.toFixed(1)}
              <span className="text-xl ml-1">m³</span>
            </div>
          </div>
          <div className="border-l-2 border-[#1B1A17]/30 pl-6">
            <div className="text-xs font-bold uppercase text-[#9C7444]">WEIGHT</div>
            <div className="text-[40px] leading-none font-extrabold text-[#1B1A17] mt-1">
              {totalWeightKg}
              <span className="text-xl ml-1">kg</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sanity Error Banner (<5cm, >300cm, >200kg) */}
      {invalidItemsCount > 0 && (
        <div className="bg-[#C2362B] text-[#F4EFE6] border-2 border-[#1B1A17] p-4 flex items-start gap-3">
          <XCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-base font-display font-bold uppercase tracking-wider">
              {invalidItemsCount} ITEM(S) HAVE IMPOSSIBLE DIMENSIONS — PLEASE FIX TO CONTINUE
            </div>
            <p className="text-sm font-mono">
              Every dimension must be between <strong>5 cm and 300 cm</strong>, and single item weight must be <strong>200 kg or less</strong>. Click the red card below to fix it.
            </p>
          </div>
        </div>
      )}

      {/* Low Confidence (<70%) Amber Notice */}
      {lowConfidenceCount > 0 && (
        <div className="bg-[#F2D21B]/50 border-2 border-[#1B1A17] p-4 flex items-center justify-between gap-3 font-mono text-sm">
          <div className="flex items-center gap-2.5 text-[#1B1A17] font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              {lowConfidenceCount} item(s) have confidence under 70% — highlighted in amber with &ldquo;Please check this size&rdquo;.
            </span>
          </div>
          {mergedCount > 0 && (
            <span className="px-2 py-0.5 bg-[#FAF6EE] border border-[#1B1A17] text-xs font-bold">
              {mergedCount} merged across photos
            </span>
          )}
        </div>
      )}

      {/* Simple Item Cards Grid */}
      {items.length === 0 ? (
        <div className="p-10 text-center bg-[#FAF6EE] border-2 border-dashed border-[#1B1A17] space-y-4">
          <p className="text-xl font-display font-bold uppercase text-[#1B1A17]">
            No items added yet
          </p>
          <p className="text-[17px] text-[#1B1A17]/80">
            Scan a photo above, generate a sample room, try a demo move, or add an item manually.
          </p>
          <button
            type="button"
            onClick={handleAddItem}
            className="btn-manifest bg-[#C8A26B] px-5 py-3 text-sm font-mono font-bold uppercase inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add item manually</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const sanity = sanityByItemId[item.id] || { isValid: true, errors: [] };
            const isInvalid = !sanity.isValid;
            const isLowConf = item.confidence < 0.7;
            const isEditing = editingItemId === item.id;
            const confPct = Math.round(item.confidence * 100);

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!isEditing) setEditingItemId(item.id);
                }}
                className={`border-2 border-[#1B1A17] p-4 transition-all ${
                  isInvalid
                    ? 'bg-[#C2362B]/15 border-[#C2362B]'
                    : isLowConf
                    ? 'bg-[#F2D21B]/30'
                    : 'bg-[#FAF6EE] hover:bg-[#EBE3D5]/70'
                } ${!isEditing ? 'cursor-pointer' : ''}`}
              >
                {/* Card Top Summary Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    {renderPhotoCrop(item)}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold px-2 py-0.5 bg-[#1B1A17] text-[#F2D21B]">
                          {item.quantity}×
                        </span>
                        <h3 className="text-lg font-bold text-[#1B1A17] truncate">
                          {item.name}
                        </h3>
                      </div>

                      <div className="font-mono text-base font-bold text-[#1B1A17]">
                        {item.width_cm} × {item.depth_cm} × {item.height_cm} cm ·{' '}
                        <span className="text-[#9C7444]">{item.weight_kg} kg</span>
                      </div>

                      {/* Badges: Confidence, Low-confidence warning, Merged, Fragile */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono text-xs">
                        <span
                          className={`px-2 py-0.5 border border-[#1B1A17] font-bold ${
                            isLowConf
                              ? 'bg-[#F2D21B] text-[#1B1A17]'
                              : 'bg-[#EBE3D5] text-[#1B1A17]'
                          }`}
                        >
                          {confPct}% conf
                        </span>

                        {isLowConf && (
                          <span className="px-2 py-0.5 bg-[#F2D21B] border border-[#1B1A17] font-bold text-[#1B1A17]">
                            ⚠ Please check this size
                          </span>
                        )}

                        {item.mergedDuplicate && (
                          <span className="px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] border border-[#1B1A17] font-bold">
                            merged
                          </span>
                        )}

                        {item.fragile && (
                          <span className="px-2 py-0.5 bg-[#C2362B] text-[#F4EFE6] border border-[#1B1A17] font-bold">
                            FRAGILE
                          </span>
                        )}
                      </div>

                      {isInvalid && (
                        <div className="text-xs font-mono font-bold text-[#C2362B] pt-1">
                          ✗ {sanity.errors.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Edit / Delete Actions */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItemId(isEditing ? null : item.id)
                      }
                      className="btn-manifest px-2.5 py-1.5 text-xs font-mono font-bold uppercase flex items-center gap-1 cursor-pointer"
                      title={isEditing ? 'Done editing' : 'Edit item'}
                    >
                      {isEditing ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#2F6B3A]" />
                          <span>Done</span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 border border-[#1B1A17] bg-[#EBE3D5] hover:bg-[#C2362B] hover:text-[#F4EFE6] cursor-pointer"
                      title="Remove item"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline Editor when Card is Clicked */}
                {isEditing && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-4 pt-4 border-t-2 border-[#1B1A17] space-y-3 font-mono text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            handleFieldChange(item.id, 'name', e.target.value)
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2.5 py-1.5 font-sans font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={item.quantity}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'quantity',
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2.5 py-1.5 font-bold text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Width (cm)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={300}
                          value={item.width_cm}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'width_cm',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Depth (cm)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={300}
                          value={item.depth_cm}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'depth_cm',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Height (cm)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={300}
                          value={item.height_cm}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'height_cm',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase mb-1">
                          Weight (kg)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={item.weight_kg}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'weight_kg',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold text-sm"
                        />
                      </div>
                    </div>

                    {item.reasoning_short && (
                      <div className="text-[11px] font-sans text-[#1B1A17]/80 bg-[#EBE3D5] px-2.5 py-1.5 border border-[#1B1A17]/30">
                        <strong>Gemini note:</strong> {item.reasoning_short}
                      </div>
                    )}

                    {/* Advanced Flags when Details ▾ is open */}
                    {showAdvancedDetails && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1B1A17]/20">
                        <select
                          value={item.category}
                          onChange={(e) =>
                            handleFieldChange(
                              item.id,
                              'category',
                              e.target.value as ItemCategory
                            )
                          }
                          className="bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1 font-bold"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.fragile}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'fragile', e.target.checked)
                            }
                          />
                          <span>Fragile (top only)</span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.can_stack_on_top}
                            onChange={(e) =>
                              handleFieldChange(
                                item.id,
                                'can_stack_on_top',
                                e.target.checked
                              )
                            }
                          />
                          <span>Stackable top</span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.can_rotate}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'can_rotate', e.target.checked)
                            }
                          />
                          <span>Can tilt/rotate</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Action Bar: "+ Add item manually", "Details ▾", and the ONE Yellow Primary Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t-2 border-[#1B1A17]">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAddItem}
            className="btn-manifest bg-[#C8A26B] px-4 py-2.5 text-sm font-mono font-bold uppercase flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add item manually</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAdvancedDetails((prev) => !prev)}
            className="btn-manifest px-3.5 py-2.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <span>Details ▾</span>
            {showAdvancedDetails ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showAdvancedDetails && (
            <button
              type="button"
              onClick={onOpenDoorwayCheck}
              className="btn-manifest px-3.5 py-2.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>UK Doorway Clearance Gauge</span>
            </button>
          )}
        </div>

        {/* ONE Yellow Primary Button on Screen 1 */}
        <button
          type="button"
          onClick={onPackVan}
          disabled={items.length === 0 || invalidItemsCount > 0}
          className="btn-hivis px-8 py-4 text-lg font-display font-extrabold uppercase tracking-wider flex items-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>
            {invalidItemsCount > 0
              ? `Fix ${invalidItemsCount} Red Item(s) First`
              : '2. NEXT: YOUR MOVE & TOTAL COST →'}
          </span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
