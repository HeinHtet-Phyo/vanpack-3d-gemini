/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryItem, VanPreset } from './types';
import {
  getDemoMoveItems,
  getSmallStudioDemoItems,
  getTwoBedHouseShareDemoItems,
} from './data/demoMove';
import {
  loadVanPresets,
  saveVanPresets,
  resetVanPresetsToDefault,
} from './features/vans';
import { evaluateAllVans } from './features/verifier';
import { mergeDuplicateItems } from './features/detection';
import { MoveConfig, DEFAULT_MOVE_CONFIG } from './features/costEngine';
import { ItemTable } from './features/itemTable';
import { YourMove } from './features/yourMove';
import { Results } from './features/results';
import { Upload as PhotoUpload } from './features/upload';
import { HowItWorks } from './features/howItWorks';
import { DoorwayModal } from './features/doorwayModal';
import { VanSettingsModal } from './features/vanSettingsModal';
import { PackingTapeDivider } from './components/ManifestPrimitives';
import {
  Truck,
  Camera,
  Dices,
  Play,
  Square,
  ChevronDown,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

type DemoPresetType = 'studio' | '1bed' | '2bed';

interface PendingDemoConfirm {
  preset: DemoPresetType;
  targetStep?: 1 | 2 | 3;
}

interface TourStage {
  stepNum: 1 | 2 | 3;
  caption: string;
}

const TOUR_STAGES: TourStage[] = [
  {
    stepNum: 1,
    caption:
      'STAGE 1/4 (1 YOUR STUFF) · Studio Move loaded: 8 item cards (15 pieces). Gemini proposes sizes; you confirm or edit any item card.',
  },
  {
    stepNum: 2,
    caption:
      'STAGE 2/4 (2 YOUR MOVE) · UK postcodes (SW7 2AZ → E2 8AA) looked up via postcodes.io (×1.3 road miles) + stairs, helpers & London Congestion Charge.',
  },
  {
    stepNum: 3,
    caption:
      'STAGE 3/4 (3 YOUR ANSWER) · Code proves the Medium Van (£65/day) fits 100% in 1 trip, saving £30/day vs a Luton and beating 2 trips in a Small Van!',
  },
  {
    stepNum: 3,
    caption:
      'STAGE 4/4 (3D VAN & VOICE) · Realistic 3D cutaway van loads item by item through the rear doors, with verified Dispatcher’s Note and 6-language Moving-Day Voice Mode.',
  },
];

export default function App() {
  // Inventory state initialized with Studio Move demo so judges immediately see the £30 savings path
  const [items, setItems] = useState<InventoryItem[]>(() =>
    getSmallStudioDemoItems()
  );
  const [activeDemoLabel, setActiveDemoLabel] = useState<string>('Studio Move');
  const [hasUserEdited, setHasUserEdited] = useState<boolean>(false);
  const [pendingDemoConfirm, setPendingDemoConfirm] =
    useState<PendingDemoConfirm | null>(null);

  // 10 UK Van presets
  const [vans, setVans] = useState<VanPreset[]>(() => loadVanPresets());

  // Move configuration for Screen 2 (YOUR MOVE) & deterministic Cost Engine
  const [moveConfig, setMoveConfig] = useState<MoveConfig>(DEFAULT_MOVE_CONFIG);

  // Only 3 steps: 1 YOUR STUFF -> 2 YOUR MOVE -> 3 YOUR ANSWER
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [isDemoMenuOpen, setIsDemoMenuOpen] = useState<boolean>(false);

  // Trigger counter to invoke "🎲 GENERATE A SAMPLE ROOM" in PhotoUpload from Hero button
  const [triggerGenerateRoomCount, setTriggerGenerateRoomCount] =
    useState<number>(0);

  // Selected van ID for inspecting results & 3D scene
  const [selectedVanId, setSelectedVanId] = useState<string>('medium');

  // Modals
  const [isDoorwayOpen, setIsDoorwayOpen] = useState<boolean>(false);
  const [isVanSettingsOpen, setIsVanSettingsOpen] = useState<boolean>(false);

  // 60-second Judge Tour state
  const [tourStageIndex, setTourStageIndex] = useState<number | null>(null);
  const tourTimerRef = useRef<number | null>(null);

  // Deterministic evaluation across all 10 vans executed instantaneously in pure code
  const packingResult = useMemo(() => {
    return evaluateAllVans(vans, items, moveConfig.allowSpecialLicence);
  }, [vans, items, moveConfig.allowSpecialLicence]);

  // Keep selected van in sync with recommended van when inventory or van presets change
  useEffect(() => {
    if (packingResult.recommendedVanId) {
      setSelectedVanId(packingResult.recommendedVanId);
    } else {
      setSelectedVanId('luton');
    }
  }, [packingResult.recommendedVanId]);

  /**
   * Replaces the item list with the chosen demo preset (never double-loading).
   */
  const executeDemoReplace = (
    preset: DemoPresetType,
    targetStep?: 1 | 2 | 3
  ) => {
    const nextItems =
      preset === 'studio'
        ? getSmallStudioDemoItems()
        : preset === '2bed'
        ? getTwoBedHouseShareDemoItems()
        : getDemoMoveItems();
    const label =
      preset === 'studio'
        ? 'Studio Move'
        : preset === '2bed'
        ? '2-Bed House Share'
        : '1-Bed Flat';

    setItems(nextItems);
    setActiveDemoLabel(label);
    setHasUserEdited(false);
    setPendingDemoConfirm(null);
    setIsDemoMenuOpen(false);
    setShowHowItWorks(false);
    if (targetStep) {
      setCurrentStep(targetStep);
    }
  };

  const handleRequestDemoPreset = (
    preset: DemoPresetType,
    targetStep: 1 | 2 | 3 = 3
  ) => {
    setIsDemoMenuOpen(false);
    if (hasUserEdited && items.length > 0) {
      setPendingDemoConfirm({ preset, targetStep });
      return;
    }
    executeDemoReplace(preset, targetStep);
  };

  const handleUpdateItems = (updated: InventoryItem[]) => {
    setItems(updated);
    setHasUserEdited(true);
  };

  const handlePhotoItemsDetected = (detectedItems: InventoryItem[]) => {
    setItems((prev) => {
      const { mergedList } = mergeDuplicateItems(prev, detectedItems);
      return mergedList;
    });
    setHasUserEdited(true);
    setTimeout(() => {
      document
        .getElementById('inventory-cards-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSaveVans = (updated: VanPreset[]) => {
    setVans(updated);
    saveVanPresets(updated);
  };

  const handleUpdateSingleVanPrice = (vanId: string, newPrice: number) => {
    const updated = vans.map((v) =>
      v.id === vanId ? { ...v, price_gbp: newPrice } : v
    );
    handleSaveVans(updated);
  };

  const handleResetVanPrices = () => {
    const defaults = resetVanPresetsToDefault();
    setVans(defaults);
  };

  // Judge Tour progression (pauses 4 seconds on each stage, works 100% offline)
  useEffect(() => {
    if (tourStageIndex === null) return;
    if (tourStageIndex >= TOUR_STAGES.length) {
      setTourStageIndex(null);
      return;
    }

    const stage = TOUR_STAGES[tourStageIndex];
    setShowHowItWorks(false);
    setCurrentStep(stage.stepNum);

    tourTimerRef.current = window.setTimeout(() => {
      setTourStageIndex((prev) =>
        prev !== null && prev + 1 < TOUR_STAGES.length ? prev + 1 : null
      );
    }, 4000);

    return () => {
      if (tourTimerRef.current) {
        clearTimeout(tourTimerRef.current);
      }
    };
  }, [tourStageIndex]);

  const handleStartJudgeTour = () => {
    executeDemoReplace('studio', 1);
    setTourStageIndex(0);
  };

  const handleStopJudgeTour = () => {
    if (tourTimerRef.current) {
      clearTimeout(tourTimerRef.current);
    }
    setTourStageIndex(null);
  };

  const activeTourStage =
    tourStageIndex !== null ? TOUR_STAGES[tourStageIndex] : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4EFE6] text-[#1B1A17]">
      {/* ================================================================= */}
      {/* TOP BAR: BRANDING + "▶ JUDGE TOUR (60S)" + "HOW IT WORKS"         */}
      {/* ================================================================= */}
      <header className="border-b-2 border-[#1B1A17] bg-[#EBE3D5] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Title */}
          <button
            type="button"
            onClick={() => {
              setShowHowItWorks(false);
              setCurrentStep(1);
            }}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-10 h-10 bg-[#F2D21B] border-2 border-[#1B1A17] flex items-center justify-center text-[#1B1A17] shadow-[3px_3px_0_#1B1A17]">
              <Truck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-display tracking-wider text-[#1B1A17]">
                  VANPACK 3D
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-[#1B1A17] text-[#F4EFE6]">
                  THE REMOVAL MANIFEST
                </span>
              </div>
              <p className="text-xs font-mono text-[#1B1A17]/80">
                GEMINI PROPOSES · YOU CONFIRM · CODE PROVES
              </p>
            </div>
          </button>

          {/* Right Header Links: Judge tour (60s) & How It Works */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeTourStage ? (
              <button
                type="button"
                onClick={handleStopJudgeTour}
                className="px-3.5 py-2 bg-[#C2362B] text-[#F4EFE6] border-2 border-[#1B1A17] text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_#1B1A17]"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Judge Tour</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartJudgeTour}
                className="px-3.5 py-2 bg-[#FAF6EE] hover:bg-[#F2D21B] text-[#1B1A17] border-2 border-[#1B1A17] text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                title="Auto-runs a 60-second guided demo end to end with captions (works offline too)"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>▶ Judge tour (60s)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowHowItWorks((prev) => !prev)}
              className={`px-3.5 py-2 border-2 border-[#1B1A17] text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer ${
                showHowItWorks
                  ? 'bg-[#1B1A17] text-[#F2D21B]'
                  : 'bg-[#C8A26B] text-[#1B1A17] hover:bg-[#9C7444] hover:text-[#F4EFE6]'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showHowItWorks ? '← Back to App' : 'How It Works'}</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* SIMPLE 3-STEP PROGRESS BAR: 1 YOUR STUFF → 2 YOUR MOVE → 3 YOUR ANSWER */}
        {/* ================================================================= */}
        {!showHowItWorks && (
          <div className="border-t-2 border-[#1B1A17] bg-[#C8A26B]/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 grid grid-cols-3 gap-2 sm:gap-4">
              {(
                [
                  {
                    num: 1,
                    title: '1 YOUR STUFF',
                    sub: `${items.length} item types`,
                  },
                  {
                    num: 2,
                    title: '2 YOUR MOVE',
                    sub: `${moveConfig.fromPostcode} → ${moveConfig.toPostcode}`,
                  },
                  {
                    num: 3,
                    title: '3 YOUR ANSWER',
                    sub: '3D Van & Total Cost',
                  },
                ] as { num: 1 | 2 | 3; title: string; sub: string }[]
              ).map((step) => {
                const isActive = currentStep === step.num;
                const isDone = currentStep > step.num;
                return (
                  <button
                    key={step.num}
                    type="button"
                    onClick={() => setCurrentStep(step.num)}
                    className={`px-3 py-2.5 border-2 border-[#1B1A17] text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-[#F2D21B] text-[#1B1A17] shadow-[3px_3px_0_#1B1A17] font-extrabold'
                        : isDone
                        ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                        : 'bg-[#FAF6EE] text-[#1B1A17] hover:bg-[#EBE3D5]'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-display text-base sm:text-xl font-extrabold tracking-wide leading-none">
                        {step.title}
                      </div>
                      <div className="hidden sm:block font-mono text-[11px] opacity-85 mt-1 truncate">
                        {step.sub}
                      </div>
                    </div>
                    {isDone && (
                      <span className="font-mono text-xs font-bold shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Active Judge Tour Caption Banner */}
      {activeTourStage && (
        <div className="bg-[#F2D21B] border-b-2 border-[#1B1A17] px-4 py-3 sticky top-[118px] z-20 shadow-[0_4px_0_#1B1A17]">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 font-mono text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 text-[#1B1A17] font-bold">
              <span className="px-2 py-0.5 bg-[#1B1A17] text-[#F2D21B] uppercase">
                60S JUDGE TOUR ({(tourStageIndex ?? 0) + 1}/{TOUR_STAGES.length})
              </span>
              <span>{activeTourStage.caption}</span>
            </div>
            <button
              type="button"
              onClick={handleStopJudgeTour}
              className="px-3 py-1 bg-[#1B1A17] text-[#F4EFE6] hover:bg-[#C2362B] font-bold uppercase cursor-pointer"
            >
              Stop Tour
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Banner when replacing edited items with a Demo Move */}
      {pendingDemoConfirm && (
        <div className="bg-[#FAF6EE] border-b-2 border-[#1B1A17] px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-[#1B1A17] font-bold">
              <AlertTriangle className="w-4 h-4 text-[#C2362B] shrink-0" />
              <span>
                Replace your current edited item list with the{' '}
                {pendingDemoConfirm.preset === 'studio'
                  ? 'Studio Move'
                  : pendingDemoConfirm.preset === '2bed'
                  ? '2-Bed House Share'
                  : '1-Bed Flat'}{' '}
                demo?
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  executeDemoReplace(
                    pendingDemoConfirm.preset,
                    pendingDemoConfirm.targetStep
                  )
                }
                className="btn-hivis px-3 py-1 font-bold uppercase cursor-pointer"
              >
                Yes, Replace List
              </button>
              <button
                type="button"
                onClick={() => setPendingDemoConfirm(null)}
                className="btn-manifest px-3 py-1 font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MAIN CONTENT AREA                                                 */}
      {/* ================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {showHowItWorks ? (
          <HowItWorks
            onBackToApp={() => setShowHowItWorks(false)}
            onStartJudgeTour={handleStartJudgeTour}
          />
        ) : (
          <>
            {/* ============================================================= */}
            {/* STEP 1: 1 YOUR STUFF (HOME HERO + PHOTO SCAN + ITEM CARDS)    */}
            {/* ============================================================= */}
            {currentStep === 1 && (
              <div className="space-y-8">
                {/* PRIORITY 1 HOME HERO: Clear question in big stencil type */}
                <section className="manifest-sheet p-6 sm:p-10 bg-[#FAF6EE] border-4 border-[#1B1A17] shadow-[6px_6px_0_#1B1A17] space-y-6">
                  <div className="space-y-3 max-w-4xl">
                    <div className="inline-block px-2.5 py-1 bg-[#1B1A17] text-[#F2D21B] font-mono text-xs font-bold uppercase">
                      LONDON REMOVAL MANIFEST · 10 UK VANS COMPARED
                    </div>
                    <h1 className="text-4xl sm:text-6xl font-extrabold font-display text-[#1B1A17] leading-[0.98] tracking-wide uppercase">
                      WHICH VAN DO YOU NEED, AND WHAT WILL IT COST?
                    </h1>
                    <p className="text-lg sm:text-xl text-[#1B1A17]/90 font-medium">
                      Snap your stuff. Gemini measures it. Code proves it fits and prices it.
                    </p>
                  </div>

                  {/* 3 Action Buttons + "▶ Judge tour (60s)" link */}
                  <div className="flex flex-wrap items-center gap-3.5 pt-1">
                    {/* 1. [📸 SCAN MY STUFF] */}
                    <button
                      type="button"
                      onClick={() => {
                        document
                          .getElementById('photo-survey-panel')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="btn-manifest bg-[#C8A26B] px-5 py-3.5 text-sm sm:text-base font-display font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-5 h-5" />
                      <span>📸 SCAN MY STUFF</span>
                    </button>

                    {/* 2. [🎲 GENERATE A SAMPLE ROOM] */}
                    <button
                      type="button"
                      onClick={() => {
                        setTriggerGenerateRoomCount((c) => c + 1);
                        setTimeout(() => {
                          document
                            .getElementById('photo-survey-panel')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 80);
                      }}
                      className="btn-manifest bg-[#EBE3D5] px-5 py-3.5 text-sm sm:text-base font-display font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                    >
                      <Dices className="w-5 h-5" />
                      <span>🎲 GENERATE A SAMPLE ROOM</span>
                    </button>

                    {/* 3. [▶ TRY A DEMO MOVE ▾ (Studio / 1-Bed / 2-Bed house share)] */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDemoMenuOpen((o) => !o)}
                        className="btn-manifest bg-[#FAF6EE] px-5 py-3.5 text-sm sm:text-base font-display font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>▶ TRY A DEMO MOVE ({activeDemoLabel})</span>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {isDemoMenuOpen && (
                        <div className="absolute left-0 mt-2 w-80 bg-[#FAF6EE] border-2 border-[#1B1A17] shadow-[4px_4px_0_#1B1A17] z-30 divide-y-2 divide-[#1B1A17] font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => handleRequestDemoPreset('studio', 3)}
                            className="w-full text-left p-3.5 hover:bg-[#F2D21B] cursor-pointer space-y-0.5"
                          >
                            <div className="font-bold text-sm text-[#1B1A17] uppercase">
                              ▶ Studio Move (15 items)
                            </div>
                            <div className="text-[#2F6B3A] font-bold">
                              Small van fails · Medium van passes · Saves £30 vs Luton
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRequestDemoPreset('1bed', 3)}
                            className="w-full text-left p-3.5 hover:bg-[#F2D21B] cursor-pointer space-y-0.5"
                          >
                            <div className="font-bold text-sm text-[#1B1A17] uppercase">
                              ▶ 1-Bed Flat (31 items)
                            </div>
                            <div className="text-[#1B1A17]/80">
                              Includes 200cm upright bookshelf → Luton Van (0 leftovers)
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRequestDemoPreset('2bed', 3)}
                            className="w-full text-left p-3.5 hover:bg-[#F2D21B] cursor-pointer space-y-0.5"
                          >
                            <div className="font-bold text-sm text-[#1B1A17] uppercase">
                              ▶ 2-Bed House Share (28 items)
                            </div>
                            <div className="text-[#1B1A17]/80">
                              2 double beds + 225cm tall wardrobe → Luton XL
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* "▶ Judge tour (60s)" quick link */}
                    <button
                      type="button"
                      onClick={handleStartJudgeTour}
                      className="text-sm font-mono font-bold underline text-[#1B1A17] hover:text-[#9C7444] px-2 py-2 cursor-pointer"
                    >
                      ▶ Judge tour (60s)
                    </button>
                  </div>

                  {/* 3-Panel Strip: GEMINI PROPOSES → YOU CONFIRM → CODE PROVES */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t-2 border-[#1B1A17]">
                    <div className="p-3.5 bg-[#EBE3D5] border-2 border-[#1B1A17]">
                      <div className="font-display text-lg font-extrabold uppercase text-[#1B1A17]">
                        1. GEMINI PROPOSES
                      </div>
                      <p className="text-sm text-[#1B1A17]/85 mt-0.5">
                        Draws bounding boxes on your photos and estimates W×D×H cm from UK doors.
                      </p>
                    </div>

                    <div className="p-3.5 bg-[#EBE3D5] border-2 border-[#1B1A17]">
                      <div className="font-display text-lg font-extrabold uppercase text-[#1B1A17]">
                        2. YOU CONFIRM
                      </div>
                      <p className="text-sm text-[#1B1A17]/85 mt-0.5">
                        Click any item card to edit sizes or add items. Nothing is decided without you.
                      </p>
                    </div>

                    <div className="p-3.5 bg-[#EBE3D5] border-2 border-[#1B1A17]">
                      <div className="font-display text-lg font-extrabold uppercase text-[#2F6B3A]">
                        3. CODE PROVES
                      </div>
                      <p className="text-sm text-[#1B1A17]/85 mt-0.5">
                        Packs 10 vans in 3D, runs 6 physics checks, and computes exact UK move costs.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Photo Upload & Sample Room Generator (up to 12 photos) */}
                <PhotoUpload
                  existingItemCount={items.length}
                  onItemsDetected={handlePhotoItemsDetected}
                  onGoToReviewManual={() => {
                    document
                      .getElementById('inventory-cards-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  triggerGenerateRoomCount={triggerGenerateRoomCount}
                />

                <PackingTapeDivider label="CONFIRMED BELONGINGS · CLICK ANY CARD TO EDIT" />

                {/* Simple Item Cards + ONE Yellow Primary Button ("2. NEXT: YOUR MOVE & TOTAL COST →") */}
                <ItemTable
                  items={items}
                  onUpdateItems={handleUpdateItems}
                  onLoadDemoMove={() => handleRequestDemoPreset('1bed', 1)}
                  onLoadStudioDemo={() => handleRequestDemoPreset('studio', 1)}
                  onLoadTwoBedDemo={() => handleRequestDemoPreset('2bed', 1)}
                  onPackVan={() => {
                    setCurrentStep(2);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenDoorwayCheck={() => setIsDoorwayOpen(true)}
                />
              </div>
            )}

            {/* ============================================================= */}
            {/* STEP 2: 2 YOUR MOVE (POSTCODES, FLOORS, HELPERS, FORMULAS)    */}
            {/* ============================================================= */}
            {currentStep === 2 && (
              <YourMove
                moveConfig={moveConfig}
                onChangeMoveConfig={setMoveConfig}
                vans={vans}
                onUpdateVanPrice={handleUpdateSingleVanPrice}
                onResetVans={handleResetVanPrices}
                onBackToStuff={() => {
                  setCurrentStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onContinueToAnswer={() => {
                  setCurrentStep(3);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {/* ============================================================= */}
            {/* STEP 3: 3 YOUR ANSWER (BIG ANSWER, RECEIPT, 10 VANS, 3D VAN)  */}
            {/* ============================================================= */}
            {currentStep === 3 && (
              <Results
                vans={vans}
                packingResult={packingResult}
                selectedVanId={selectedVanId}
                onSelectVan={setSelectedVanId}
                inventory={items}
                moveConfig={moveConfig}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1B1A17] bg-[#EBE3D5] py-4 px-4 sm:px-6 lg:px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-[#1B1A17]/80">
          <div>
            <strong>VANPACK 3D</strong> · GEMINI PROPOSES · YOU CONFIRM · CODE PROVES
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setIsDoorwayOpen(true)}
              className="underline hover:text-[#1B1A17] cursor-pointer"
            >
              UK Doorway Gauge
            </button>
            <button
              type="button"
              onClick={() => setIsVanSettingsOpen(true)}
              className="underline hover:text-[#1B1A17] cursor-pointer"
            >
              10-Van Fleet Specs
            </button>
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="underline hover:text-[#1B1A17] cursor-pointer"
            >
              How It Works Blueprint
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <DoorwayModal
        isOpen={isDoorwayOpen}
        onClose={() => setIsDoorwayOpen(false)}
        items={items}
      />

      <VanSettingsModal
        isOpen={isVanSettingsOpen}
        onClose={() => setIsVanSettingsOpen(false)}
        vans={vans}
        onSaveVans={handleSaveVans}
      />
    </div>
  );
}
