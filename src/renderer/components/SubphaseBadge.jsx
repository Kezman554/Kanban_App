import React from 'react';
import { paletteFor } from '../utils/palette';

// Subphase badge: filled with palette[subphase.id mod 12]
const SubphaseBadge = ({ subphase }) => (
  <span
    className="flex-shrink-0 min-w-[2.25rem] h-7 px-2 rounded-lg border-[1.5px] border-card-line text-card-ink text-sm font-bold flex items-center justify-center"
    style={{ backgroundColor: paletteFor(subphase.id).fill }}
  >
    {subphase.short_name || '—'}
  </span>
);

export default SubphaseBadge;
