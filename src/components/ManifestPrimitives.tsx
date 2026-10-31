/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ItemCategory } from '../types';

/**
 * Earthy, industrial removal-manifest colour chips for categories (no neon blue or purple).
 */
export const MANIFEST_CATEGORY_COLORS: Record<ItemCategory, string> = {
  Furniture: '#8B5A2B',   // Timber Brown
  Boxes: '#C8A26B',       // Kraft Cardboard
  Appliances: '#5C6B5E',  // Industrial Olive Grey
  Electronics: '#3E4A52', // Charcoal Slate
  Luggage: '#9E473B',     // Terracotta Strap
  Misc: '#7A6A53',        // Burlap Sack
};

/**
 * Subtle hand-drawn SVG ghost doodle for leftover ("LEFT BEHIND") items.
 * No emoji icons — strictly ink line-art.
 */
export const GhostDoodle: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M6 24.5C6 16.5 6.2 12 6.5 10.2C7.1 5.6 10.2 3.5 14.2 3.5C18.3 3.5 21.1 5.9 21.6 10.5C21.9 13.1 22 17.8 22 24.5C20.2 22.8 19.1 22.8 17.8 24.5C16.4 22.8 15.2 22.8 14 24.5C12.7 22.8 11.4 22.8 10.1 24.5C8.8 22.8 7.5 22.8 6 24.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="11.5" cy="11.5" r="1.4" fill="currentColor" />
    <circle cx="16.8" cy="11.5" r="1.4" fill="currentColor" />
    <path
      d="M12.2 15.8C13.3 15.1 14.9 15.1 16 15.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Brown packing tape section divider, slightly rotated (-1deg),
 * with printed "FRAGILE · THIS WAY UP" stencil text.
 */
export const PackingTapeDivider: React.FC<{ label?: string }> = ({ label }) => (
  <div
    className="packing-tape py-1.5 px-4 my-4 overflow-hidden select-none"
    role="separator"
  >
    <div className="flex items-center justify-between gap-6 whitespace-nowrap font-display text-xs sm:text-sm tracking-[0.18em] text-[#F4EFE6]/90">
      <span>FRAGILE · THIS WAY UP ↑</span>
      <span className="hidden sm:inline">
        {label ? `/// ${label.toUpperCase()} ///` : 'HANDLE WITH CARE · DO NOT CRUSH'}
      </span>
      <span className="hidden md:inline">FRAGILE · THIS WAY UP ↑</span>
      <span>KEEP DRY · MANIFEST VP-0031</span>
    </div>
  </div>
);

/**
 * Manifest Sheet Header Strip with "MANIFEST No. VP-0031", date, and form reference.
 */
export const ManifestSheetHeader: React.FC<{
  manifestNo?: string;
  title: string;
  subtitle?: string;
  rightBadge?: React.ReactNode;
}> = ({ manifestNo = 'MANIFEST No. VP-0031', title, subtitle, rightBadge }) => (
  <div className="border-b-2 border-[#1B1A17] bg-[#C8A26B] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-[#1B1A17]">
        <span className="font-bold bg-[#F4EFE6] px-1.5 py-0.5 border border-[#1B1A17]">
          {manifestNo}
        </span>
        <span>DATE: 31 OCT · LONDON DEPOT</span>
        <span className="hidden sm:inline">FORM: DETERMINISTIC-3D-REV.4</span>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold font-display text-[#1B1A17] tracking-wide pt-0.5">
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs text-[#1B1A17]/85 font-sans">{subtitle}</p>
      )}
    </div>
    {rightBadge && <div className="shrink-0">{rightBadge}</div>}
  </div>
);
