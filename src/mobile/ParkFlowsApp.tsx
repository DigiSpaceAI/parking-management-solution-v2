import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ParkFlowsLogin } from './ParkFlowsLogin';
import { GateTerminal } from './GateTerminal';
import { LiveSlots } from './LiveSlots';
import { BasementSummary } from './BasementSummary';
import { ManualEntryModal } from './ManualEntryModal';
import { LegalModal } from './LegalModal';
import type { AppUser, ParkingSlot } from '../types';
import { apiFetch } from './api';
import { resolveSiteContext, clearSiteContext, getSiteName } from './siteContext';

type Tab = 'gate' | 'slots' | 'levels';
const TAB_ORDER: Tab[] = ['gate', 'slots', 'levels'];

const C = {
  bg: '#f5f6f8', primary: '#2563eb',
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', panel: '#eef1f6',
};

const PAGE_TITLES: Record<Tab, string> = {
  gate: 'Gate Terminal',
  slots: 'Live Parking Slots',
  levels: 'Basement Summary',
};

export const ParkFlowsApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [siteReady, setSiteReady] = useState(false);
  const [tab, setTab] = useState<Tab>('gate');
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPrefillSlot, setManualPrefillSlot] = useState<string | undefined>(undefined);
  const [pendingLevelFilter, setPendingLevelFilter] = useState<string | null>(null);
  const [synced, setSynced] = useState(true);
  const [legalOpen, setLegalOpen] = useState(false);

  const refreshSlots = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/slots');
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
        setSynced(true);
      } else if (res.status === 401) {
        // Session actually expired server-side (24h TTL, or was revoked).
        // Previously this just set synced=false and the app sat showing
        // "OFFLINE" forever with no way back in short of force-quitting.
        // Send them back to the login flow — ParkFlowsLogin's own check
        // will correctly route to PIN-unlock if the PIN is still valid
        // for a *new* session, or to password entry if not. Also clear
        // the site context here, same reasoning as the explicit sign-out
        // path — whoever logs back in needs fresh resolution, not a
        // stale site left over from this session.
        clearSiteContext();
        setSiteReady(false);
        setCurrentUser(null);
      } else {
        setSynced(false);
      }
    } catch {
      setSynced(false);
    }
  }, []);

  // Shared by both places a basement/level summary appears (Gate
  // Terminal's idle-state occupancy widget, and the dedicated Levels
  // page) — tapping either jumps to the Slots tab pre-filtered to that
  // level, consistently.
  const navigateToSlotsFiltered = (level: string) => {
    setPendingLevelFilter(level);
    setTab('slots');
  };

  // Swipe-to-navigate between the three tabs, as an alternative to
  // tapping the bottom nav. Deliberately conservative about what counts
  // as a swipe: several pages have their own horizontally-scrollable
  // elements (the level filter chips on Slots, for instance), so this
  // only fires on a fairly large, clearly horizontal gesture — small or
  // mostly-vertical movement is left alone to avoid fighting those.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_MIN_DISTANCE = 70;
  const SWIPE_MAX_VERTICAL = 60;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || dy > SWIPE_MAX_VERTICAL) return;

    const currentIndex = TAB_ORDER.indexOf(tab);
    if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
      // Swiped left — advance to the next tab.
      setPendingLevelFilter(null);
      setTab(TAB_ORDER[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      // Swiped right — go back to the previous tab.
      setPendingLevelFilter(null);
      setTab(TAB_ORDER[currentIndex - 1]);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    refreshSlots();
    const interval = setInterval(refreshSlots, 4000);
    return () => clearInterval(interval);
  }, [currentUser, refreshSlots]);

  const handleSignOut = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore — clearing local state below regardless
    }
    clearSiteContext();
    setSiteReady(false);
    setCurrentUser(null);
  };

  if (!currentUser) {
    return (
      <ParkFlowsLogin
        onAuthenticated={async (user) => {
          // CRITICAL FIX: this used to call resolveSiteContext without
          // awaiting it, while immediately showing the authenticated app
          // (via setCurrentUser). That's a genuine race condition — if
          // the attendant acted quickly (very plausible right after
          // logging in), a vehicle entry could fire before site
          // resolution finished, sending no x-site-id header at all and
          // silently defaulting to the platform's default site instead
          // of their real one. Now: site resolution is genuinely
          // awaited, and the authenticated app only renders once it's
          // actually done — see the siteReady gate below.
          await resolveSiteContext(user, apiFetch);
          setSiteReady(true);
          setCurrentUser(user);
        }}
      />
    );
  }

  if (!siteReady) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow, sans-serif', color: C.inkSoft, fontSize: 13 }}>
        Setting up your site…
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100vh', boxSizing: 'border-box', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Barlow, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#fff' }}>P</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.inkSoft }}>{PAGE_TITLES[tab]}</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9, letterSpacing: '.12em', color: C.faint, textTransform: 'uppercase' }}>
              {currentUser.fullName}{getSiteName() ? ` · ${getSiteName()!.toUpperCase()}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: synced ? '#e7f8f0' : '#fdeaee', border: `1px solid ${synced ? '#a7e3c8' : '#f7b6c2'}` }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: synced ? '#059669' : '#be123c' }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 9.5, color: synced ? '#059669' : '#be123c' }}>{synced ? 'SYNCED' : 'OFFLINE'}</span>
          </div>
          <button onClick={() => { setManualPrefillSlot(undefined); setManualOpen(true); }} style={{ height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid #b9cffb', background: '#e8f0fe', color: '#1d4ed8', fontFamily: 'monospace', fontWeight: 700, fontSize: 10.5, letterSpacing: '.08em', cursor: 'pointer' }}>MANUAL</button>
          <button onClick={() => setLegalOpen(true)} title="Privacy Policy & Terms" aria-label="Privacy Policy & Terms" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #cbd3e0', background: C.panel, color: C.label, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>ⓘ</button>
          <button onClick={handleSignOut} title="End shift" style={{ height: 32, padding: '0 9px', borderRadius: 9, border: '1px solid #cbd3e0', background: C.panel, color: C.label, fontFamily: 'monospace', fontWeight: 700, fontSize: 10.5, letterSpacing: '.08em', cursor: 'pointer' }}>END</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 0 18px' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === 'gate' && (
          <GateTerminal
            slots={slots}
            onRefresh={refreshSlots}
            onOpenManual={() => { setManualPrefillSlot(undefined); setManualOpen(true); }}
            onNavigateToSlots={navigateToSlotsFiltered}
          />
        )}
        {tab === 'slots' && (
          <LiveSlots
            slots={slots}
            onRefresh={refreshSlots}
            initialLevelFilter={pendingLevelFilter}
            onOpenManualForSlot={(slotNumber) => {
              setManualPrefillSlot(slotNumber);
              setManualOpen(true);
            }}
          />
        )}
        {tab === 'levels' && (
          <BasementSummary
            slots={slots}
            onRefresh={refreshSlots}
            onOpenManualForSlot={(slotNumber) => {
              setManualPrefillSlot(slotNumber);
              setManualOpen(true);
            }}
            onNavigateToSlots={navigateToSlotsFiltered}
          />
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: C.bg, borderTop: `1px solid ${C.border}`, padding: '14px 0 18px', display: 'flex', justifyContent: 'center', gap: 10 }}>
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => {
              setPendingLevelFilter(null);
              setTab(key);
            }}
            aria-label={PAGE_TITLES[key]}
            style={{
              width: tab === key ? 22 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer',
              background: tab === key ? C.primary : C.border,
              transition: 'width 160ms ease, background 160ms ease',
            }}
          />
        ))}
      </div>

      {manualOpen && (
        <ManualEntryModal
          slots={slots}
          prefilledSlotNumber={manualPrefillSlot}
          onClose={() => setManualOpen(false)}
          onDone={() => {
            setManualOpen(false);
            refreshSlots();
          }}
        />
      )}

      {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
    </div>
  );
};
