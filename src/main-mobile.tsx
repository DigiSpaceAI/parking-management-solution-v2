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

function MobileRoot() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [slotRes, empRes] = await Promise.all([
        fetch(api('/api/v1/slots'), { headers: authHeaders(user) }),
        fetch(api('/api/v1/employees'), { headers: authHeaders(user) }),
      ]);
      const slotData = await slotRes.json();
      const empData = await empRes.json();
      if (slotData.success) setSlots(slotData.slots || slotData.data || []);
      if (empData.success) setEmployees(empData.employees || empData.data || []);
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
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ vehicleNumber, vehicleType, entryType, targetSlotNumber }),
    });
    refresh();
  };

  const onVehicleExit = async (vehicleNumberOrSlot: string) => {
    await fetch(api('/api/v1/vehicles/exit'), {
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
