import React, { useState, useEffect } from 'react';
import { hasPinSetFor, setPinFor, verifyPinFor, clearPin } from './pinGate';
import type { AppUser } from '../types';
import { apiFetch } from './api';
import { LegalModal } from './LegalModal';

interface ParkFlowsLoginProps {
  onAuthenticated: (user: AppUser) => void;
}

type Stage = 'checking' | 'identify' | 'password' | 'setPin' | 'pinUnlock';

const COLORS = {
  bg: '#f5f6f8',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  ink: '#0f172a',
  inkSoft: '#1e293b',
  label: '#64748b',
  muted: '#8b95a6',
  border: '#e2e6ee',
  borderStrong: '#cbd3e0',
  panel: '#eef1f6',
  danger: '#be123c',
  dangerBg: '#fdeaee',
  dangerBorder: '#f7b6c2',
};

export const ParkFlowsLogin: React.FC<ParkFlowsLoginProps> = ({ onAuthenticated }) => {
  const [stage, setStage] = useState<Stage>('checking');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pinEntry, setPinEntry] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [settingPinStep, setSettingPinStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/v1/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            const pinSet = await hasPinSetFor(data.user.id);
            setSessionUser(data.user);
            setStage(pinSet ? 'pinUnlock' : 'setPin');
            return;
          }
        }
      } catch {
        // ignore — falls through to identify
      }
      setStage('identify');
    })();
  }, []);

  const handleIdentifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError('Enter your attendant email or username.');
      return;
    }
    setStage('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Invalid credentials.');
        return;
      }
      setSessionUser(data.user);
      const pinSet = await hasPinSetFor(data.user.id);
      setPassword('');
      setStage(pinSet ? 'pinUnlock' : 'setPin');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pinBusy) return;
    setError(null);
    if (stage === 'pinUnlock') {
      if (pinEntry.length >= 4) return;
      const next = pinEntry + digit;
      setPinEntry(next);
      if (next.length === 4) {
        void submitPinUnlock(next);
      }
    } else if (stage === 'setPin') {
      if (settingPinStep === 'enter') {
        if (pinEntry.length >= 4) return;
        const next = pinEntry + digit;
        setPinEntry(next);
        if (next.length === 4) {
          setSettingPinStep('confirm');
        }
      } else {
        if (pinConfirm.length >= 4) return;
        const next = pinConfirm + digit;
        setPinConfirm(next);
        if (next.length === 4) {
          void submitPinSetup(pinEntry, next);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    setError(null);
    if (stage === 'pinUnlock') {
      setPinEntry((p) => p.slice(0, -1));
    } else if (settingPinStep === 'enter') {
      setPinEntry((p) => p.slice(0, -1));
    } else {
      setPinConfirm((p) => p.slice(0, -1));
    }
  };

  const submitPinUnlock = async (pin: string) => {
    if (!sessionUser) return;
    setPinBusy(true);
    try {
      const result = await verifyPinFor(sessionUser.id, pin);
      if (result.ok) {
        onAuthenticated(sessionUser);
        return;
      }
      setPinEntry('');
      if (result.lockedOut) {
        setError('Too many incorrect PIN attempts. Please sign in with your password.');
        setStage('identify');
        setIdentifier(sessionUser.email || sessionUser.username);
      } else {
        setError(`Incorrect PIN. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`);
      }
    } finally {
      setPinBusy(false);
    }
  };

  const submitPinSetup = async (pin: string, confirm: string) => {
    if (!sessionUser) return;
    if (pin !== confirm) {
      setError('PINs did not match. Try again.');
      setPinEntry('');
      setPinConfirm('');
      setSettingPinStep('enter');
      return;
    }
    setPinBusy(true);
    try {
      await setPinFor(sessionUser.id, pin);
      onAuthenticated(sessionUser);
    } catch {
      setError('Could not save your PIN on this device. Try again.');
      setPinEntry('');
      setPinConfirm('');
      setSettingPinStep('enter');
    } finally {
      setPinBusy(false);
    }
  };

  const useDifferentAccount = () => {
    clearPin();
    setSessionUser(null);
    setPinEntry('');
    setPinConfirm('');
    setSettingPinStep('enter');
    setStage('identify');
  };

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  const activePinLength = stage === 'setPin' && settingPinStep === 'confirm' ? pinConfirm.length : pinEntry.length;

  if (stage === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.bg }}>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.muted }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', boxSizing: 'border-box', background: COLORS.bg, padding: '38px 26px 26px', display: 'flex', flexDirection: 'column', fontFamily: 'Barlow, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, color: '#fff' }}>P</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 21, color: COLORS.ink, letterSpacing: '-0.01em' }}>ParkFlows</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 10, letterSpacing: '.14em', color: COLORS.muted, textTransform: 'uppercase' }}>Attendant Terminal</div>
        </div>
      </div>

      {stage === 'identify' && (
        <form onSubmit={handleIdentifySubmit}>
          <div style={{ marginTop: 34, fontWeight: 700, fontSize: 26, color: COLORS.inkSoft, letterSpacing: '-0.02em' }}>Sign in</div>
          <div style={{ marginTop: 6, fontSize: 14, color: COLORS.label }}>Enter your attendant email or username to continue.</div>

          <div style={{ marginTop: 20, fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: COLORS.muted, textTransform: 'uppercase' }}>Attendant email or username</div>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="ramesh.g@security.com"
            autoFocus
            style={{ marginTop: 9, width: '100%', boxSizing: 'border-box', height: 52, padding: '0 14px', borderRadius: 13, border: `1.5px solid ${COLORS.borderStrong}`, background: '#fff', outline: 'none', color: COLORS.ink, fontWeight: 600, fontSize: 14.5 }}
          />

          {error && (
            <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 12, background: COLORS.dangerBg, border: `1px solid ${COLORS.dangerBorder}`, fontWeight: 600, fontSize: 12, lineHeight: 1.45, color: COLORS.danger }}>{error}</div>
          )}

          <button type="submit" style={{ marginTop: 20, height: 56, borderRadius: 14, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 16, width: '100%', cursor: 'pointer' }}>
            Continue
          </button>
        </form>
      )}

      {stage === 'password' && (
        <form onSubmit={handlePasswordSubmit}>
          <div style={{ marginTop: 18, padding: 14, border: '1px solid #b9cffb', borderRadius: 13, background: '#fff' }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: COLORS.muted, textTransform: 'uppercase' }}>Signing in as</div>
            <div style={{ marginTop: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: COLORS.ink }}>{identifier}</div>
            <button type="button" onClick={() => setStage('identify')} style={{ marginTop: 12, width: '100%', height: 42, borderRadius: 10, border: `1px solid ${COLORS.borderStrong}`, background: COLORS.panel, color: COLORS.inkSoft, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Not you? Go back
            </button>
          </div>

          <div style={{ marginTop: 20, fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: COLORS.muted, textTransform: 'uppercase' }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{ marginTop: 9, width: '100%', boxSizing: 'border-box', height: 52, padding: '0 14px', borderRadius: 13, border: `1.5px solid ${COLORS.borderStrong}`, background: '#fff', outline: 'none', color: COLORS.ink, fontWeight: 600, fontSize: 14.5 }}
          />

          {error && (
            <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 12, background: COLORS.dangerBg, border: `1px solid ${COLORS.dangerBorder}`, fontWeight: 600, fontSize: 12, lineHeight: 1.45, color: COLORS.danger }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{ marginTop: 20, height: 56, borderRadius: 14, border: 'none', background: loading ? COLORS.borderStrong : COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 16, width: '100%', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      )}

      {(stage === 'setPin' || stage === 'pinUnlock') && (
        <div>
          <div style={{ marginTop: 34, fontWeight: 700, fontSize: 26, color: COLORS.inkSoft, letterSpacing: '-0.02em' }}>
            {stage === 'pinUnlock' ? `Welcome back` : settingPinStep === 'enter' ? 'Set a 4-digit PIN' : 'Confirm your PIN'}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: COLORS.label }}>
            {stage === 'pinUnlock'
              ? `${sessionUser?.fullName || ''} · enter your PIN to continue`
              : settingPinStep === 'enter'
              ? 'Quick unlock for this device only — never sent anywhere.'
              : 'Enter it once more to confirm.'}
          </div>

          {error && (
            <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 12, background: COLORS.dangerBg, border: `1px solid ${COLORS.dangerBorder}`, fontWeight: 600, fontSize: 12, lineHeight: 1.45, color: COLORS.danger }}>{error}</div>
          )}

          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  border: `1.5px solid ${COLORS.borderStrong}`,
                  background: i < activePinLength ? COLORS.primary : 'transparent',
                }}
              />
            ))}
          </div>

          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {keypad.map((k, idx) =>
              k === '' ? (
                <div key={idx} />
              ) : (
                <button
                  key={idx}
                  onClick={() => (k === '⌫' ? handlePinBackspace() : handlePinDigit(k))}
                  style={{ height: 58, borderRadius: 13, border: `1px solid ${COLORS.border}`, background: COLORS.panel, color: COLORS.inkSoft, fontFamily: 'monospace', fontWeight: 600, fontSize: 22, cursor: 'pointer' }}
                >
                  {k}
                </button>
              )
            )}
          </div>

          {stage === 'pinUnlock' && (
            <button onClick={useDifferentAccount} style={{ marginTop: 20, width: '100%', height: 44, borderRadius: 11, border: `1px dashed ${COLORS.borderStrong}`, background: 'transparent', color: COLORS.primaryDark, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              Not {sessionUser?.fullName}? Sign in with password
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setLegalOpen(true)}
        style={{ marginTop: 'auto', paddingTop: 24, background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 11.5, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
      >
        Privacy Policy · Terms of Service
      </button>

      {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
    </div>
  );
};
