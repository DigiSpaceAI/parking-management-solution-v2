import React, { useEffect, useState, useCallback } from 'react';

/**
 * Master Admin — Relocation Logs
 *
 * This page wasn't part of the 13-section Master Admin design (Sites,
 * Users, Roles, Audit, Data, Billing, etc.) — it's a genuinely existing,
 * live feature in the current MasterConfigModule.tsx ("Attendant Vehicle
 * Slot Relocation Audit Trail") that would have been silently lost in
 * the replacement otherwise. Rebuilt here in the same visual language
 * as the rest of the redesign, not left behind or restyled
 * inconsistently.
 *
 * DATA SOURCING: confirmed real — GET /api/v1/slots/change-notifications
 * (getSlotChangeNotifications), matching the SlotChangeNotification type
 * exactly as used in the current live component.
 */

interface SlotChangeNotification {
  id: string;
  vehicleNumber: string;
  oldSlotNumber: string;
  newSlotNumber: string;
  employeeName?: string;
  mobile?: string;
  changedAt: string;
}

export const MasterAdminRelocationLogs: React.FC = () => {
  const [notifications, setNotifications] = useState<SlotChangeNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/slots/change-notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, margin: 0 }}>
          Attendant Vehicle Slot Relocation Audit Trail
        </h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
          Live record of all slot relocation requests initiated by field attendants, and the SMS notifications sent to affected drivers.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, border: '1px dashed #e2e6ee', borderRadius: 8 }}>
          No slot relocation notifications recorded yet. Attendants can relocate vehicles from the mobile field app.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                padding: '12px 16px', border: '1px solid #e2e6ee', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{n.vehicleNumber}</span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span style={{ color: '#92400e', fontWeight: 600 }}>
                    Slot moved: {n.oldSlotNumber} → {n.newSlotNumber}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                  SMS sent to <strong>{n.employeeName || 'Driver'}</strong>{n.mobile ? ` (${n.mobile})` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 700, padding: '2px 8px', background: '#e7f8f0', color: '#065f46', border: '1px solid #a7e3c8', borderRadius: 4 }}>
                  SMS DELIVERED
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8', marginTop: 3, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {new Date(n.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
