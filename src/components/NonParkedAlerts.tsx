import React, { useState, useEffect } from 'react';
import { NonParkedAlert } from '../types';
import {
  AlertTriangle,
  Bell,
  Clock,
  CheckCircle,
  RefreshCw,
  Send,
  Smartphone,
  ShieldAlert,
  Search,
  User
} from 'lucide-react';

interface NonParkedAlertsProps {
  onRefresh: () => void;
}

export const NonParkedAlerts: React.FC<NonParkedAlertsProps> = ({ onRefresh }) => {
  const [alerts, setAlerts] = useState<NonParkedAlert[]>([]);
  const [cutoffTime, setCutoffTime] = useState<string>('10:30 AM');
  const [loading, setLoading] = useState<boolean>(true);
  const [cronTriggering, setCronTriggering] = useState<boolean>(false);
  const [lastScanMsg, setLastScanMsg] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sentFcmMsg, setSentFcmMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSentFcmMsg(msg);
    setTimeout(() => setSentFcmMsg(null), 4000);
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/alerts/non-parked');
      const data = await res.json();
      setAlerts(data.alerts || []);
      setCutoffTime(data.cutoffTime || '10:30 AM');
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleTriggerCron = async () => {
    try {
      setCronTriggering(true);
      const res = await fetch('/api/v1/alerts/trigger-cron', {
        method: 'POST',
      });
      const data = await res.json();
      setLastScanMsg(data.message);
      setAlerts(data.scanResult?.alerts || []);
      onRefresh();
    } catch (err) {
      setLastScanMsg('Error running cutoff scan');
    } finally {
      setCronTriggering(false);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.employeeName.toLowerCase().includes(q) ||
      a.employeeId.toLowerCase().includes(q) ||
      a.vehicleNumber.toLowerCase().includes(q) ||
      a.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Cutoff Banner & Cron Simulator */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-mono font-bold mb-1 uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>OFF-SITE & NON-PARKED DETECTION ENGINE</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Daily Cutoff Scan: <span className="font-mono text-amber-400">{cutoffTime}</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Cross-references active working employees against currently occupied parking logs. Automatically triggers FCM push notifications for registered vehicles missing from premises.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleTriggerCron}
              disabled={cronTriggering}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${cronTriggering ? 'animate-spin' : ''}`} />
              <span>Run {cutoffTime} Roster Cutoff Scan</span>
            </button>
          </div>
        </div>

        {lastScanMsg && (
          <div className="mt-4 p-3 bg-amber-950/80 border border-amber-800 rounded-xl text-xs text-amber-300 flex items-center space-x-2 font-mono">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{lastScanMsg}</span>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee, plate (KA-01), department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 font-mono"
          />
        </div>

        <span className="text-xs text-slate-600 font-mono">
          Showing {filteredAlerts.length} Exception Flagged Vehicles
        </span>
      </div>

      {/* Exception Alerts Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3.5">Employee ID</th>
                <th className="p-3.5">Employee Name</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Registered Plate</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Cutoff Status</th>
                <th className="p-3.5">Push Notification Log</th>
                <th className="p-3.5 text-right">FCM Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                    No non-parked exceptions found. All working employees are accounted for inside parking logs.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-900">{alert.employeeId}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{alert.employeeName}</td>
                    <td className="p-3.5 text-blue-600 font-medium">{alert.department}</td>
                    <td className="p-3.5 font-mono font-bold text-amber-800">
                      <span className="bg-slate-900 text-white font-mono font-bold px-2 py-0.5 rounded shadow-sm text-[11px] inline-block">
                        {alert.vehicleNumber}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600">{alert.vehicleType}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-300">
                        OFF-SITE DETECTED
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500 max-w-xs truncate">{alert.remarks}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => showToast(`Re-sent FCM Push Alert to ${alert.employeeName} (${alert.mobile})`)}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold flex items-center space-x-1 ml-auto transition-colors"
                      >
                        <Bell className="w-3 h-3" />
                        <span>Resend FCM</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FCM Confirmation Banner */}
      {sentFcmMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in max-w-md">
          <div className="p-4 rounded-xl border border-amber-500/50 bg-slate-900 text-white shadow-xl shadow-amber-950/30 flex items-center space-x-3">
            <Bell className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold">{sentFcmMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
};
