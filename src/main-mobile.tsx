import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AttendantMobileApp } from './components/AttendantMobileApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { AppUser, ParkingSlot } from './types.ts';
import './index.css';

// Absolute base URL. Relative fetches ('/api/v1/...') cannot work inside a
// Capacitor APK: the page origin is https://localhost, where no server runs.
// Set VITE_API_BASE_URL in .env.production before `npm run build:mobile`.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://parking-management-solution-v2-git-430896008903.asia-south1.run.app'
).replace(/\/$/, '');

const authHeaders = (user: AppUser | null): Record<string, string> => ({
  'Content-Type': 'application/json',
  'x-user-email': user?.email || '',
  'x-user-role': user?.roleName || 'ATTENDANT',
});

const api = (path: string) => `${API_BASE}${path}`;

// credentials:'include' is mandatory. server.ts line 148 puts requireAuth in
// front of every /api/v1 route that isn't in PUBLIC_API_PATHS, and the session
// lives in the parkorbit_session cookie (SameSite=None; Secure). A cross-origin
// fetch without this flag neither stores nor sends that cookie, so every call
// after login would 401.
const CREDS = { credentials: 'include' as RequestCredentials };

function MobileRoot() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [slotRes, empRes] = await Promise.all([
        fetch(api('/api/v1/slots'), { ...CREDS, headers: authHeaders(user) }),
        fetch(api('/api/v1/employees'), { ...CREDS, headers: authHeaders(user) }),
      ]);
      if (slotRes.status === 401 || empRes.status === 401) {
        setError('Session rejected (401). Sign in again.');
        setUser(null);
        return;
      }
      if (slotRes.status === 403 || empRes.status === 403) {
        setError('This account lacks MOBILE_APP permission. Ask an admin to grant it.');
        return;
      }
      const slotData = await slotRes.json();
      const empData = await empRes.json();
      // GET /api/v1/slots returns { summary, totalReturned, slots } and
      // GET /api/v1/employees returns { total, piiMasked, employees } — neither
      // sends a 'success' flag, so gating on one would discard every response.
      if (Array.isArray(slotData.slots)) setSlots(slotData.slots);
      if (Array.isArray(empData.employees)) setEmployees(empData.employees);
      setError(null);
    } catch {
      setError(`Cannot reach ${API_BASE || '(no API base configured)'}`);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onVehicleEntry = async (
    vehicleNumber: string,
    vehicleType?: any,
    entryType?: any,
    targetSlotNumber?: string,
  ) => {
    await fetch(api('/api/v1/vehicles/entry'), {
      ...CREDS,
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ vehicleNumber, vehicleType, entryType, targetSlotNumber }),
    });
    refresh();
  };

  const onVehicleExit = async (vehicleNumberOrSlot: string) => {
    await fetch(api('/api/v1/vehicles/exit'), {
      ...CREDS,
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ vehicleNumberOrSlot }),
    });
    refresh();
  };

  if (!user) {
    return <LoginScreen allUsers={[]} onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <>
      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', font: '600 12px Barlow, sans-serif' }}>
          {error}
        </div>
      )}
      <AttendantMobileApp
        slots={slots}
        employees={employees}
        onVehicleEntry={onVehicleEntry}
        onVehicleExit={onVehicleExit}
        onRefresh={refresh}
      />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MobileRoot />
    </ErrorBoundary>
  </StrictMode>,
);
