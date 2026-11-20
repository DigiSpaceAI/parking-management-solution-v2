// 005 F1: pure logic of the Inventory slot editor (select models, required fields, save payload, server errors).
// Every list, label and code comes from slotFields.ts: nothing is listed twice here.
import { optionsFor, isCode } from './slotFields.ts';
import type { SlotField } from './slotFields.ts';

export type EditorField = 'slotNumber' | 'basement' | 'floorLocation' | 'slotType' | 'height' | 'parkingType' | 'allocation' | 'status';
const EDITOR_FIELDS: EditorField[] = ['slotNumber', 'basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation', 'status'];
/** Required on create (design: slot number, level, floor location, vehicle type, height, parking type, allocation). Status defaults to VACANT. */
export const REQUIRED_ON_CREATE: EditorField[] = ['slotNumber', 'basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation'];

type Loose = { [key: string]: unknown };
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** The "+ Add Slot" form: empty (AC-14). Only the status starts as VACANT, which is the server's default too. */
export function emptyNewSlot(): { [F in EditorField]: string } {
  return { slotNumber: '', basement: '', floorLocation: '', slotType: '', height: '', parkingType: '', allocation: '', status: 'VACANT' };
}

export interface SelectOption { value: string; label: string; disabled?: boolean }
/**
 * Options of one editor select, built from slotFields.
 * - empty value -> a disabled "Choose…" placeholder is first and selected;
 * - a stored value that is not a code (legacy) -> it is the first option, selected, labelled "<value> (old — choose a new one)";
 * - never a silent fall back to the first entry of the list.
 */
export function selectModel(field: SlotField, current: unknown): { value: string; options: SelectOption[] } {
  const cur = text(current);
  const list: SelectOption[] = optionsFor(field).map((o) => ({ value: o.code, label: o.label }));
  if (cur === '') return { value: '', options: ([{ value: '', label: 'Choose…', disabled: true }] as SelectOption[]).concat(list) };
  if (!isCode(field, cur)) return { value: cur, options: ([{ value: cur, label: cur + ' (old — choose a new one)' }] as SelectOption[]).concat(list) };
  return { value: cur, options: list };
}

/** Required fields still empty on a NEW slot. An existing slot is never blocked here: the server checks changed fields only. */
export function missingRequired(slot: object, isNew: boolean): EditorField[] {
  if (!isNew) return [];
  const s = slot as Loose;
  return REQUIRED_ON_CREATE.filter((f) => text(s[f]).trim() === '');
}

/**
 * The body of /slots/save. A new slot never carries an id (the server makes it). Empty editor fields are left out, so an
 * existing slot with a missing value is not "changed" to ''. Slot number is trimmed and upper-cased. Dimensions go as text.
 */
export function buildSavePayload(slot: object, dims: { lengthM: string; palletLevel: string }): Loose {
  const out: Loose = { ...(slot as Loose) };
  for (const f of EDITOR_FIELDS) if (text(out[f]).trim() === '') delete out[f];
  if (!out.id) delete out.id;
  if (out.slotNumber !== undefined) out.slotNumber = text(out.slotNumber).trim().toUpperCase();
  out.lengthM = dims.lengthM.trim() === '' ? null : dims.lengthM.trim();
  out.palletLevel = dims.palletLevel.trim() === '' ? null : dims.palletLevel.trim();
  return out;
}

export interface SaveErrorView {
  fieldErrors: { [field: string]: string };
  dimErrors: { lengthM?: string; palletLevel?: string };
  /** Shown at the top of the form only when no field can carry it. */
  banner: string | null;
}
/** Where a failed /slots/save is shown: 409 next to Slot number, 400 ERR_VALIDATION next to data.field, dimension errors as before. */
export function mapSaveError(status: number, data: unknown): SaveErrorView {
  const d = (data && typeof data === 'object' ? data : {}) as Loose;
  const message = text(d.message) || 'Failed to save slot';
  const view: SaveErrorView = { fieldErrors: {}, dimErrors: {}, banner: null };
  if (status === 409 || d.errorCode === 'ERR_DUPLICATE_SLOT') {
    view.fieldErrors.slotNumber = message;
  } else if (d.errorCode === 'ERR_VALIDATION' && EDITOR_FIELDS.indexOf(d.field as EditorField) !== -1) {
    view.fieldErrors[d.field as string] = message;
  } else if (d.errors && typeof d.errors === 'object') {
    const e = d.errors as Loose;
    if (e.lengthM) view.dimErrors.lengthM = text(e.lengthM);
    if (e.palletLevel) view.dimErrors.palletLevel = text(e.palletLevel);
    if (!view.dimErrors.lengthM && !view.dimErrors.palletLevel) view.banner = message;
  } else {
    view.banner = message;
  }
  return view;
}
