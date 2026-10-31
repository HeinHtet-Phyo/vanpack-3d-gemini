/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GEMINI_CONFIG } from '../config/gemini';
import {
  ManifestSheetHeader,
  PackingTapeDivider,
} from '../components/ManifestPrimitives';
import {
  Camera,
  Shield,
  ScanLine,
  AlertTriangle,
  ClipboardCheck,
  Box,
  ShieldCheck,
  Calculator,
  Truck,
  FileText,
  Hash,
  Volume2,
  ArrowRight,
} from 'lucide-react';

interface BlueprintNode {
  id: string;
  stepNum: string;
  title: string;
  badge: 'GEMINI AI' | 'DETERMINISTIC CODE' | 'HUMAN IN CONTROL' | 'SERVER PROXY';
  runner: string;
  whatItDoes: string;
  whyRationale: string;
  codeFile: string;
  icon: React.ReactNode;
}

const BLUEPRINT_NODES: BlueprintNode[] = [
  {
    id: 'photos',
    stepNum: '01',
    title: 'Photos / generated room',
    badge: 'GEMINI AI',
    runner: `Up to 12 User Photos (≤1600px JPEG) OR ${GEMINI_CONFIG.IMAGE_MODEL_NAME} Sample Room Generator`,
    whatItDoes:
      'Captures up to 12 room photos (resized client-side to max 1600px JPEG) or generates a realistic London rented room (student bedroom, studio, lounge, kitchen, etc.) via gemini-nano-banana-2.1 with server-side caching.',
    whyRationale:
      'Why resize client-side and offer room generation? Client resizing makes uploads 4× faster, while gemini-nano-banana-2.1 lets judges test live vision on realistic London rooms in one click.',
    codeFile: 'src/features/upload.tsx',
    icon: <Camera className="w-4 h-4" />,
  },
  {
    id: 'proxy',
    stepNum: '02',
    title: 'Server (key hidden)',
    badge: 'SERVER PROXY',
    runner: 'Express Backend Proxy (server.ts) + @google/genai SDK',
    whatItDoes:
      'Routes all vision, sample room generation, Dispatcher Note, and TTS requests through server-side Express endpoints (/api/gemini/*) with 3× exponential backoff on 429/503 errors.',
    whyRationale:
      'Why a server proxy? The GEMINI_API_KEY stays strictly in server memory (process.env.GEMINI_API_KEY) and is never exposed in browser code.',
    codeFile: 'server.ts',
    icon: <Shield className="w-4 h-4" />,
  },
  {
    id: 'vision',
    stepNum: '03',
    title: 'Gemini 4 Argon vision (JSON + boxes)',
    badge: 'GEMINI AI',
    runner: `${GEMINI_CONFIG.MODEL_NAME} (thinkingLevel: "${GEMINI_CONFIG.THINKING_LEVEL}", responseSchema)`,
    whatItDoes:
      'Detects every item, estimates W×D×H cm and weight kg against UK reference doors (≈ 200cm), and returns normalized [ymin, xmin, ymax, xmax] 2D bounding boxes drawn over the photo.',
    whyRationale:
      'Why Gemini 4 Argon here? Only a multimodal reasoning model can look at a room photo, spot a 200cm UK door frame, and infer realistic dimensions with visual bounding boxes.',
    codeFile: 'src/features/detection.ts',
    icon: <ScanLine className="w-4 h-4" />,
  },
  {
    id: 'sanity',
    stepNum: '04',
    title: 'Code sanity checks',
    badge: 'DETERMINISTIC CODE',
    runner: 'validateItemSanity() + mergeDuplicateItems() in TypeScript',
    whatItDoes:
      'Merges duplicate objects across photos ("merged"), highlights <70% confidence in amber ("Please check this size"), and blocks packing in red if any size is <5cm, >300cm, or >200kg.',
    whyRationale:
      'Why gate Gemini output in code? Vision models can misread occluded items. Deterministic bounds checks guarantee impossible dimensions never enter the 3D solver.',
    codeFile: 'src/features/detection.ts',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  {
    id: 'edit',
    stepNum: '05',
    title: 'You edit',
    badge: 'HUMAN IN CONTROL',
    runner: 'Simple Click-to-Edit Item Cards (ItemTable)',
    whatItDoes:
      'Displays simple item cards (name, W×D×H cm, weight, photo crop). Click any card to edit dimensions or add items manually before moving on.',
    whyRationale:
      'Why keep the human in control? Nothing is decided or booked behind your back. You confirm the exact cargo list before the solver runs.',
    codeFile: 'src/features/itemTable.tsx',
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  {
    id: 'packer',
    stepNum: '06',
    title: 'Packer on 10 vans',
    badge: 'DETERMINISTIC CODE',
    runner: 'packVanDeterministically() across all 10 UK Van Presets',
    whatItDoes:
      'Packs your confirmed items across all 10 UK vans (from Berlingo Micro Van to 18t Removal Lorry), cab-to-rear, heaviest first, enforcing a 2cm safety gap and ≥70% base support.',
    whyRationale:
      'Why not let Gemini pack? Because LLMs hallucinate 3D geometry. Deterministic TypeScript code computes exact centimetre coordinates.',
    codeFile: 'src/features/packer.ts',
    icon: <Box className="w-4 h-4" />,
  },
  {
    id: 'verifier',
    stepNum: '07',
    title: 'Verifier (6 checks)',
    badge: 'DETERMINISTIC CODE',
    runner: 'verifyVanPacking() & evaluateAllVans() Independent Auditor',
    whatItDoes:
      'Audits all 10 vans against 6 mathematical invariants: (1) Inside bounds, (2) Zero AABB overlap, (3) ≥70% base support, (4) Payload limit, (5) Fragile top-only, (6) 0 leftovers.',
    whyRationale:
      'Why separate the verifier from the packer? An independent auditor proves every physical law holds before stamping VERIFIED PASS ✓.',
    codeFile: 'src/features/verifier.ts',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  {
    id: 'cost',
    stepNum: '08',
    title: 'Cost engine (postcodes.io, fuel, hire, time)',
    badge: 'DETERMINISTIC CODE',
    runner: 'calculateVanTotalCost() + postcodes.io UK API (costEngine.ts)',
    whatItDoes:
      'Looks up UK postcodes via postcodes.io (straight-line × 1.3 road miles), confirms multi-trip counts by re-running the packer on leftovers, and calculates exact hire, fuel, congestion, stairs labour, and total cost.',
    whyRationale:
      'Why calculate total move cost in code? A Small van looks £15/day cheaper than a Medium van, but needing 2 trips doubles driving miles and time — deterministic code proves the true cheapest choice.',
    codeFile: 'src/features/costEngine.ts',
    icon: <Calculator className="w-4 h-4" />,
  },
  {
    id: 'scene3d',
    stepNum: '09',
    title: '3D van + Answer',
    badge: 'DETERMINISTIC CODE',
    runner: 'Three.js Cutaway Van (scene3d.tsx) + Big Answer Card & Receipt (results.tsx)',
    whatItDoes:
      'Shows the One Big Answer Card, printed till receipt, 10-van total cost chart, and realistic 3D cutaway van loading item by item through the rear doors.',
    whyRationale:
      'Why bind Three.js strictly to packer boxes? Every 3D mesh bounding box equals the verified packer box millimeter-for-millimeter.',
    codeFile: 'src/features/scene3d.tsx',
    icon: <Truck className="w-4 h-4" />,
  },
  {
    id: 'dispatcher',
    stepNum: '10',
    title: "Gemini Dispatcher's Note",
    badge: 'GEMINI AI',
    runner: `${GEMINI_CONFIG.MODEL_NAME} (thinkingLevel: "${GEMINI_CONFIG.THINKING_LEVEL}")`,
    whatItDoes:
      'Receives ONLY the verified packer, verifier, and cost JSON and writes 3 short sentences explaining why this van won, what failed in smaller vans, and 2 loading tips.',
    whyRationale:
      'Why use Gemini after the verifier? Code proves the numbers; Gemini turns the verified JSON into a clear human removal briefing.',
    codeFile: 'src/features/results.tsx',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    id: 'numcheck',
    stepNum: '11',
    title: 'Number check',
    badge: 'DETERMINISTIC CODE',
    runner: 'verifyDispatcherNoteNumbers() Regex & Set Auditor',
    whatItDoes:
      'Extracts every number in Gemini’s Dispatcher’s Note and checks it against the verified JSON. Stamps FIGURES CHECKED ✓ or greys out with UNVERIFIED FIGURES.',
    whyRationale:
      'Why audit the explanation text? Deterministic number verification guarantees zero invented figures ever reach the user.',
    codeFile: 'src/features/results.tsx',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    id: 'voice',
    stepNum: '12',
    title: 'Voice mode',
    badge: 'GEMINI AI',
    runner: `${GEMINI_CONFIG.TTS_MODEL_NAME} + ${GEMINI_CONFIG.MODEL_NAME} (6 Languages)`,
    whatItDoes:
      'Reads each loading step in sync with the 3D van in English, Polish, Romanian, Spanish, Portuguese, or Burmese (Gemini translates words only; numbers are inserted by code).',
    whyRationale:
      'Why Moving-Day Voice Mode? Hands-free multilingual audio lets helpers load the van step by step without looking at a screen.',
    codeFile: 'src/features/voiceMode.tsx',
    icon: <Volume2 className="w-4 h-4" />,
  },
];

interface HowItWorksProps {
  onBackToApp: () => void;
  onStartJudgeTour: () => void;
}

/**
 * Priority 6: "HOW IT WORKS" Technical Blueprint Page.
 * Interactive 12-node clickable architecture diagram + table of the 3 Gemini models used.
 */
export const HowItWorks: React.FC<HowItWorksProps> = ({
  onBackToApp,
  onStartJudgeTour,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('cost');

  const activeNode =
    BLUEPRINT_NODES.find((n) => n.id === selectedNodeId) || BLUEPRINT_NODES[7];

  return (
    <div className="space-y-6">
      {/* Top Blueprint Header */}
      <div className="manifest-sheet p-5 sm:p-6 bg-[#EBE3D5] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono font-bold uppercase text-[#9C7444]">
            TECHNICAL BLUEPRINT // GEMINI PROPOSES · YOU CONFIRM · CODE PROVES
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-display text-[#1B1A17] mt-1">
            HOW VANPACK 3D WORKS
          </h1>
          <p className="text-[17px] text-[#1B1A17]/85 max-w-2xl mt-1">
            Click any box in the 12-stage pipeline below to see what it does, which Gemini model or TypeScript module runs it, and why.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onStartJudgeTour}
            className="btn-hivis px-4 py-2.5 text-xs font-mono font-bold uppercase cursor-pointer"
          >
            ▶ Judge tour (60s)
          </button>
          <button
            type="button"
            onClick={onBackToApp}
            className="btn-manifest px-4 py-2.5 text-xs font-mono font-bold uppercase cursor-pointer"
          >
            ← Back to App
          </button>
        </div>
      </div>

      {/* Interactive 12-Box Architecture Diagram */}
      <div className="manifest-sheet overflow-hidden">
        <ManifestSheetHeader
          manifestNo="BLUEPRINT No. VP-ARCH-12"
          title="CLICKABLE ARCHITECTURE DIAGRAM (12 STAGES)"
          subtitle="Photos / generated room → Server (key hidden) → Gemini 4 Argon vision → Code sanity checks → You edit → Packer on 10 vans → Verifier (6 checks) → Cost engine → 3D van + Answer → Dispatcher's Note → Number check → Voice mode"
        />

        <div className="p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {BLUEPRINT_NODES.map((node, index) => {
              const isSelected = node.id === activeNode.id;
              const badgeStyle =
                node.badge === 'GEMINI AI'
                  ? 'bg-[#C8A26B] text-[#1B1A17]'
                  : node.badge === 'DETERMINISTIC CODE'
                  ? 'bg-[#2F6B3A] text-[#F4EFE6]'
                  : node.badge === 'HUMAN IN CONTROL'
                  ? 'bg-[#F2D21B] text-[#1B1A17]'
                  : 'bg-[#1B1A17] text-[#F4EFE6]';

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`text-left p-3.5 border-2 border-[#1B1A17] rounded-[2px] transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#F2D21B] shadow-[4px_4px_0_#1B1A17] -translate-y-0.5'
                      : 'bg-[#FAF6EE] hover:bg-[#C8A26B]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="font-mono text-xs font-extrabold px-1.5 py-0.5 bg-[#1B1A17] text-[#F4EFE6]">
                      STEP {node.stepNum}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border border-[#1B1A17] uppercase ${badgeStyle}`}
                    >
                      {node.badge}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="p-1.5 bg-[#EBE3D5] border border-[#1B1A17] shrink-0">
                      {node.icon}
                    </span>
                    <span className="font-display text-base font-bold text-[#1B1A17] leading-tight">
                      {node.title}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#1B1A17]/75 pt-1 border-t border-[#1B1A17]/20">
                    <span className="truncate">{node.codeFile}</span>
                    {index < BLUEPRINT_NODES.length - 1 && (
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Node 3-Bullet Technical Inspection Panel */}
          <div className="bg-[#EBE3D5] border-2 border-[#1B1A17] p-5 sm:p-6 space-y-4 shadow-[4px_4px_0_#1B1A17]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#1B1A17] pb-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-[#1B1A17] text-[#F2D21B] font-mono text-xs font-bold uppercase">
                  STAGE {activeNode.stepNum} / 12
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-[#1B1A17]">
                  {activeNode.title}
                </h2>
              </div>
              <span className="font-mono text-xs font-bold bg-[#FAF6EE] border border-[#1B1A17] px-2.5 py-1">
                MODULE: {activeNode.codeFile}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-4 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-[#9C7444]">
                  • 1. WHAT IT DOES
                </div>
                <p className="font-sans text-sm text-[#1B1A17] leading-relaxed">
                  {activeNode.whatItDoes}
                </p>
              </div>

              <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-4 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-[#9C7444]">
                  • 2. WHICH MODEL / CODE RUNS IT
                </div>
                <p className="font-mono text-xs font-bold text-[#1B1A17] leading-relaxed">
                  {activeNode.runner}
                </p>
                <div className="pt-1">
                  <span className="inline-block px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] text-[10px] font-bold uppercase">
                    {activeNode.badge}
                  </span>
                </div>
              </div>

              <div className="bg-[#F2D21B]/35 border-2 border-[#1B1A17] p-4 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-[#1B1A17]">
                  • 3. WHY THIS DESIGN
                </div>
                <p className="font-sans text-sm font-semibold text-[#1B1A17] leading-relaxed">
                  {activeNode.whyRationale}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PackingTapeDivider label="THE 3 GEMINI MODELS USED & THEIR ROLES" />

      {/* Table of the 3 Gemini Models Used */}
      <div className="manifest-sheet overflow-hidden">
        <ManifestSheetHeader
          manifestNo="SCHEDULE No. VP-MODELS-03"
          title="THE 3 GEMINI MODELS USED &amp; THEIR ROLES"
          subtitle="All money, distance, 3D coordinates, and time numbers come from deterministic TypeScript code — never guessed by the model."
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b-2 border-[#1B1A17] bg-[#1B1A17] text-[#F4EFE6] uppercase text-[11px]">
                <th className="py-3 px-4">GEMINI MODEL</th>
                <th className="py-3 px-4">ROLE IN VANPACK 3D</th>
                <th className="py-3 px-4">SERVER ENDPOINT</th>
                <th className="py-3 px-4">DETERMINISTIC VERIFICATION GUARD</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[#1B1A17] bg-[#FAF6EE]">
              <tr>
                <td className="py-3.5 px-4 font-bold text-[#1B1A17]">
                  <span className="px-2 py-0.5 bg-[#C8A26B] border border-[#1B1A17]">
                    {GEMINI_CONFIG.MODEL_NAME}
                  </span>
                  <div className="text-[10px] text-[#1B1A17]/75 mt-1">
                    thinkingLevel: &quot;medium&quot;
                  </div>
                </td>
                <td className="py-3.5 px-4 font-sans font-semibold text-sm">
                  Vision + Reasoning + Dispatcher&apos;s Note + Step Translation
                </td>
                <td className="py-3.5 px-4">
                  <div>POST /api/gemini/detect-items</div>
                  <div>POST /api/gemini/explain-plan</div>
                </td>
                <td className="py-3.5 px-4 font-sans text-sm">
                  Vision items checked by <code>validateItemSanity()</code> (5–300cm, ≤200kg). Dispatcher&apos;s Note checked by <code>verifyDispatcherNoteNumbers()</code> (<strong>FIGURES CHECKED ✓</strong>).
                </td>
              </tr>

              <tr>
                <td className="py-3.5 px-4 font-bold text-[#1B1A17]">
                  <span className="px-2 py-0.5 bg-[#F2D21B] border border-[#1B1A17]">
                    {GEMINI_CONFIG.IMAGE_MODEL_NAME}
                  </span>
                  <div className="text-[10px] text-[#1B1A17]/75 mt-1">
                    In-memory cached
                  </div>
                </td>
                <td className="py-3.5 px-4 font-sans font-semibold text-sm">
                  Sample Rooms Generator (10 London Rented Room Themes)
                </td>
                <td className="py-3.5 px-4">POST /api/gemini/generate-room</td>
                <td className="py-3.5 px-4 font-sans text-sm">
                  Generates a realistic London room photo (with a ~200cm UK door frame) and immediately passes it to <code>{GEMINI_CONFIG.MODEL_NAME}</code> for measurement. Falls back to built-in rooms if offline.
                </td>
              </tr>

              <tr>
                <td className="py-3.5 px-4 font-bold text-[#1B1A17]">
                  <span className="px-2 py-0.5 bg-[#2F6B3A] text-[#F4EFE6] border border-[#1B1A17]">
                    {GEMINI_CONFIG.TTS_MODEL_NAME}
                  </span>
                  <div className="text-[10px] text-[#1B1A17]/75 mt-1">
                    24kHz WAV + speechSynthesis fallback
                  </div>
                </td>
                <td className="py-3.5 px-4 font-sans font-semibold text-sm">
                  Moving-Day Voice Mode (6 Languages: EN, PL, RO, ES, PT, MY)
                </td>
                <td className="py-3.5 px-4">POST /api/gemini/voice-step</td>
                <td className="py-3.5 px-4 font-sans text-sm">
                  Reads each loading step in sync with the 3D van. Gemini translates words only; all dimensions and weights are inserted verbatim by code.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
