/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MoveConfig,
  FloorLevel,
  HelperOption,
  lookupPostcodeDistanceMiles,
  isCentralLondonCongestionPostcode,
} from './costEngine';
import { VanPreset } from '../types';
import {
  MapPin,
  Calendar,
  Building2,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

interface YourMoveProps {
  moveConfig: MoveConfig;
  onChangeMoveConfig: React.Dispatch<React.SetStateAction<MoveConfig>>;
  vans: VanPreset[];
  onUpdateVanPrice: (vanId: string, newPrice: number) => void;
  onResetVans: () => void;
  onBackToStuff: () => void;
  onContinueToAnswer: () => void;
}

const FLOOR_OPTIONS: { value: FloorLevel; label: string }[] = [
  { value: 0, label: 'Ground' },
  { value: 1, label: '1st floor' },
  { value: 2, label: '2nd floor' },
  { value: 3, label: '3rd+ floor' },
];

/**
 * Screen 2: "2 YOUR MOVE"
 * Simple, readable form (17px body text) asking From/To UK postcodes, weekday/weekend,
 * floors + lift, helpers, Congestion Charge (auto-suggested from postcode), and an expandable
 * "Details ▾" section with every formula and editable rate.
 * Contains ONE yellow primary button ("SEE YOUR VAN & TOTAL COST →").
 */
export const YourMove: React.FC<YourMoveProps> = ({
  moveConfig,
  onChangeMoveConfig,
  vans,
  onUpdateVanPrice,
  onResetVans,
  onBackToStuff,
  onContinueToAnswer,
}) => {
  const [isLookingUpPostcode, setIsLookingUpPostcode] = useState(false);
  const [postcodeStatus, setPostcodeStatus] = useState<string | null>(
    `postcodes.io: ${moveConfig.distanceMiles} miles (straight-line × 1.3 road factor)`
  );
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Auto-suggest Congestion Charge when From/To postcodes change
  useEffect(() => {
    const suggested =
      isCentralLondonCongestionPostcode(moveConfig.fromPostcode) ||
      isCentralLondonCongestionPostcode(moveConfig.toPostcode);
    onChangeMoveConfig((prev) => ({
      ...prev,
      inCongestionZone: suggested,
      congestionAutoSuggested: suggested,
    }));
  }, [moveConfig.fromPostcode, moveConfig.toPostcode, onChangeMoveConfig]);

  const handlePostcodeLookup = async () => {
    setIsLookingUpPostcode(true);
    setPostcodeError(null);
    const result = await lookupPostcodeDistanceMiles(
      moveConfig.fromPostcode,
      moveConfig.toPostcode
    );
    setIsLookingUpPostcode(false);

    if (result.success && typeof result.roadMiles === 'number') {
      onChangeMoveConfig((prev) => ({
        ...prev,
        distanceMiles: result.roadMiles!,
        distanceSource: 'postcodes.io',
      }));
      setPostcodeStatus(
        `✓ Verified via postcodes.io: ${result.straightLineMiles} mi straight-line × 1.3 = ${result.roadMiles} driving miles`
      );
    } else {
      setPostcodeError(
        result.error || 'Postcode lookup unavailable — type your driving miles below.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="manifest-sheet p-6 sm:p-8 space-y-8">
        {/* Header */}
        <div className="border-b-2 border-[#1B1A17] pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase text-[#9C7444]">
              STEP 2 OF 3 · DETERMINISTIC UK MOVE PRICING ENGINE
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-[#1B1A17] mt-1">
              2. YOUR MOVE DETAILS
            </h2>
            <p className="text-[17px] text-[#1B1A17]/85 mt-1">
              Tell us where and how you are moving. Code calculates the exact driving distance, fuel, time, and total cost.
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToStuff}
            className="btn-manifest px-4 py-2 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Your Stuff</span>
          </button>
        </div>

        {/* 1. From Postcode & To Postcode (UK) */}
        <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-5 space-y-4">
          <div className="flex items-center gap-2 font-display text-xl font-bold text-[#1B1A17]">
            <MapPin className="w-5 h-5 text-[#9C7444]" />
            <span>WHERE ARE YOU MOVING BETWEEN? (UK POSTCODES)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label
                htmlFor="from-postcode"
                className="block text-sm font-mono font-bold uppercase text-[#1B1A17] mb-1.5"
              >
                From Postcode
              </label>
              <input
                id="from-postcode"
                type="text"
                value={moveConfig.fromPostcode}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    fromPostcode: e.target.value.toUpperCase(),
                  }))
                }
                onBlur={handlePostcodeLookup}
                placeholder="e.g. SW7 2AZ"
                className="w-full bg-[#EBE3D5] border-2 border-[#1B1A17] px-3.5 py-2.5 text-[17px] font-mono font-bold text-[#1B1A17] uppercase"
              />
            </div>

            <div>
              <label
                htmlFor="to-postcode"
                className="block text-sm font-mono font-bold uppercase text-[#1B1A17] mb-1.5"
              >
                To Postcode
              </label>
              <input
                id="to-postcode"
                type="text"
                value={moveConfig.toPostcode}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    toPostcode: e.target.value.toUpperCase(),
                  }))
                }
                onBlur={handlePostcodeLookup}
                placeholder="e.g. E2 8AA"
                className="w-full bg-[#EBE3D5] border-2 border-[#1B1A17] px-3.5 py-2.5 text-[17px] font-mono font-bold text-[#1B1A17] uppercase"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={handlePostcodeLookup}
                disabled={isLookingUpPostcode}
                className="w-full btn-manifest bg-[#C8A26B] px-4 py-3 text-xs font-mono font-bold uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLookingUpPostcode ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Looking up postcodes.io…</span>
                  </>
                ) : (
                  <span>Calculate Distance (postcodes.io)</span>
                )}
              </button>
            </div>
          </div>

          {/* Distance readout + manual override if needed */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1B1A17]/20 text-sm font-mono">
            <div className="flex items-center gap-2">
              {postcodeError ? (
                <span className="text-[#C2362B] font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {postcodeError}
                </span>
              ) : (
                <span className="text-[#2F6B3A] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {postcodeStatus}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="manual-miles" className="text-xs font-bold uppercase">
                One-way distance (miles):
              </label>
              <input
                id="manual-miles"
                type="number"
                min={0.5}
                max={500}
                step={0.1}
                value={moveConfig.distanceMiles}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    distanceMiles: Math.max(0.5, Number(e.target.value) || 1),
                    distanceSource: 'manual',
                  }))
                }
                className="w-24 bg-[#EBE3D5] border-2 border-[#1B1A17] px-2.5 py-1 text-base font-mono font-bold text-right"
              />
            </div>
          </div>
        </div>

        {/* 2. Moving Day & Floors / Lift */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Moving Date (Weekday vs Weekend) + Congestion + Parking */}
          <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-5 space-y-5">
            <div className="flex items-center gap-2 font-display text-xl font-bold text-[#1B1A17]">
              <Calendar className="w-5 h-5 text-[#9C7444]" />
              <span>MOVING DAY &amp; LONDON ZONES</span>
            </div>

            <div>
              <div className="text-sm font-mono font-bold uppercase mb-2">
                When are you moving?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onChangeMoveConfig((prev) => ({ ...prev, isWeekend: false }))
                  }
                  className={`p-3 border-2 border-[#1B1A17] font-mono text-sm font-bold uppercase cursor-pointer ${
                    !moveConfig.isWeekend
                      ? 'bg-[#1B1A17] text-[#F2D21B]'
                      : 'bg-[#EBE3D5] text-[#1B1A17] hover:bg-[#C8A26B]/40'
                  }`}
                >
                  Weekday (Mon–Fri)
                  <div className="text-[11px] font-normal opacity-80">Standard day rate</div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeMoveConfig((prev) => ({ ...prev, isWeekend: true }))
                  }
                  className={`p-3 border-2 border-[#1B1A17] font-mono text-sm font-bold uppercase cursor-pointer ${
                    moveConfig.isWeekend
                      ? 'bg-[#1B1A17] text-[#F2D21B]'
                      : 'bg-[#EBE3D5] text-[#1B1A17] hover:bg-[#C8A26B]/40'
                  }`}
                >
                  Weekend (Sat–Sun)
                  <div className="text-[11px] font-normal opacity-80">
                    +{moveConfig.weekendSurchargePct}% weekend surcharge
                  </div>
                </button>
              </div>
            </div>

            {/* Congestion Charge */}
            <label className="flex items-start gap-3 p-3 bg-[#EBE3D5] border border-[#1B1A17] cursor-pointer">
              <input
                type="checkbox"
                checked={moveConfig.inCongestionZone}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    inCongestionZone: e.target.checked,
                  }))
                }
                className="mt-1 w-5 h-5 accent-[#1B1A17]"
              />
              <div className="text-sm">
                <div className="font-mono font-bold text-[#1B1A17]">
                  Driving into the London Congestion Charge zone? (+£{moveConfig.congestionChargePerDayGbp}/day)
                </div>
                <div className="text-xs font-mono text-[#1B1A17]/75 mt-0.5">
                  {moveConfig.congestionAutoSuggested
                    ? 'Auto-suggested YES from central London postcode (EC/WC/W1/SW1/SE1/E1/N1/NW1) · check current TfL rate'
                    : 'Auto-suggested NO from postcode · check current TfL rate'}
                </div>
              </div>
            </label>

            {/* Parking suspension */}
            <label className="flex items-start gap-3 p-3 bg-[#EBE3D5] border border-[#1B1A17] cursor-pointer">
              <input
                type="checkbox"
                checked={moveConfig.parkingSuspension}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    parkingSuspension: e.target.checked,
                  }))
                }
                className="mt-1 w-5 h-5 accent-[#1B1A17]"
              />
              <div className="text-sm">
                <div className="font-mono font-bold text-[#1B1A17]">
                  Need a council parking bay suspension? (+£{moveConfig.parkingSuspensionFeeGbp})
                </div>
                <div className="text-xs font-mono text-[#1B1A17]/75 mt-0.5">
                  Leave unticked (£0) if you have a driveway or free loading bay.
                </div>
              </div>
            </label>
          </div>

          {/* Floors & Lift at Each End */}
          <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-5 space-y-5">
            <div className="flex items-center gap-2 font-display text-xl font-bold text-[#1B1A17]">
              <Building2 className="w-5 h-5 text-[#9C7444]" />
              <span>FLOORS &amp; LIFT AT EACH END</span>
            </div>

            {/* Pickup Floor & Lift */}
            <div className="p-3.5 bg-[#EBE3D5] border border-[#1B1A17] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold uppercase">
                  Pickup ({moveConfig.fromPostcode || 'From'}):
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-mono font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moveConfig.fromHasLift}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        fromHasLift: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#1B1A17]"
                  />
                  <span>Lift available</span>
                </label>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {FLOOR_OPTIONS.map((f) => (
                  <button
                    key={`from-${f.value}`}
                    type="button"
                    onClick={() =>
                      onChangeMoveConfig((prev) => ({ ...prev, fromFloor: f.value }))
                    }
                    className={`py-2 px-2 border border-[#1B1A17] font-mono text-xs font-bold uppercase cursor-pointer ${
                      moveConfig.fromFloor === f.value
                        ? 'bg-[#1B1A17] text-[#F2D21B]'
                        : 'bg-[#FAF6EE] text-[#1B1A17]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop-off Floor & Lift */}
            <div className="p-3.5 bg-[#EBE3D5] border border-[#1B1A17] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold uppercase">
                  Drop-off ({moveConfig.toPostcode || 'To'}):
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-mono font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moveConfig.toHasLift}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        toHasLift: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#1B1A17]"
                  />
                  <span>Lift available</span>
                </label>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {FLOOR_OPTIONS.map((f) => (
                  <button
                    key={`to-${f.value}`}
                    type="button"
                    onClick={() =>
                      onChangeMoveConfig((prev) => ({ ...prev, toFloor: f.value }))
                    }
                    className={`py-2 px-2 border border-[#1B1A17] font-mono text-xs font-bold uppercase cursor-pointer ${
                      moveConfig.toFloor === f.value
                        ? 'bg-[#1B1A17] text-[#F2D21B]'
                        : 'bg-[#FAF6EE] text-[#1B1A17]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs font-mono text-[#1B1A17]/80">
              Without a lift, stairs add +25% loading/unloading time per floor above Ground.
            </p>
          </div>
        </div>

        {/* 3. Helpers & Packing Extras */}
        <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-5 space-y-4">
          <div className="flex items-center gap-2 font-display text-xl font-bold text-[#1B1A17]">
            <Users className="w-5 h-5 text-[#9C7444]" />
            <span>WHO IS HELPING YOU LIFT?</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                {
                  id: 'solo',
                  title: 'Just me',
                  sub: '£0 labour · you load & drive',
                },
                {
                  id: 'friends',
                  title: 'Me + friends',
                  sub: '£0 labour · team self-load',
                },
                {
                  id: 'movers',
                  title: 'Hire 2 movers',
                  sub: `2 × £${moveConfig.moverHourlyRateGbp}/hr × labour hours`,
                },
              ] as { id: HelperOption; title: string; sub: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeMoveConfig((prev) => ({ ...prev, helpers: opt.id }))
                }
                className={`p-4 border-2 border-[#1B1A17] text-left cursor-pointer transition-colors ${
                  moveConfig.helpers === opt.id
                    ? 'bg-[#1B1A17] text-[#F2D21B]'
                    : 'bg-[#EBE3D5] text-[#1B1A17] hover:bg-[#C8A26B]/40'
                }`}
              >
                <div className="font-display text-xl font-bold uppercase">{opt.title}</div>
                <div className="font-mono text-xs mt-1 opacity-85">{opt.sub}</div>
              </button>
            ))}
          </div>

          {/* Extras & C1/C Licence checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <label className="flex items-center gap-2.5 p-3 bg-[#EBE3D5] border border-[#1B1A17] text-xs font-mono font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={moveConfig.needBlanketsAndStraps}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    needBlanketsAndStraps: e.target.checked,
                  }))
                }
                className="w-4 h-4 accent-[#1B1A17]"
              />
              <span>Hire blankets &amp; tie straps (+£{moveConfig.blanketsFlatFeeGbp})</span>
            </label>

            <div className="flex items-center justify-between gap-2 p-3 bg-[#EBE3D5] border border-[#1B1A17] text-xs font-mono font-bold">
              <span>I need boxes (£{moveConfig.boxUnitPriceGbp} each):</span>
              <input
                type="number"
                min={0}
                max={100}
                value={moveConfig.needBoxesCount}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    needBoxesCount: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  }))
                }
                className="w-16 bg-[#FAF6EE] border border-[#1B1A17] px-2 py-1 text-right font-bold"
              />
            </div>

            <label className="flex items-center gap-2.5 p-3 bg-[#EBE3D5] border border-[#1B1A17] text-xs font-mono font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={moveConfig.allowSpecialLicence}
                onChange={(e) =>
                  onChangeMoveConfig((prev) => ({
                    ...prev,
                    allowSpecialLicence: e.target.checked,
                  }))
                }
                className="w-4 h-4 accent-[#1B1A17]"
              />
              <span>I have a C1/C licence or will hire a driver (enables 7.5t &amp; 18t lorries)</span>
            </label>
          </div>
        </div>

        {/* Details ▾ Toggle: Formulas & Editable Rates + 10 Van Example Day Rates */}
        <div className="border-2 border-[#1B1A17] bg-[#EBE3D5]">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between font-mono text-xs font-bold uppercase text-[#1B1A17] hover:bg-[#C8A26B]/40 cursor-pointer"
          >
            <span>Details ▾ (Show Deterministic Cost Formulas &amp; Editable Example Rates)</span>
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showDetails && (
            <div className="p-5 border-t-2 border-[#1B1A17] bg-[#FAF6EE] space-y-6 text-xs font-mono">
              {/* Formulas list */}
              <div className="space-y-2">
                <div className="font-bold uppercase text-[#9C7444]">
                  DETERMINISTIC FORMULAS (100% CODE, ZERO AI GUESSWORK)
                </div>
                <ul className="space-y-1.5 text-[#1B1A17]">
                  <li>
                    • <strong>Distance:</strong> postcodes.io lat/long Haversine straight-line distance × <code>1.3</code> road factor = driving miles.
                  </li>
                  <li>
                    • <strong>Trips needed:</strong> <code>1</code> if everything fits in 1 load; otherwise <code>ceil(total volume ÷ (van volume × 0.65))</code>, confirmed by re-running the 3D packer on the leftovers.
                  </li>
                  <li>
                    • <strong>Driving miles:</strong> <code>(trips × 2 − 1) × move distance + 10</code> miles to collect and return the van.
                  </li>
                  <li>
                    • <strong>Fuel:</strong> <code>miles ÷ mpg × 4.546 litres × diesel price (£/L)</code>.
                  </li>
                  <li>
                    • <strong>Hire:</strong> <code>day rate × days</code> (1 day; 2 days if total time &gt; 9 hours) + weekend surcharge (+15%).
                  </li>
                  <li>
                    • <strong>Labour time:</strong> <code>loading + driving (at 18 mph London avg) + unloading</code>. Loading minutes = <code>Σ per item (box 1.5 min, furniture 5 min, heavy appliance 8 min) × stairs factor</code> (+25% per floor without lift).
                  </li>
                </ul>
              </div>

              {/* Editable unit rates */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#1B1A17]/20">
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1">
                    Diesel (£ / litre)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.5}
                    max={5}
                    value={moveConfig.dieselPricePerLitreGbp}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        dieselPricePerLitreGbp: Number(e.target.value) || 1.45,
                      }))
                    }
                    className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1">
                    Weekend surcharge (%)
                  </label>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    max={100}
                    value={moveConfig.weekendSurchargePct}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        weekendSurchargePct: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1">
                    Insurance waiver (£/day)
                  </label>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    max={100}
                    value={moveConfig.insurancePerDayGbp}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        insurancePerDayGbp: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1">
                    Mover rate (£/hr per mover)
                  </label>
                  <input
                    type="number"
                    step={5}
                    min={10}
                    max={150}
                    value={moveConfig.moverHourlyRateGbp}
                    onChange={(e) =>
                      onChangeMoveConfig((prev) => ({
                        ...prev,
                        moverHourlyRateGbp: Number(e.target.value) || 30,
                      }))
                    }
                    className="w-full bg-[#EBE3D5] border border-[#1B1A17] px-2 py-1.5 font-bold"
                  />
                </div>
              </div>

              {/* Editable example day rates for all 10 vans */}
              <div className="space-y-2 pt-2 border-t border-[#1B1A17]/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase text-[#9C7444]">
                    10 UK VAN FLEET — EXAMPLE DAY RATES (EDITABLE)
                  </span>
                  <button
                    type="button"
                    onClick={onResetVans}
                    className="btn-manifest px-2.5 py-1 text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset default prices
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {vans.map((v) => (
                    <div
                      key={v.id}
                      className="p-2.5 bg-[#EBE3D5] border border-[#1B1A17] space-y-1"
                    >
                      <div className="font-bold text-[#1B1A17] truncate" title={v.name}>
                        {v.label}
                      </div>
                      <div className="text-[10px] text-[#1B1A17]/75">
                        {v.length_cm}×{v.width_cm}×{v.height_cm}cm · {v.mpg || 30}mpg
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <span className="text-[10px]">£/day (example):</span>
                        <input
                          type="number"
                          min={20}
                          max={1000}
                          value={v.price_gbp}
                          onChange={(e) =>
                            onUpdateVanPrice(v.id, Math.max(10, Number(e.target.value) || v.price_gbp))
                          }
                          className="w-16 bg-[#FAF6EE] border border-[#1B1A17] px-1.5 py-0.5 text-right font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Single Yellow Primary Button for Screen 2 */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onContinueToAnswer}
            className="btn-hivis px-8 py-4 text-lg font-display font-extrabold uppercase tracking-wider flex items-center gap-3 cursor-pointer"
          >
            <span>3. SEE YOUR ANSWER, TOTAL COST &amp; 3D VAN</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
