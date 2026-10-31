# VanPack 3D — Architecture & Design Specification (`DESIGN.md`)

## 1. Purpose & Core Principle
**VanPack 3D** helps renters and students in London moving flats choose the smallest, cheapest van that fits their belongings, proving the answer with deterministic TypeScript code and displaying the loading plan in a realistic interactive 3D cutaway van.

### Core Principle: *"Gemini Proposes · You Confirm · Code Proves"*
- **Gemini 4 Argon (`gemini-4-argon`, `thinkingLevel: "medium"`)** is used strictly for:
  1. Extracting candidate furniture/box items and estimated dimensions from room photos (`POST /api/gemini/detect-items`).
  2. Writing the 3-sentence handwritten **Dispatcher's Note** + 2 loading tips on the Delivery Ticket (`POST /api/gemini/explain-plan`).
- **Deterministic TypeScript Code** computes **100%** of volumes, 3D placements, rotations, 2cm safety clearances, ≥70% base support checks, fragile protection checks, payload limits, and £ hire savings.
- **User Control**: The user reviews and edits all item dimensions, weights, and flags before packing, and code audits every number in Gemini's Dispatcher's Note against the verified JSON.

---

## 2. Visual Identity: *"The Removal Manifest"*
- **Palette**:
  - Warm off-white paper `#F4EFE6` with subtle SVG fractalNoise paper grain
  - Kraft cardboard `#C8A26B` and darker kraft `#9C7444` for panels, headers, and brown packing tape dividers
  - Ink black `#1B1A17` for typography and `2px solid` borders
  - Hi-vis safety yellow `#F2D21B` for the primary action on each screen (`4px 4px 0 #1B1A17` hard offset shadow)
  - Stamp red `#C2362B` for failures/leftovers (`FAIL · REJECTED` / `LEFT BEHIND` / `UNVERIFIED FIGURES`)
  - Stamp green `#2F6B3A` for verified passes (`PASS · INSPECTED ✓` / `FIGURES CHECKED ✓`)
- **Typography**:
  - Headings & stamps: `"Big Shoulders Stencil Display"` (bold uppercase crate stencil)
  - Body: `"IBM Plex Sans"`
  - Dimensions, weights, coordinates, and prices: `"IBM Plex Mono"` (`tabular-nums`)
  - Dispatcher's Note: `"Caveat"` (handwritten note clipped to the Delivery Ticket with a drawn SVG paperclip)

---

## 3. Feature Modules (One File Per Feature)

| File | Responsibility |
| :--- | :--- |
| `src/config/gemini.ts` | Centralized configuration for `gemini-4-argon` (`thinkingLevel: "medium"`), retry constants, and structured console telemetry logger (`logGeminiTelemetry`). |
| `src/data/demoMove.ts` | Two verified preset inventories: **1-Bed London Student Flat** (13 lines, 31 pieces → Luton Van £95, 0 leftovers) and **Small Studio Flat Move** (8 lines, 15 pieces → Small Van fails with 2 leftovers, Medium Van £65 passes and saves £30 vs Luton). |
| `src/features/upload.tsx` | Drag-and-drop upload for up to 6 photos (resized client-side to max `1600px` JPEG), live device camera viewfinder capture, sample room survey generator, and per-photo status cards (`Measuring…` / `✓ N items found` / `✗ failed` with individual `Retry` button). |
| `src/features/detection.ts` | Rate-limited single-photo detection client (`detectItemsFromSinglePhoto`), strict JSON validation with retry, cross-photo duplicate item merger (`mergeDuplicateItems`), and deterministic sanity check (`validateItemSanity`: `5–300cm`, `1–200kg`). |
| `src/features/itemTable.tsx` | Printed Removal Inventory Sheet (`STEP 02`) with live piece/volume/weight totals, category filter tabs, inline editing, pencil-style confidence marks (`✓` / `?` / `!`), `"merged duplicate"` badges, hover reasoning tooltips, and red sanity error flags. |
| `src/features/vans.ts` | UK removal van fleet specifications (Small £45, Medium £65, Large £80, Luton £95), localStorage persistence, and plain-English leftover failure reason generator (`getLeftoverReason`). |
| `src/features/packer.ts` | Deterministic 3D extreme-point bin-packing engine with `2cm` inter-item clearance (`GAP_CM = 2`), `≥70%` 2D base support verification (`MIN_SUPPORT_RATIO = 0.7`), fragile top-only constraints, and human-readable loading instructions. |
| `src/features/verifier.ts` | Independent 6-point mathematical verifier auditing every van's packing output and recommending the smallest, cheapest van that passes all 6 checks with 0 leftovers. |
| `src/features/scene3dModels.ts` | Procedural Three.js cutaway panel van builder (cab, windscreen, wheels, wheel arches, ribbed steel walls, honey-oak plywood floor, 50cm rulers, open rear doors, tarmac + raised pavement) and 11 distinct procedural 3D item builders whose outer group matches the exact `[w_cm, h_cm, d_cm]` packer bounding box. |
| `src/features/scene3d.tsx` | Interactive Three.js + OrbitControls 3D loading scene with rear-door slide-and-settle animation, auto-play on first view, slow cinematic pull-back, camera presets (`Rear doors`, `Side cutaway`, `Top-down plan`), `Show Proof in 3D` overlay, 3-stamp inspection card, and automatic `<40 FPS` AO / `<30 FPS` Low Detail fallback. |
| `src/features/results.tsx` | Delivery Ticket (`"BOOK THE MEDIUM VAN · SAVE £30 vs LUTON"`), handwritten `gemini-4-argon` Dispatcher's Note with deterministic number verification (`FIGURES CHECKED ✓` / `UNVERIFIED FIGURES`), Copy Load Sheet & Print Manifest actions, Hire-Company Fleet Board, and 6 staggered rubber-stamped verifier checks. |
| `src/features/doorwayModal.tsx` | Deterministic UK doorway clearance gauge (`76×198cm` standard flat door, `80×203cm` front door, `68×195cm` narrow corridor) testing every 2D cross-section of each item. |
| `src/App.tsx` | Top-level workflow state, inline `"Replace current list?"` confirmation when loading demos over edited items, and the automated **`60-second tour`** for judges. |
| `server.ts` | Express backend serving `POST /api/gemini/detect-items` and `POST /api/gemini/explain-plan` using `@google/genai` without ever exposing `GEMINI_API_KEY` to the client. |
