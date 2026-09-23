/**
 * Utility functions for vehicle license plate normalization and matching.
 */

/**
 * Normalizes all license plates by stripping all non-alphanumeric characters
 * (spaces, hyphens, slashes, dots, special symbols) and converting to uppercase.
 * This guarantees consistent lookups across Field Attendant scans, OCR inputs,
 * and Employee registration forms.
 *
 * @param plate - Raw license plate string
 * @returns Clean, uppercase alphanumeric string (e.g. "DL 01 AB-1234" -> "DL01AB1234")
 */
export function normalizeVehicleNumber(plate: string | null | undefined): string {
  if (!plate) return '';
  return plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Compares two license plate strings for equality after normalization.
 */
export function isPlateMatch(plateA: string | null | undefined, plateB: string | null | undefined): boolean {
  const normA = normalizeVehicleNumber(plateA);
  const normB = normalizeVehicleNumber(plateB);
  if (!normA || !normB) return false;
  return normA === normB;
}

/** Maximum number of alphanumeric characters allowed in a vehicle number. */
export const MAX_PLATE_LENGTH = 10;

/**
 * Input helper for plate text fields. Keeps letters, digits, spaces and hyphens
 * (so users can type "KA-01-EX-8821"), uppercases, and stops accepting
 * characters once MAX_PLATE_LENGTH alphanumeric characters have been entered.
 */
export function clampPlateInput(raw: string): string {
  let out = '';
  let count = 0;
  for (const ch of raw.toUpperCase()) {
    if (/[A-Z0-9]/.test(ch)) {
      if (count >= MAX_PLATE_LENGTH) continue;
      count++;
      out += ch;
    } else if (ch === ' ' || ch === '-') {
      out += ch;
    }
  }
  return out;
}
