/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { VanPreset } from '../types';
import { resetVanPresetsToDefault } from './vans';
import { Settings, RotateCcw, X, Check } from 'lucide-react';

interface VanSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vans: VanPreset[];
  onSaveVans: (updated: VanPreset[]) => void;
}

export const VanSettingsModal: React.FC<VanSettingsModalProps> = ({
  isOpen,
  onClose,
  vans,
  onSaveVans,
}) => {
  const [editedVans, setEditedVans] = useState<VanPreset[]>(vans);

  if (!isOpen) return null;

  const handleChange = (id: string, field: keyof VanPreset, value: any) => {
    setEditedVans((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const handleReset = () => {
    const defaults = resetVanPresetsToDefault();
    setEditedVans(defaults);
  };

  const handleSave = () => {
    onSaveVans(editedVans);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1A17]/75">
      <div className="manifest-sheet w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b-2 border-[#1B1A17] bg-[#C8A26B] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-[#1B1A17]" />
            <div>
              <h3 className="text-xl font-bold font-display text-[#1B1A17]">
                FLEET SPECIFICATIONS &amp; HIRE TARIFFS
              </h3>
              <p className="text-xs font-mono text-[#1B1A17]/85">
                Adjust internal cargo bay dimensions (cm), payload limits (kg), and daily rates (£)
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

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono">
          {editedVans.map((van) => (
            <div key={van.id} className="bg-[#EBE3D5] border-2 border-[#1B1A17] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1B1A17]/40 pb-1.5">
                <span className="font-display text-lg font-bold text-[#1B1A17]">{van.name}</span>
                <span className="text-[11px] text-[#1B1A17]/70 uppercase">REF: {van.id}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#1B1A17] mb-1">
                    LENGTH (cm)
                  </label>
                  <input
                    type="number"
                    min={50}
                    value={van.length_cm}
                    onChange={(e) =>
                      handleChange(van.id, 'length_cm', Math.max(10, parseInt(e.target.value) || 10))
                    }
                    className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-2 py-1 font-mono tabular-nums font-bold text-[#1B1A17]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#1B1A17] mb-1">
                    WIDTH (cm)
                  </label>
                  <input
                    type="number"
                    min={50}
                    value={van.width_cm}
                    onChange={(e) =>
                      handleChange(van.id, 'width_cm', Math.max(10, parseInt(e.target.value) || 10))
                    }
                    className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-2 py-1 font-mono tabular-nums font-bold text-[#1B1A17]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#1B1A17] mb-1">
                    HEIGHT (cm)
                  </label>
                  <input
                    type="number"
                    min={50}
                    value={van.height_cm}
                    onChange={(e) =>
                      handleChange(van.id, 'height_cm', Math.max(10, parseInt(e.target.value) || 10))
                    }
                    className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-2 py-1 font-mono tabular-nums font-bold text-[#1B1A17]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#1B1A17] mb-1">
                    PAYLOAD (kg)
                  </label>
                  <input
                    type="number"
                    min={100}
                    value={van.max_payload_kg}
                    onChange={(e) =>
                      handleChange(
                        van.id,
                        'max_payload_kg',
                        Math.max(10, parseInt(e.target.value) || 10)
                      )
                    }
                    className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-2 py-1 font-mono tabular-nums font-bold text-[#1B1A17]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#1B1A17] mb-1">
                    RATE (£/DAY)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={van.price_gbp}
                    onChange={(e) =>
                      handleChange(van.id, 'price_gbp', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="w-full bg-[#FAF6EE] border-2 border-[#1B1A17] px-2 py-1 font-mono tabular-nums font-bold text-[#1B1A17]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t-2 border-[#1B1A17] bg-[#EBE3D5] flex items-center justify-between">
          <button
            onClick={handleReset}
            className="btn-manifest px-3 py-1.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset UK Defaults
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-manifest px-4 py-1.5 text-xs font-mono font-bold uppercase cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-hivis px-5 py-1.5 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save Fleet Specs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
