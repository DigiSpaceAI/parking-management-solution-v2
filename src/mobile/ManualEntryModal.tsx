import React, { useState, useEffect, useMemo } from 'react';
import type { ParkingSlot, VehicleType, Employee } from '../types';
import { apiFetch } from './api';

interface ManualEntryModalProps {
  slots: ParkingSlot[];
  prefilledSlotNumber?: string;
  onClose: () => void;
  onDone: () => void;
}

const C = {
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', borderStrong: '#cbd3e0', panel: '#eef1f6', panelAlt: '#f8fafc',
  primary: '#2563eb', primaryDark: '#1d4ed8',
};

const VEHICLE_TYPES: VehicleType[] = ['SEDAN', 'SUV', 'CSUV', 'HATCHBACK', 'TWO_WHEELER', 'EV'];

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ slots, prefilledSlotNumber, onClose, onDone }) => {
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('SEDAN');
  const [slotQuery, setSlotQuery] = useState(prefilledSlotNumber || '');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(prefilledSlotNumber || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [matchedEmployee, setMatchedEmployee] = useState<Employee | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  // Real employee registry, loaded once — used for live plate-to-owner
  // matching as the attendant types, same idea as the original design's
  // registry lookup but against actual registered vehicles, not mock data.
  // Guards against non-array responses (e.g. a 401 body like
  // {success:false, message:'Not signed in.'}) which would otherwise get
  // assigned directly to `employees` and crash the very next keystroke's
  // .filter()/.find() call with "employees.filter is not a function".
  useEffect(() => {
    apiFetch('/api/v1/employees')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.employees) ? data.employees : Array.isArray(data) ? data : [];
        setEmployees(list);
      })
      .catch(() => setEmployees([]));
  }, []);

  const cleanPlate = plate.replace(/[^A-Z0-9]/g, '');

  const exactMatch = useMemo(() => {
    if (cleanPlate.length < 4) return null;
    return employees.find((e) => (e.vehicleNumber || '').replace(/[^A-Z0-9]/g, '') === cleanPlate) || null;
  }, [cleanPlate, employees]);

  const suggestions = useMemo(() => {
    if (cleanPlate.length < 2 || exactMatch) return [];
    return employees
      .filter((e) => (e.vehicleNumber || '').replace(/[^A-Z0-9]/g, '').startsWith(cleanPlate))
      .slice(0, 4);
  }, [cleanPlate, exactMatch, employees]);

  useEffect(() => {
    if (exactMatch) {
      setMatchedEmployee(exactMatch);
      setVehicleType(exactMatch.vehicleType);
      setIsGuest(false);
    } else {
      setMatchedEmployee(null);
    }
  }, [exactMatch]);

  const pickSuggestion = (emp: Employee) => {
    setPlate(emp.vehicleNumber.toUpperCase());
    setMatchedEmployee(emp);
    setVehicleType(emp.vehicleType);
    setIsGuest(false);
  };

  const vacantMatches = slots
    .filter((s) => s.status === 'VACANT' && (slotQuery === '' || s.slotNumber.toLowerCase().includes(slotQuery.toLowerCase())))
    .slice(0, 6);

  const submit = async () => {
    if (!plate.trim()) {
      setError('Enter a vehicle number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/vehicles/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleNumber: plate.toUpperCase(),
          vehicleType,
          entryType: 'MANUAL',
          targetSlotNumber: selectedSlot || undefined,
          remarks: isGuest
            ? 'Guest Entry (marked by attendant)'
            : matchedEmployee
            ? `Verified Employee ${matchedEmployee.employeeId}`
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onDone();
      } else {
        setError(data.message || 'Entry failed.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 22, background: 'rgba(15,23,42,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxHeight: '100%', overflow: 'auto', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '17px 16px 19px', boxShadow: '0 18px 44px rgba(15,23,42,.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Manual gate entry</div>
            <div style={{ marginTop: 6, fontWeight: 700, fontSize: 17, color: C.ink }}>Type vehicle number</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>×</button>
        </div>

        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          maxLength={10}
          autoCapitalize="characters"
          placeholder="KA01EX8821"
          style={{ marginTop: 13, width: '100%', boxSizing: 'border-box', height: 50, padding: '0 13px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panelAlt, outline: 'none', color: C.ink, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: '.08em' }}
        />

        {matchedEmployee && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#e7f8f0', border: '1px solid #a7e3c8' }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: '#065f46' }}>{matchedEmployee.name}</div>
            <div style={{ marginTop: 3, fontWeight: 500, fontSize: 11, color: '#059669' }}>{matchedEmployee.department} · {matchedEmployee.employeeId}</div>
          </div>
        )}

        {!matchedEmployee && suggestions.length > 0 && (
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => pickSuggestion(s)}
                style={{ padding: '8px 11px', borderRadius: 9, background: C.panelAlt, border: `1px solid ${C.border}`, textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: C.inkSoft }}>{s.vehicleNumber}</span>
                  <span style={{ fontWeight: 600, fontSize: 10.5, color: C.muted }}>{s.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!matchedEmployee && cleanPlate.length >= 4 && suggestions.length === 0 && (
          <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: isGuest ? '#e8f0fe' : C.panelAlt, border: `1px solid ${isGuest ? '#b9cffb' : C.border}`, cursor: 'pointer' }}>
            <input type="checkbox" checked={isGuest} onChange={(e) => setIsGuest(e.target.checked)} style={{ width: 16, height: 16 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: isGuest ? C.primaryDark : C.inkSoft }}>Mark as Guest</div>
              <div style={{ marginTop: 2, fontWeight: 500, fontSize: 10.5, color: C.muted }}>No registered vehicle matched this plate</div>
            </div>
          </label>
        )}

        <div style={{ marginTop: 14, fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', color: C.faint, textTransform: 'uppercase' }}>Vehicle type</div>
        <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {VEHICLE_TYPES.map((v) => (
            <button
              key={v}
              onClick={() => setVehicleType(v)}
              style={{
                height: 44, borderRadius: 10, cursor: 'pointer',
                background: vehicleType === v ? '#e8f0fe' : '#fff',
                border: `1.5px solid ${vehicleType === v ? '#b9cffb' : C.border}`,
                color: vehicleType === v ? C.primaryDark : C.label,
                fontWeight: 700, fontSize: 11.5,
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', color: C.faint, textTransform: 'uppercase' }}>Slot number (optional — auto-assigned if left blank)</div>
        <input
          value={slotQuery}
          onChange={(e) => {
            setSlotQuery(e.target.value.toUpperCase());
            setSelectedSlot(null);
          }}
          maxLength={11}
          placeholder="XX-XXX-XXXX"
          style={{ marginTop: 9, width: '100%', boxSizing: 'border-box', height: 48, padding: '0 13px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panelAlt, outline: 'none', color: C.ink, fontFamily: 'monospace', fontWeight: 700, fontSize: 13.5, letterSpacing: '.06em' }}
        />

        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {vacantMatches.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSlot(s.slotNumber)}
              style={{
                height: 56, borderRadius: 11, cursor: 'pointer',
                background: selectedSlot === s.slotNumber ? '#e8f0fe' : C.panel,
                border: `2px solid ${selectedSlot === s.slotNumber ? '#2563eb' : C.border}`,
                color: selectedSlot === s.slotNumber ? C.primaryDark : C.label,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{s.slotNumber}</span>
              <span style={{ fontWeight: 600, fontSize: 9, letterSpacing: '.06em' }}>{s.slotType}</span>
            </button>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 12, background: '#fdeaee', border: '1px solid #f7b6c2', fontWeight: 600, fontSize: 12, color: '#be123c' }}>{error}</div>
        )}

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 9 }}>
          <button onClick={onClose} style={{ height: 52, borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ height: 52, borderRadius: 12, border: 'none', background: busy ? C.borderStrong : C.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Confirming…' : 'Confirm entry'}
          </button>
        </div>
      </div>
    </div>
  );
};
