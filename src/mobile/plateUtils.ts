/**
 * License-plate extraction and temporal-consistency logic.
 *
 * The camera pushes a fresh OCR read several times a second. A single frame
 * can misread a character, so we don't trust any one read — we require the
 * SAME normalized plate to show up several times in a row (a short rolling
 * window) before treating it as confirmed and handing it back to the screen.
 * This is what makes the scan feel instant without being trigger-happy on
 * noise (a stray "IND" watermark, a partial plate, etc.).
 */

// Indian vehicle registration format, e.g. "MH12AB1234", plus the newer
// Bharat series format, e.g. "23BH1234AB". Tweak/extend this if the fleet
// includes other plate formats.
const STANDARD_PLATE_RE = /\b([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})\b/;
const BH_SERIES_PLATE_RE = /\b([0-9]{2}BH[0-9]{4}[A-Z]{1,2})\b/;

// Common OCR confusions on plate-style fonts.
const CONFUSION_MAP: Record<string, string> = {
  O: '0',
  Q: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
};

function stripToAlnum(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Best-effort normalization: keep letters where a plate needs letters and
 * digits where it needs digits, is not applied here — we keep the raw
 * alnum string as the canonical candidate and only use confusion-correction
 * for a secondary "loose" match pass. */
function looseVariant(candidate: string): string {
  return candidate
    .split('')
    .map(ch => CONFUSION_MAP[ch] ?? ch)
    .join('');
}

export interface PlateCandidate {
  raw: string;
  normalized: string;
}

/**
 * Scans OCR result text (and, for robustness, each individual line/element)
 * for something that looks like a plate. Returns every distinct candidate
 * found so callers can decide how to use them (we currently just take the
 * first strict match, falling back to a loose match).
 */
export function extractPlateCandidates(fullText: string, lines: string[]): PlateCandidate[] {
  const candidates: PlateCandidate[] = [];
  const seen = new Set<string>();

  const tryText = (text: string) => {
    const cleaned = stripToAlnum(text);
    if (cleaned.length < 8 || cleaned.length > 12) return;
    const strict = STANDARD_PLATE_RE.exec(cleaned) ?? BH_SERIES_PLATE_RE.exec(cleaned);
    if (strict) {
      const normalized = strict[1];
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push({ raw: text, normalized });
      }
      return;
    }
    // Loose pass: correct common OCR confusions, then retry.
    const loose = looseVariant(cleaned);
    const looseMatch = STANDARD_PLATE_RE.exec(loose) ?? BH_SERIES_PLATE_RE.exec(loose);
    if (looseMatch) {
      const normalized = looseMatch[1];
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push({ raw: text, normalized });
      }
    }
  };

  tryText(fullText);
  for (const line of lines) tryText(line);

  return candidates;
}

interface ConsensusOptions {
  /** How many consecutive matching reads are required before confirming. */
  requiredMatches?: number;
  /** Reads older than this (ms) are dropped from the rolling window. */
  windowMs?: number;
}

/**
 * Tracks recent plate reads and reports a confirmed plate once the same
 * normalized value has appeared `requiredMatches` times within `windowMs`.
 * Not thread-safe / not a worklet — call this from the JS thread after a
 * worklet has already handed off a candidate string via scheduleOnRN.
 */
export class PlateConsensusTracker {
  private requiredMatches: number;
  private windowMs: number;
  private reads: { value: string; at: number }[] = [];
  private confirmedValue: string | null = null;

  constructor(options: ConsensusOptions = {}) {
    this.requiredMatches = options.requiredMatches ?? 3;
    this.windowMs = options.windowMs ?? 2500;
  }

  /** Feed a new normalized plate string read from a frame. Returns the
   * confirmed plate once enough consistent reads have accumulated, or null
   * while still building consensus / after already confirming this value. */
  push(value: string): string | null {
    const now = Date.now();
    this.reads = this.reads.filter(r => now - r.at <= this.windowMs);
    this.reads.push({ value, at: now });

    const countForValue = this.reads.filter(r => r.value === value).length;
    if (countForValue >= this.requiredMatches && this.confirmedValue !== value) {
      this.confirmedValue = value;
      return value;
    }
    return null;
  }

  reset(): void {
    this.reads = [];
    this.confirmedValue = null;
  }
}
