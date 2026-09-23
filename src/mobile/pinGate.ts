// Local PIN gate — a fast unlock for an ALREADY-valid server session, never
// a replacement for real authentication. The PIN itself never leaves this
// device: it's hashed and stored locally only, and is meaningless to the
// server (there's no /api/v1 endpoint that accepts a PIN). Losing the PIN,
// or 5 wrong attempts, simply falls back to the real password login — the
// PIN can shorten how often you type a password within one valid session,
// it can never extend a session that's actually expired.

const PIN_HASH_KEY = 'parkflow_pin_hash';
const PIN_USER_KEY = 'parkflow_pin_user';
const PIN_FAIL_COUNT_KEY = 'parkflow_pin_fails';
const MAX_PIN_ATTEMPTS = 5;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hasPinSetFor(userId: string): Promise<boolean> {
  const storedUser = localStorage.getItem(PIN_USER_KEY);
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  return storedUser === userId && !!storedHash;
}

export async function setPinFor(userId: string, pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  const hash = await sha256Hex(`${userId}:${pin}`);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.setItem(PIN_USER_KEY, userId);
  localStorage.removeItem(PIN_FAIL_COUNT_KEY);
}

export async function verifyPinFor(userId: string, pin: string): Promise<{ ok: boolean; attemptsLeft: number; lockedOut: boolean }> {
  const storedUser = localStorage.getItem(PIN_USER_KEY);
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const fails = Number(localStorage.getItem(PIN_FAIL_COUNT_KEY) || '0');

  if (fails >= MAX_PIN_ATTEMPTS) {
    return { ok: false, attemptsLeft: 0, lockedOut: true };
  }

  if (storedUser !== userId || !storedHash) {
    return { ok: false, attemptsLeft: MAX_PIN_ATTEMPTS - fails, lockedOut: false };
  }

  const hash = await sha256Hex(`${userId}:${pin}`);
  if (hash === storedHash) {
    localStorage.removeItem(PIN_FAIL_COUNT_KEY);
    return { ok: true, attemptsLeft: MAX_PIN_ATTEMPTS, lockedOut: false };
  }

  const newFails = fails + 1;
  localStorage.setItem(PIN_FAIL_COUNT_KEY, String(newFails));
  const lockedOut = newFails >= MAX_PIN_ATTEMPTS;
  if (lockedOut) {
    // Locking out clears the PIN entirely — the only way back in is a real
    // password login, which also lets them set a fresh PIN afterward.
    clearPin();
  }
  return { ok: false, attemptsLeft: Math.max(0, MAX_PIN_ATTEMPTS - newFails), lockedOut };
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_USER_KEY);
  localStorage.removeItem(PIN_FAIL_COUNT_KEY);
}
