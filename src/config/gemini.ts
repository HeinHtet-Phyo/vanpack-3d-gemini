/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized Gemini configuration for VanPack 3D.
 * All references to model names and thinking levels originate from this single file.
 */
export const GEMINI_CONFIG = {
  /** The model used for photo vision analysis, translation, and Dispatcher's Note */
  MODEL_NAME: 'gemini-4-argon',
  /** The model used for generating sample London rented rooms */
  IMAGE_MODEL_NAME: 'gemini-nano-banana-2.1',
  /** The model used for Moving-Day Voice Mode text-to-speech */
  TTS_MODEL_NAME: 'gemini-3.8-flash-tts',
  /** The thinking level parameter for balanced reasoning */
  THINKING_LEVEL: 'medium',
  /** Maximum retry attempts for transient server errors (429 / 503) */
  MAX_RETRIES: 3,
  /** Initial delay for exponential backoff in milliseconds */
  INITIAL_RETRY_DELAY_MS: 1500,
  /** Client-facing endpoints for server-side proxy */
  ENDPOINTS: {
    DETECT_ITEMS: '/api/gemini/detect-items',
    GENERATE_ROOM: '/api/gemini/generate-room',
    EXPLAIN_PLAN: '/api/gemini/explain-plan',
    VOICE_STEP: '/api/gemini/voice-step',
  },
} as const;

/**
 * Structured client-side telemetry logger for Gemini interactions.
 * Logs prompt, model configuration, and response output directly to browser console.
 *
 * @param action - Descriptive label for the call (e.g. 'Photo Item Detection')
 * @param payload - Request data or prompt summary
 * @param result - Response data or error
 */
export function logGeminiTelemetry(action: string, payload: any, result: any) {
  if (typeof console !== 'undefined' && console.groupCollapsed) {
    console.groupCollapsed(`[VanPack 3D Telemetry] Gemini: ${action}`);
    console.log('Primary Model:', GEMINI_CONFIG.MODEL_NAME);
    console.log('TTS Model:', GEMINI_CONFIG.TTS_MODEL_NAME);
    console.log('Thinking Level:', GEMINI_CONFIG.THINKING_LEVEL);
    console.log('Request Payload / Prompt:', payload);
    console.log('Response / Output:', result);
    console.groupEnd();
  } else {
    console.log(`[Gemini Telemetry: ${action}]`, { payload, result });
  }
}
