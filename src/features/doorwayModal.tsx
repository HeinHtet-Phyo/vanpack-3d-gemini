/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InventoryItem, DoorwaySpec } from '../types';
import { checkAllItemsDoorFit, DEFAULT_DOORWAY } from './doorway';
import { DoorOpen, X } from 'lucide-react';

interface DoorwayModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
}

export const DoorwayModal: React.FC<DoorwayModalProps> = ({ isOpen, onClose, items }) => {
  const [doorway, setDoorway] = useState<DoorwaySpec>(DEFAULT_DOORWAY);

  if (!isOpen) return null;

  const results = checkAllItemsDoorFit(items, doorway);
  const passCount = results.filter((r) => r.fits).length;
  const failCount = results.filter((r) => !r.fits).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1A17]/75">
      <div className="manifest-sheet w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b-2 border-[#1B1A17] bg-[#C8A26B] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DoorOpen className="w-5 h-5 text-[#1B1A17]" />
            <div>
              <h3 className="text-xl font-bold font-display text-[#1B1A17]">
                DOORWAY CLEARANCE GAUGE
              </h3>
              <p className="text-xs font-mono text-[#1B1A17]/85">
                Deterministic 2D cross-section check against flat doors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#1B1A17] hover:bg-[#F4EFE6] border border-[#1B1A17] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="p-5 border-b-2 border-[#1B1A17] bg-[#EBE3D5] space-y-4 font-mono">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[#1B1A17] mb-1">
                DOORWAY WIDTH (cm)
              </label>
              <input
                type="number"
                min={40}
                max={250}
                value={doorway.width_cm}
                onChange={(e) =>
                  setDoorway({ ...doorway, width_cm: Math.max(10, parseInt(e.target.value) || 76) })
                }
                className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-3 py-1.5 text-sm font-mono tabular-nums font-bold text-[#1B1A17]"
              />
              <span className="text-[11px] text-[#1B1A17]/75">Standard UK: ~76 cm</span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#1B1A17] mb-1">
                DOORWAY HEIGHT (cm)
              </label>
              <input
                type="number"
                min={100}
                max={300}
                value={doorway.height_cm}
                onChange={(e) =>
                  setDoorway({ ...doorway, height_cm: Math.max(50, parseInt(e.target.value) || 198) })
                }
                className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-3 py-1.5 text-sm font-mono tabular-nums font-bold text-[#1B1A17]"
              />
              <span className="text-[11px] text-[#1B1A17]/75">Standard UK: ~198 cm</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold uppercase">
            <span className="text-[#2F6B3A]">[INSPECTED ✓] {passCount} ITEMS CLEAR DOOR</span>
            {failCount > 0 && (
              <span className="text-[#C2362B]">[REJECTED] {failCount} ITEMS TOO WIDE</span>
            )}
          </div>
        </div>

        {/* List of items */}
        <div className="p-5 overflow-y-auto space-y-2 divide-y divide-[#1B1A17]/30 font-mono">
          {results.map((res) => (
            <div
              key={res.itemId}
              className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold text-[#1B1A17] font-sans">{res.name}</div>
                <div className="text-[11px] text-[#1B1A17]/75 tabular-nums">
                  Smallest profile: {res.smallestCrossSection.w} × {res.smallestCrossSection.h} cm
                </div>
              </div>

              <div>
                {res.fits ? (
                  <span className="inline-block px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] border border-[#1B1A17] font-bold uppercase text-[11px]">
                    PASS (+{res.marginCm}cm) ✓
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 bg-[#C2362B] text-[#F4EFE6] border border-[#1B1A17] font-bold uppercase text-[11px]">
                    TOO WIDE
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t-2 border-[#1B1A17] bg-[#EBE3D5] flex justify-end">
          <button
            onClick={onClose}
            className="btn-hivis px-5 py-1.5 text-xs font-mono font-bold uppercase cursor-pointer"
          >
            Close Sheet
          </button>
        </div>
      </div>
    </div>
  );
};
