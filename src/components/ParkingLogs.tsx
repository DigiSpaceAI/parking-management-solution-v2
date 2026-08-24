import React, { useState } from 'react';
import { ParkingLog, VehicleType, EntryType } from '../types';
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
  onVehicleEntry: (vehicleNumber: string, vehicleType?: VehicleType, entryType?: EntryType) => void;
  onVehicleExit: (vehicleNumberOrSlot: string) => void;
  onRefresh: () => void;
}

export const ParkingLogs: React.FC<ParkingLogsProps> = ({
  logs,
  onVehicleEntry,
  onVehicleExit,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [basementFilter, setBasementFilter] = useState<string>('ALL');
  const [showEntryModal, setShowEntryModal] = useState<boolean>(false);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);

  const [entryPlate, setEntryPlate] = useState<string>('');
  const [entryType, setEntryType] = useState<VehicleType>('SEDAN');
  const [exitPlate, setExitPlate] = useState<string>('');

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

  const handleManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryPlate.trim()) return;
    onVehicleEntry(entryPlate, entryType, 'MANUAL');
    setEntryPlate('');
    setShowEntryModal(false);
  };

  const handleManualExit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitPlate.trim()) return;
    onVehicleExit(exitPlate);
    setExitPlate('');
    setShowExitModal(false);
  };

  const downloadExport = (type: 'logs' | 'slots') => {
    window.open(`/api/v1/export/reports?type=${type}`, '_blank');
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
          <p className="text-xs text-slate-300 font-mono mt-0.5">Complete timestamped audit logs for 1,080 parking inventory slots</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowEntryModal(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center space-x-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record Manual Entry</span>
          </button>

          <button
            onClick={() => setShowExitModal(true)}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center space-x-1.5"
          >
            <XCircle className="w-4 h-4" />
            <span>Process Exit Checkout</span>
          </button>

          <button
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
                    {log.status === 'ACTIVE' && (
                      <button
                        onClick={() => onVehicleExit(log.vehicleNumber)}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded transition-colors shadow-sm"
                      >
                        Exit Checkout
                      </button>
                    )}
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

      {/* Manual Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-900 relative">
            <button
              onClick={() => setShowEntryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              ✕
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              Manual Vehicle Entry & Auto Slot Allocation
            </h3>

            <form onSubmit={handleManualEntry} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Vehicle License Plate Number</label>
                <input
                  type="text"
                  placeholder="e.g. KA-01-EX-8821"
                  value={entryPlate}
                  onChange={(e) => setEntryPlate(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Vehicle Category</label>
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as VehicleType)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-emerald-600"
                >
                  <option value="SEDAN">Sedan</option>
                  <option value="SUV">SUV (Requires 2.5m Clearance)</option>
                  <option value="EV">EV (Requires EV Rapid Hub)</option>
                  <option value="TWO_WHEELER">Two Wheeler</option>
                  <option value="HATCHBACK">Hatchback</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 text-[11px] leading-relaxed font-mono">
                Rules Engine will automatically assign the nearest vacant compatible slot in Basements B1, B2, or B3.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Process Entry & Assign Slot</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manual Exit Modal */}
      {showExitModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-900 relative">
            <button
              onClick={() => setShowExitModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              ✕
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              Vehicle Exit Checkout
            </h3>

            <form onSubmit={handleManualExit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">License Plate or Slot Number</label>
                <input
                  type="text"
                  placeholder="e.g. KA-01-EX-8821 or B1-P01-S01"
                  value={exitPlate}
                  onChange={(e) => setExitPlate(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-rose-600"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <XCircle className="w-4 h-4" />
                <span>Calculate Dwell Duration & Release Slot</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
