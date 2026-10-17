import React, { useEffect, useState } from 'react';
import { ParkingLog, VehicleType, EntryType } from '../types';
import { useSiteContext, useWriteGuard } from '../utils/withSite';
import { getSessionToken } from '../sessionTokenFallback';
import { SiteCodeChip } from './SiteCodeChip';
import {
  FileSpreadsheet,
  Download,
  PlusCircle,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Car,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface ParkingLogsProps {
  logs: ParkingLog[];
  onRefresh: () => void;
}

export const ParkingLogs: React.FC<ParkingLogsProps> = ({
  logs,
  onRefresh,
}) => {
  const guard = useWriteGuard();
  const { siteId: activeSiteId } = useSiteContext();
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Self-contained site-name lookup, added specifically to show a real
  // site name (not a raw internal ID) on each log row, per explicit
  // request. Fetched independently here rather than threaded through
  // as a new prop from App.tsx, to keep this a self-contained change.
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/v1/sites')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.sites) return;
        const map: Record<string, string> = {};
        for (const s of data.sites) map[s.id] = s.siteName;
        setSiteNames(map);
      })
      .catch(() => {
        // Non-fatal — rows just fall back to showing the raw siteId.
      });
  }, []);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [basementFilter, setBasementFilter] = useState<string>('ALL');


  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  const filteredLogs = logs.filter((l) => {
    if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
    if (basementFilter !== 'ALL' && l.basement !== basementFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchPlate = l.vehicleNumber.toLowerCase().includes(q);
      const matchSlot = l.slotNumber.toLowerCase().includes(q);
      const matchName = l.employeeName && l.employeeName.toLowerCase().includes(q);
      if (!matchPlate && !matchSlot && !matchName) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // A download is a browser navigation, so the fetch wrapper can't add
  // headers: pass the site and the session token in the query instead (the
  // same pattern as SiteAdminReports). Export needs one site (no ALL) and is
  // disabled while viewing as another user (x-view-as can't be sent here).
  const downloadExport = (type: 'logs' | 'slots') => {
    if (!activeSiteId) return;
    const token = getSessionToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    window.open(
      `/api/v1/export/reports?type=${type}&siteId=${encodeURIComponent(activeSiteId)}${tokenParam}`,
      '_blank'
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2 font-mono">
            <FileSpreadsheet className="w-4 h-4 text-blue-400" />
            Parking Entry/Exit Logs & MIS Reports
          </h2>
          <p className="text-xs text-slate-300 font-mono mt-0.5">Complete timestamped entry and exit records for this site</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            {...guard()}
            onClick={() => downloadExport('logs')}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-white border border-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export MIS CSV Report</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search plate (e.g. KA-01), slot (B1-P01), name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs"
          />
        </div>

        <div className="flex items-center space-x-2 font-mono">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 text-xs"
          >
            <option value="ALL">All Log Statuses</option>
            <option value="ACTIVE">Currently Active Parked</option>
            <option value="COMPLETED">Completed Checkouts</option>
          </select>

          <select
            value={basementFilter}
            onChange={(e) => setBasementFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 text-xs"
          >
            <option value="ALL">All Basements</option>
            <option value="B1">Basement B1</option>
            <option value="B2">Basement B2</option>
            <option value="B3">Basement B3</option>
            <option value="Ground">Ground & Driveway</option>
          </select>
        </div>
      </div>

      {/* Logs Audit Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3.5">Log ID</th>
                <th className="p-3.5">Vehicle License Plate</th>
                <th className="p-3.5">Employee / Visitor</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Assigned Slot</th>
                <th className="p-3.5">Level</th>
                <th className="p-3.5">Site</th>
                <th className="p-3.5">Entry Timestamp</th>
                <th className="p-3.5">Exit Timestamp</th>
                <th className="p-3.5">Duration</th>
                <th className="p-3.5">Entry Type</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-mono text-slate-500">{log.id}</td>
                  <td className="p-3.5">
                    <span className="bg-slate-900 text-white font-mono font-bold px-2 py-0.5 rounded shadow-sm text-[11px] inline-block">
                      {log.vehicleNumber}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold text-slate-900">{log.employeeName || 'Visitor'}</td>
                  <td className="p-3.5 text-blue-600 font-medium">{log.department || 'Visitor'}</td>
                  <td className="p-3.5 font-mono font-bold text-emerald-700">{log.slotNumber}</td>
                  <td className="p-3.5 font-medium">{log.basement}</td>
                  <td className="p-3.5 text-slate-600 text-[11px]">
                    <SiteCodeChip siteId={log.siteId} />
                    {siteNames[log.siteId || ''] || log.siteId || '—'}
                  </td>
                  <td className="p-3.5 text-slate-600 font-mono text-[11px]">{new Date(log.entryTime).toLocaleString()}</td>
                  <td className="p-3.5 text-slate-500 font-mono text-[11px]">{log.exitTime ? new Date(log.exitTime).toLocaleString() : '-'}</td>
                  <td className="p-3.5 font-mono font-bold text-amber-700">
                    {log.durationMinutes ? `${log.durationMinutes} mins` : 'Active Dwell'}
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-300">
                      {log.entryType}
                    </span>
                  </td>
                  <td className="p-3.5">
                    {log.status === 'ACTIVE' ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-300">
                        ACTIVE PARKED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                        COMPLETED
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-right">
                    {/* AC-11: entries and exits are recorded on Live parking only; this log is read-only + export. */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-mono">
          <span>
            Showing Page {currentPage} of {totalPages} ({filteredLogs.length} total logs)
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded border border-slate-300 disabled:opacity-40 shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-900 px-2">{currentPage}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded border border-slate-300 disabled:opacity-40 shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
