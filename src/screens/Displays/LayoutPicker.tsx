import React from 'react';
import { formatNumber } from '../../utils/format';
import type { SlotCounts } from '../../utils/slotCounts';
import type { DisplayLayout } from './api';
import { LAYOUT_WORD } from './status';

/** The six slot types the summary can show (PRD v1.6b AC-39), in the PRD's order, with the TV's words. */
export const TYPE_WORDS: { code: string; word: string }[] = [
  { code: 'SUV', word: 'SUV' },
  { code: 'CSUV', word: 'Compact SUV' },
  { code: 'SEDAN', word: 'Sedan' },
  { code: 'HATCHBACK', word: 'Hatchback' },
  { code: 'TWO_WHEELER', word: 'Two-wheeler' },
  { code: 'EV', word: 'EV' },
];
export const typeWord = (code: string): string => TYPE_WORDS.find((t) => t.code === code)?.word || code;

/** UX decision 1: Summary + slot cards has room for a 2-row grid above the cards. */
export const SUMMARY_CARDS_MAX_LEVELS = 2;

const OPTIONS: { id: DisplayLayout; text: string }[] = [
  { id: 'SLOT_CARDS', text: 'Each slot as a card, vacant first. Best on a ramp or level where drivers pick an exact slot.' },
  { id: 'SUMMARY', text: 'Free spaces by basement and vehicle type. Best at the main gate. No slot codes or plates on screen.' },
  { id: 'SUMMARY_CARDS', text: 'The summary on top, then 8 slot cards. For a basement entrance that also wants exact slots.' },
];

export function tooManyForCards(levels: number): string {
  return `Fits up to 2 basements above the cards. This display covers ${formatNumber(levels)} — use Summary.`;
}

/** What the chosen layout will show for this selection (UX E1 info line). */
export function layoutInfo(layout: DisplayLayout, counts: SlotCounts): string {
  const n = counts.rows.length;
  if (!counts.total) return '';
  if (layout === 'SLOT_CARDS') return 'The screen shows 12 slot cards, vacant first.';
  if (layout === 'SUMMARY_CARDS') return n > 1 ? `This display covers ${n} basements, so a small grid sits above 8 slot cards.` : 'This display covers one basement, so a row of tiles sits above 8 slot cards.';
  return n > 1
    ? `This display covers ${n} basements, so the screen shows a grid: one row per basement, one column per vehicle type.`
    : 'This display covers one basement, so the screen shows large tiles, one per vehicle type.';
}

export interface LayoutPickerProps {
  value: DisplayLayout;
  onChange: (layout: DisplayLayout) => void;
  /** The counts of this selection (hidden slots removed), from countSlots. */
  counts: SlotCounts;
  /** Read-only (view-as, All sites, no edit right; AC-47). */
  readOnly?: string | null;
  error?: string;
}

/** A small picture of each layout (decorative): cards, a grid, or a grid over cards. */
const Picture: React.FC<{ id: DisplayLayout }> = ({ id }) => (
  <span className={`pf-layout-pic pf-layout-pic--${id.toLowerCase()}`} aria-hidden="true">
    {id !== 'SLOT_CARDS' && (
      <span className="pf-layout-pic-grid">
        {Array.from({ length: id === 'SUMMARY' ? 9 : 6 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
    )}
    {id !== 'SUMMARY' && (
      <span className="pf-layout-pic-cards">
        {Array.from({ length: id === 'SLOT_CARDS' ? 6 : 4 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
    )}
  </span>
);

/**
 * Layout (003 F10, UX E1; AC-38, AC-47): three radio cards — Slot cards (Default), Summary,
 * Summary + slot cards — with what this display will show, the vehicle types found (and the
 * columns left out) and the counting rule. Summary + slot cards is offered for up to 2 basements.
 */
export const LayoutPicker: React.FC<LayoutPickerProps> = ({ value, onChange, counts, readOnly, error }) => {
  const levels = counts.rows.length;
  const cardsTooMany = levels > SUMMARY_CARDS_MAX_LEVELS;
  const found = counts.types.map(typeWord);
  const left = TYPE_WORDS.filter((t) => !counts.types.includes(t.code as never)).map((t) => t.word);
  const info = layoutInfo(value, counts);
  return (
    <fieldset className="pf-fieldset pf-stack" aria-describedby={['pf-layout-info', error ? 'pf-layout-error' : ''].filter(Boolean).join(' ')}>
      <legend className="pf-field-label">Layout</legend>
      <div className="pf-layout-cards">
        {OPTIONS.map((o) => {
          const disabled = !!readOnly || (o.id === 'SUMMARY_CARDS' && cardsTooMany && value !== 'SUMMARY_CARDS');
          const noteId = o.id === 'SUMMARY_CARDS' && cardsTooMany ? 'pf-layout-cards-note' : undefined;
          return (
            <label key={o.id} className={`pf-layout-card${value === o.id ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} title={readOnly || undefined}>
              <input
                type="radio"
                name="pf-layout"
                value={o.id}
                checked={value === o.id}
                disabled={disabled}
                aria-describedby={noteId}
                onChange={() => onChange(o.id)}
              />
              <span className="pf-layout-dot" aria-hidden="true" />
              <Picture id={o.id} />
              <span className="pf-layout-card-text">
                <span className="pf-layout-card-name">
                  {LAYOUT_WORD[o.id]}
                  {o.id === 'SLOT_CARDS' && <span className="pf-chip pf-chip--neutral">Default</span>}
                </span>
                <span className="pf-layout-card-desc">{o.text}</span>
                {noteId && (
                  <span className="pf-layout-card-note" id={noteId}>
                    {tooManyForCards(levels)}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div id="pf-layout-info" className="pf-stack pf-stack--tight">
        {info && <p className="pf-field-help">{info}</p>}
        {value !== 'SLOT_CARDS' && counts.total > 0 && (
          <p className="pf-field-help">
            <b>Vehicle types found:</b> {found.join(', ') || 'none'}
            {left.length > 0 && ` (no ${left.join(', ')} column — none in this selection)`}. Vacant slots only. Reserved, maintenance and hidden slots aren’t counted.
          </p>
        )}
      </div>
      {error && (
        <p className="pf-field-error" id="pf-layout-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
};
