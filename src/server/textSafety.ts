// 003: one check for admin-written text that a public TV shows (07 S3-5, S3-11).
// Pure (no imports), so db.ts and displayOverrides.ts can both use it.
/**
 * 07 S3-5: text-direction controls and invisible characters, which could show a
 * message reversed or spoofed on a public screen: Arabic letter mark U+061C,
 * zero-width space/joiners and LRM/RLM U+200B-200F, embeddings and overrides
 * U+202A-202E, word joiner, invisible operators and isolates U+2060-2069, and
 * the zero-width no-break space U+FEFF. A message containing any is refused
 * with a field error (not silently changed), so the admin sees what to fix.
 */
const HIDDEN_FORMAT_CHARS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;
export const hasHiddenFormatChars = (raw: unknown): boolean => typeof raw === 'string' && HIDDEN_FORMAT_CHARS.test(raw);
