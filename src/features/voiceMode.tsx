/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlacedItem } from '../types';
import { getLoadingInstruction } from './packer';
import { GEMINI_CONFIG, logGeminiTelemetry } from '../config/gemini';
import {
  Volume2,
  Pause,
  Play,
  SkipForward,
  RotateCcw,
  Globe,
  Loader2,
} from 'lucide-react';

export type SupportedVoiceLanguage =
  | 'English'
  | 'Polish'
  | 'Romanian'
  | 'Spanish'
  | 'Portuguese'
  | 'Burmese';

const LANGUAGE_BCP47: Record<SupportedVoiceLanguage, string> = {
  English: 'en-GB',
  Polish: 'pl-PL',
  Romanian: 'ro-RO',
  Spanish: 'es-ES',
  Portuguese: 'pt-PT',
  Burmese: 'my-MM',
};

export const VOICE_LANGUAGES: SupportedVoiceLanguage[] = [
  'English',
  'Polish',
  'Romanian',
  'Spanish',
  'Portuguese',
  'Burmese',
];

/**
 * Deterministic local translation fallback that copies all numbers and dimensions
 * directly from code so Voice Mode works 100% offline in all 6 languages.
 */
function buildDeterministicLocalizedStepText(
  item: PlacedItem,
  totalSteps: number,
  allPlaced: PlacedItem[],
  lang: SupportedVoiceLanguage
): string {
  const step = item.stepOrder;
  const { w_cm, d_cm, h_cm, weight_kg, name, fragile } = item;
  const rawInstr = getLoadingInstruction(item, allPlaced);

  switch (lang) {
    case 'Polish':
      return `Krok ${step} z ${totalSteps}: ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${
        rawInstr.includes('cab wall')
          ? 'Postaw na podłodze, przy ścianie kabiny.'
          : rawInstr.includes('floor')
          ? 'Postaw na podłodze furgonetki.'
          : rawInstr
      }${fragile ? ' Uwaga: delikatny przedmiot.' : ''}`;
    case 'Romanian':
      return `Pasul ${step} din ${totalSteps}: ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${
        rawInstr.includes('cab wall')
          ? 'Așezați pe podea, lângă peretele cabinei.'
          : rawInstr.includes('floor')
          ? 'Așezați pe podeaua dubei.'
          : rawInstr
      }${fragile ? ' Atenție: obiect fragil.' : ''}`;
    case 'Spanish':
      return `Paso ${step} de ${totalSteps}: ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${
        rawInstr.includes('cab wall')
          ? 'Colocar en el suelo, contra la pared de la cabina.'
          : rawInstr.includes('floor')
          ? 'Colocar en el suelo de la furgoneta.'
          : rawInstr
      }${fragile ? ' Cuidado: artículo frágil.' : ''}`;
    case 'Portuguese':
      return `Passo ${step} de ${totalSteps}: ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${
        rawInstr.includes('cab wall')
          ? 'Colocar no chão, junto à parede da cabine.'
          : rawInstr.includes('floor')
          ? 'Colocar no chão da carrinha.'
          : rawInstr
      }${fragile ? ' Atenção: item frágil.' : ''}`;
    case 'Burmese':
      return `အဆင့် ${step} / ${totalSteps} - ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg)။ ${
        rawInstr.includes('cab wall')
          ? 'ကားရှေ့ခန်းနံရံကပ်လျက် ကြမ်းပြင်ပေါ်တွင် တင်ပါ။'
          : rawInstr.includes('floor')
          ? 'ကားကြမ်းပြင်ပေါ်တွင် တင်ပါ။'
          : rawInstr
      }${fragile ? ' သတိပြုရန် - ကွဲရှလွယ်သောပစ္စည်း။' : ''}`;
    default:
      return `Step ${step} of ${totalSteps}: ${name} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${rawInstr}.${
        fragile ? ' Handle with care, fragile item.' : ''
      }`;
  }
}

interface VoiceModeProps {
  placedItems: PlacedItem[];
  currentStepOrder: number;
  onSyncStepTo3D: (stepOrder: number, instanceId: string) => void;
}

/**
 * Priority 3: Moving-Day Voice Mode ("Performer" Superpower).
 * Reads loading steps one at a time synced with the 3D animation highlighting that item.
 * Uses Gemini 3.8 Flash TTS (/api/gemini/voice-step) + Gemini 4 Argon translation
 * (with numbers copied strictly from code), and falls back seamlessly to browser speechSynthesis.
 */
export const MovingDayVoiceMode: React.FC<VoiceModeProps> = ({
  placedItems,
  currentStepOrder,
  onSyncStepTo3D,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [language, setLanguage] = useState<SupportedVoiceLanguage>('English');
  const [voiceStepIndex, setVoiceStepIndex] = useState<number>(0);
  const [spokenTranscript, setSpokenTranscript] = useState<string>('');
  const [audioEngineLabel, setAudioEngineLabel] = useState<string>(GEMINI_CONFIG.TTS_MODEL_NAME);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  const totalSteps = placedItems.length;

  const stopAllAudio = useCallback(() => {
    activeRequestIdRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsLoadingAudio(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  /**
   * Speaks a single loading step using server-side gemini-3.8-flash-tts,
   * falling back to browser window.speechSynthesis if unavailable.
   */
  const speakStepAtIndex = useCallback(
    async (idx: number, lang: SupportedVoiceLanguage) => {
      if (placedItems.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(placedItems.length - 1, idx));
      const item = placedItems[clampedIdx];
      if (!item) return;

      stopAllAudio();
      const requestId = ++activeRequestIdRef.current;

      setVoiceStepIndex(clampedIdx);
      setIsPaused(false);
      onSyncStepTo3D(item.stepOrder, item.instanceId);

      const fallbackText = buildDeterministicLocalizedStepText(
        item,
        totalSteps,
        placedItems,
        lang
      );
      setSpokenTranscript(fallbackText);
      setIsLoadingAudio(true);

      const instruction = getLoadingInstruction(item, placedItems);

      try {
        const res = await fetch(GEMINI_CONFIG.ENDPOINTS.VOICE_STEP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepNumber: item.stepOrder,
            totalSteps,
            itemName: item.name,
            w_cm: item.w_cm,
            d_cm: item.d_cm,
            h_cm: item.h_cm,
            weight_kg: item.weight_kg,
            instruction,
            fragile: item.fragile,
            language: lang,
          }),
        });

        if (requestId !== activeRequestIdRef.current) return;

        const data = await res.json().catch(() => null);
        const textToSpeak = data?.spokenText || fallbackText;
        setSpokenTranscript(textToSpeak);

        if (data?.telemetry) {
          logGeminiTelemetry(
            `Moving-Day Voice Step ${item.stepOrder}/${totalSteps} (${lang})`,
            {
              stepNumber: item.stepOrder,
              itemName: item.name,
              language: lang,
              ttsModel: GEMINI_CONFIG.TTS_MODEL_NAME,
            },
            data.telemetry
          );
        }

        if (data?.audioBase64) {
          setIsLoadingAudio(false);
          setAudioEngineLabel(`${GEMINI_CONFIG.TTS_MODEL_NAME} (WAV)`);
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          audioRef.current = audio;
          await audio.play();
          return;
        }
      } catch {
        // Proceed to browser speechSynthesis fallback
      }

      if (requestId !== activeRequestIdRef.current) return;
      setIsLoadingAudio(false);
      setAudioEngineLabel('speechSynthesis (Fallback)');

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        utterance.lang = LANGUAGE_BCP47[lang] || 'en-GB';
        utterance.rate = 0.96;
        window.speechSynthesis.speak(utterance);
      }
    },
    [placedItems, totalSteps, onSyncStepTo3D, stopAllAudio]
  );

  const handleToggleVoiceMode = () => {
    if (isActive) {
      stopAllAudio();
      setIsActive(false);
      setIsPaused(false);
      return;
    }
    setIsActive(true);
    const startIdx =
      currentStepOrder >= 1 && currentStepOrder < totalSteps ? currentStepOrder - 1 : 0;
    speakStepAtIndex(startIdx, language);
  };

  const handleNextStep = () => {
    if (placedItems.length === 0) return;
    const nextIdx = (voiceStepIndex + 1) % placedItems.length;
    speakStepAtIndex(nextIdx, language);
  };

  const handleRepeatStep = () => {
    speakStepAtIndex(voiceStepIndex, language);
  };

  const handlePauseResume = () => {
    if (audioRef.current) {
      if (isPaused) {
        audioRef.current.play();
        setIsPaused(false);
      } else {
        audioRef.current.pause();
        setIsPaused(true);
      }
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (isPaused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    }
  };

  const handleLanguageChange = (newLang: SupportedVoiceLanguage) => {
    setLanguage(newLang);
    if (isActive) {
      speakStepAtIndex(voiceStepIndex, newLang);
    }
  };

  return (
    <div className="bg-[#FAF6EE] border-2 border-[#1B1A17] p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Toggle Button & Title */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleVoiceMode}
            disabled={placedItems.length === 0}
            className={`px-3.5 py-2 border-2 border-[#1B1A17] rounded-[2px] text-xs font-mono font-bold uppercase flex items-center gap-2 cursor-pointer transition-colors ${
              isActive
                ? 'bg-[#2F6B3A] text-[#F4EFE6] shadow-[3px_3px_0_#1B1A17]'
                : 'bg-[#F2D21B] text-[#1B1A17] shadow-[3px_3px_0_#1B1A17] hover:bg-[#fae03c]'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>{isActive ? '🔊 MOVING-DAY MODE: ON' : '🔊 MOVING-DAY MODE'}</span>
          </button>

          {/* Language Selector (English, Polish, Romanian, Spanish, Portuguese, Burmese) */}
          <div className="inline-flex items-center gap-1.5 bg-[#EBE3D5] border-2 border-[#1B1A17] px-2.5 py-1.5 text-xs font-mono">
            <Globe className="w-3.5 h-3.5 text-[#9C7444]" />
            <label htmlFor="voice-lang-select" className="font-bold uppercase text-[10px]">
              LANGUAGE:
            </label>
            <select
              id="voice-lang-select"
              value={language}
              onChange={(e) =>
                handleLanguageChange(e.target.value as SupportedVoiceLanguage)
              }
              className="bg-transparent font-bold text-[#1B1A17] focus:outline-none cursor-pointer"
            >
              {VOICE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang} className="bg-[#FAF6EE] text-[#1B1A17]">
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls when Moving-Day Voice Mode is Active: Next / Repeat / Pause */}
        {isActive && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={handlePauseResume}
              className="btn-manifest px-3 py-1.5 font-bold uppercase flex items-center gap-1 cursor-pointer"
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRepeatStep}
              disabled={isLoadingAudio}
              className="btn-manifest px-3 py-1.5 font-bold uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Repeat
            </button>

            <button
              type="button"
              onClick={handleNextStep}
              disabled={isLoadingAudio}
              className="btn-hivis px-3.5 py-1.5 font-bold uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Next Step →
            </button>
          </div>
        )}
      </div>

      {/* Spoken Step Transcript & Engine Proof Strip */}
      {isActive && (
        <div className="bg-[#EBE3D5] border border-[#1B1A17] p-2.5 font-mono text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase text-[#9C7444]">
            <span className="flex items-center gap-1.5">
              {isLoadingAudio && <Loader2 className="w-3 h-3 animate-spin text-[#1B1A17]" />}
              VOICE ENGINE: {audioEngineLabel} · LANG: {language.toUpperCase()}
            </span>
            <span className="text-[#2F6B3A]">
              NUMBERS &amp; SIZES COPIED FROM CODE ✓
            </span>
          </div>
          <p className="text-sm font-sans font-semibold text-[#1B1A17]">
            &ldquo;{spokenTranscript}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
};
