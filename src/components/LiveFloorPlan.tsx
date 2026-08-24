import React, { useState } from 'react';
import { ParkingSlot, SlotStatus, VehicleType, Allocation } from '../types';
import {
  Layers,
  Search,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  Wrench,
  Car,
  Shield,
  Maximize2,
  Info,
  Filter,
  User,
  ArrowRight
} from 'lucide-react';

interface LiveFloorPlanProps {
  slots: ParkingSlot[];
  onUpdateSlotStatus: (slotId: string, newStatus: SlotStatus) => void;
  onVehicleEntry: (vehicleNumber: string, vehicleType?: VehicleType) => void;
  onVehicleExit: (vehicleNumberOrSlot: string) => void;
  onRefresh: () => void;
}

export const LiveFloorPlan: React.FC<LiveFloorPlanProps> = ({
  slots,
  onUpdateSlotStatus,
  onVehicleEntry,
  onVehicleExit,
  onRefresh,
}) => {
  const [selectedFloor, setSelectedFloor] = useState<'ALL' | 'B1' | 'B2' | 'B3' | 'Ground'>('ALL');
  const [selectedSlot, setSelectedSlot] = useState<ParkingSlot | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [entryVehicleNum, setEntryVehicleNum] = useState<string>('');
  const [entryVehicleType, setEntryVehicleType] = useState<VehicleType>('SEDAN');

  // Pagination & View Mode
  const [viewMode, setViewMode] = useState<'SLOTS' | 'PUZZLE_PALLETS'>('SLOTS');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Filter slots for current floor
  const floorSlots = slots.filter((s) => {
    if (selectedFloor === 'ALL') return true;
    if (selectedFloor === 'Ground') {
      return s.basement === 'Ground' || s.basement === 'Driveway';
    }
    return s.basement === selectedFloor;
  });

  const filteredSlots = floorSlots.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && s.slotType !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSlot = s.slotNumber.toLowerCase().includes(q);
      const matchVehicle = s.currentVehicle && s.currentVehicle.toLowerCase().includes(q);
      const matchLoc = s.floorLocation.toLowerCase().includes(q);
      if (!matchSlot && !matchVehicle && !matchLoc) return false;
    }
    return true;
  }).sort((a, b) => {
    // Empty (VACANT) slots must be displayed first, as soon as filled (OCCUPIED) pushed to last
    const statusOrder: Record<SlotStatus, number> = {
      VACANT: 0,
      RESERVED: 1,
      MAINTENANCE: 2,
      OCCUPIED: 3,
    };
    const orderA = statusOrder[a.status] ?? 4;
    const orderB = statusOrder[b.status] ?? 4;
    if (orderA !== orderB) return orderA - orderB;
    return a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true });
  });

  // Summary counts for selected floor
  const totalFloor = floorSlots.length;
  const occupiedFloor = floorSlots.filter((s) => s.status === 'OCCUPIED').length;
  const vacantFloor = floorSlots.filter((s) => s.status === 'VACANT').length;
  const reservedFloor = floorSlots.filter((s) => s.status === 'RESERVED').length;
  const maintFloor = floorSlots.filter((s) => s.status === 'MAINTENANCE').length;

  // Group slots into Puzzle Modules / Pallets Matrix
  const puzzleModulesMap: Record<string, { puzzleId: string; basement: string; slots: ParkingSlot[] }> = {};
  floorSlots.forEach((slot) => {
    const slotNum = slot.slotNumber || slot.id || '';
    const pId = slot.puzzleNumber || (slotNum.includes('-') ? (slotNum.split('-S')[0] || slotNum) : `${slot.basement || 'B1'}-PUZZLE-01`);
    if (!puzzleModulesMap[pId]) {
      puzzleModulesMap[pId] = {
        puzzleId: pId,
        basement: slot.basement || 'B1',
        slots: [],
      };
    }
    puzzleModulesMap[pId].slots.push(slot);
  });

  const puzzleModulesList = Object.values(puzzleModulesMap).filter((mod) => {
    if (statusFilter !== 'ALL') {
      return mod.slots.some((s) => s.status === statusFilter);
    }
    if (typeFilter !== 'ALL') {
      return mod.slots.some((s) => s.slotType === typeFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        mod.puzzleId.toLowerCase().includes(q) ||
        mod.slots.some(
          (s) =>
            s.slotNumber.toLowerCase().includes(q) ||
            (s.currentVehicle && s.currentVehicle.toLowerCase().includes(q))
        )
      );
    }
    return true;
  });

  // Calculate Pagination slice
  const totalSlotsPages = Math.ceil(filteredSlots.length / pageSize) || 1;
  const puzzlePageSize = 4; // 4 puzzle stackers per page for a single-page fit
  const totalPuzzlePages = Math.ceil(puzzleModulesList.length / puzzlePageSize) || 1;

  const currentTotalPages = viewMode === 'SLOTS' ? totalSlotsPages : totalPuzzlePages;
  const validCurrentPage = Math.min(currentPage, currentTotalPages) || 1;

  const paginatedSlots = filteredSlots.slice(
    (validCurrentPage - 1) * pageSize,
    validCurrentPage * pageSize
  );

  const paginatedPuzzleModules = puzzleModulesList.slice(
    (validCurrentPage - 1) * puzzlePageSize,
    validCurrentPage * puzzlePageSize
  );

  const getFormattedParkingType = (type?: string): 'Ground' | 'Puzzle' | 'Stack' => {
    if (!type) return 'Ground';
    const u = type.toUpperCase();
    if (u.includes('PUZZLE')) return 'Puzzle';
    if (u.includes('STACK')) return 'Stack';
    if (u.includes('GROUND')) return 'Ground';
    return 'Ground';
  };

  const handleManualAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryVehicleNum) return;
    onVehicleEntry(entryVehicleNum, entryVehicleType);
    setEntryVehicleNum('');
    setSelectedSlot(null);
  };

  const getStatusBg = (status: SlotStatus) => {
    switch (status) {
      case 'VACANT':
        return 'bg-emerald-50/90 border-emerald-300 text-emerald-900 hover:bg-emerald-100/90 shadow-sm';
      case 'OCCUPIED':
        return 'bg-rose-50/90 border-rose-300 text-rose-900 hover:bg-rose-100/90 shadow-sm';
      case 'RESERVED':
        return 'bg-amber-50/90 border-amber-300 text-amber-900 hover:bg-amber-100/90 shadow-sm';
      case 'MAINTENANCE':
        return 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-800';
    }
  };

  const getStatusBadge = (status: SlotStatus) => {
    switch (status) {
      case 'VACANT':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">VACANT</span>;
      case 'OCCUPIED':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-300">OCCUPIED</span>;
      case 'RESERVED':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">RESERVED</span>;
      case 'MAINTENANCE':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-200 text-slate-700 border border-slate-300">MAINTENANCE</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary Heading Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/30 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Monitoring System
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1 text-white flex items-center gap-2 font-sans">
            Live Parking Slots
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Real-time level occupancy, sensor grid, and puzzle stacker pallets matrix
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-950/80 p-1.5 rounded-xl border border-slate-700/80 gap-1 text-xs font-bold">
          <button
            onClick={() => { setViewMode('SLOTS'); setCurrentPage(1); }}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 ${
              viewMode === 'SLOTS'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Live Parking Slots ({filteredSlots.length})</span>
          </button>

          <button
            onClick={() => { setViewMode('PUZZLE_PALLETS'); setCurrentPage(1); }}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 ${
              viewMode === 'PUZZLE_PALLETS'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Maximize2 className="w-4 h-4 text-indigo-300" />
            <span>Puzzle Status Pallets ({puzzleModulesList.length})</span>
          </button>
        </div>
      </div>

      {/* Floorplan Header Controls & Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Floor Switcher Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-2 hidden sm:inline">Select Level:</span>
            {(['ALL', 'B1', 'B2', 'B3', 'Ground'] as const).map((floor) => {
              const fCount = slots.filter((s) => {
                if (floor === 'ALL') return true;
                if (floor === 'Ground') return s.basement === 'Ground' || s.basement === 'Driveway';
                return s.basement === floor;
              });
              const fTotal = fCount.length;
              const fFree = fCount.filter((s) => s.status === 'VACANT').length;
              return (
                <button
                  key={floor}
                  onClick={() => { setSelectedFloor(floor); setCurrentPage(1); }}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all ${
                    selectedFloor === floor
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 border border-blue-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>
                    {floor === 'ALL' ? 'All Parking' : floor === 'Ground' ? 'Ground / Driveway' : `Basement ${floor}`}
                  </span>
                  <span
                    className={`ml-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center space-x-1 ${
                      selectedFloor === floor ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800 border border-slate-300'
                    }`}
                  >
                    <span className="text-emerald-500 font-black">{fFree} Free</span>
                    <span className="opacity-50">/</span>
                    <span>{fTotal} Total</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search & Filters */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search slot (e.g. B1-P01), plate (KA-01)..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="VACANT">Vacant Only</option>
              <option value="OCCUPIED">Occupied Only</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
            >
              <option value="ALL">All Slot Types</option>
              <option value="EV">EV Charging Bay</option>
              <option value="SUV">SUV (2.5m Clearance)</option>
              <option value="SEDAN">Sedan Stacker</option>
              <option value="TWO_WHEELER">Two-Wheeler Bay</option>
            </select>
          </div>
        </div>

        {/* Floor Summary Bar - Geometric Stat Cards */}
        <div className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Total Level Capacity</span>
            <span className="text-2xl font-mono font-bold text-slate-900">{totalFloor}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Available Vacant</span>
            <span className="text-2xl font-mono font-bold text-emerald-600">{vacantFloor}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Occupied Vehicles</span>
            <span className="text-2xl font-mono font-bold text-rose-600">{occupiedFloor}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Reserved Slots</span>
            <span className="text-2xl font-mono font-bold text-amber-600">{reservedFloor}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Under Maintenance</span>
            <span className="text-2xl font-mono font-bold text-slate-600">{maintFloor}</span>
          </div>
        </div>
      </div>

      {/* Page Navigation & Controls Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] font-mono">
            {viewMode === 'SLOTS' ? 'Live Parking Slots Grid' : 'Puzzle Status Pallets Matrix'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600 font-mono text-[11px]">
            Page <strong>{validCurrentPage}</strong> of <strong>{currentTotalPages}</strong>
            <span className="opacity-75 ml-1">
              ({viewMode === 'SLOTS' ? filteredSlots.length : puzzleModulesList.length} total items)
            </span>
          </span>
        </div>

        {/* Page Wise Next / Previous Navigation Buttons */}
        <div className="flex items-center space-x-2">
          {viewMode === 'SLOTS' && (
            <div className="flex items-center space-x-1.5 mr-2">
              <span className="text-slate-500 text-[10px] font-mono">Items/Page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs focus:outline-none"
              >
                <option value={12}>12 Slots</option>
                <option value={20}>20 Slots</option>
                <option value={36}>36 Slots</option>
                <option value={60}>60 Slots</option>
              </select>
            </div>
          )}

          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={validCurrentPage === 1}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center space-x-1"
          >
            <span>◄ Previous Page</span>
          </button>

          <div className="flex items-center space-x-1 font-mono">
            {Array.from({ length: Math.min(5, currentTotalPages) }, (_, idx) => {
              let pNum = idx + 1;
              if (currentTotalPages > 5) {
                if (validCurrentPage > 3) pNum = validCurrentPage - 2 + idx;
                if (pNum > currentTotalPages) pNum = currentTotalPages - (4 - idx);
              }
              if (pNum < 1 || pNum > currentTotalPages) return null;
              return (
                <button
                  key={pNum}
                  onClick={() => setCurrentPage(pNum)}
                  className={`w-7 h-7 rounded-lg font-bold transition-all ${
                    validCurrentPage === pNum
                      ? 'bg-blue-600 text-white shadow-md border border-blue-500'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(currentTotalPages, p + 1))}
            disabled={validCurrentPage === currentTotalPages}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center space-x-1"
          >
            <span>Next Page ►</span>
          </button>
        </div>
      </div>

      {/* Main Grid View: Live Parking Slots */}
      {viewMode === 'SLOTS' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[420px]">
          {filteredSlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search className="w-10 h-10 mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No parking slots found matching your query filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 gap-3">
              {paginatedSlots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlot(slot)}
                  className={`p-3 rounded-xl border text-left transition-all relative group flex flex-col justify-between ${getStatusBg(
                    slot.status
                  )}`}
                >
                  <div className="w-full">
                    {/* Slot ID */}
                    <div className="flex items-center justify-between w-full text-[10px]">
                      <span className="font-extrabold tracking-tight truncate text-slate-900 font-mono text-sm">
                        {slot.slotNumber}
                      </span>
                      {slot.slotType === 'EV' && <Zap className="w-4 h-4 text-emerald-600 shrink-0 ml-1" />}
                    </div>

                    {/* Slot Type & Parking Mechanism */}
                    <div className="flex items-center justify-between mt-1 text-[9px] font-bold gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-extrabold font-mono uppercase tracking-tight">
                        {slot.slotType === 'SUV' ? 'CSUV/SUV' : slot.slotType === 'TWO_WHEELER' ? '2W' : slot.slotType}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/90 text-slate-800 font-bold uppercase tracking-wider">
                        {getFormattedParkingType(slot.parkingType)}
                      </span>
                    </div>
                  </div>

                  {/* Vehicle Plate or Status */}
                  <div className="my-1.5">
                    {slot.status === 'OCCUPIED' && slot.currentVehicle ? (
                      <div>
                        <div className="font-mono text-[11px] font-bold truncate bg-slate-900 text-white px-2 py-1 rounded shadow-sm">
                          {slot.currentVehicle}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVehicleExit(slot.currentVehicle || slot.slotNumber);
                          }}
                          className="mt-1.5 w-full py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-black flex items-center justify-center space-x-1 shadow-xs transition-colors"
                          title="Mark Vehicle Exit & Free Slot"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Mark Exit</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] capitalize font-bold opacity-80">{slot.status.toLowerCase()}</div>
                    )}
                  </div>

                  {/* Bottom details */}
                  <div className="flex items-center justify-between text-[10px] opacity-75 pt-1.5 border-t border-slate-300/60 font-medium">
                    <span className="font-mono font-bold text-slate-700">
                      {selectedFloor === 'ALL' ? slot.basement : slot.height}
                    </span>
                    {selectedFloor === 'ALL' && <span>{slot.height}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Secondary View: Puzzle Status Pallets Matrix */}
      {viewMode === 'PUZZLE_PALLETS' && (
        <div className="space-y-4">
          {puzzleModulesList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No puzzle stacker modules match your search filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedPuzzleModules.map((mod) => {
                const totalModSlots = mod.slots.length;
                const freeModSlots = mod.slots.filter((s) => s.status === 'VACANT').length;
                const occModSlots = mod.slots.filter((s) => s.status === 'OCCUPIED').length;

                return (
                  <div
                    key={mod.puzzleId}
                    className="bg-white border-2 border-slate-200 rounded-2xl p-5 shadow-sm space-y-3"
                  >
                    {/* Module Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-base text-slate-900 font-mono">
                            Puzzle Stacker #{mod.puzzleId}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-100 text-blue-800 border border-blue-200">
                            {mod.basement}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono">
                          Mechanical Stacker Pallets Matrix ({totalModSlots} Levels)
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          PLC OPERATIONAL
                        </span>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          <span className="text-emerald-600 font-bold">{freeModSlots} Free</span> / {occModSlots} Occupied
                        </div>
                      </div>
                    </div>

                    {/* Pallets List */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {mod.slots.map((palletSlot) => (
                        <div
                          key={palletSlot.id}
                          onClick={() => setSelectedSlot(palletSlot)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all ${getStatusBg(
                            palletSlot.status
                          )}`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                            <span>Pallet {palletSlot.slotNumber}</span>
                            <span className="opacity-70">{palletSlot.height}</span>
                          </div>

                          <div className="text-[10px] font-bold my-1">
                            {palletSlot.status === 'OCCUPIED' && palletSlot.currentVehicle ? (
                              <div className="space-y-1">
                                <span className="bg-slate-900 text-white font-mono px-1.5 py-0.5 rounded text-[9px] block truncate">
                                  {palletSlot.currentVehicle}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onVehicleExit(palletSlot.currentVehicle || palletSlot.slotNumber);
                                  }}
                                  className="w-full py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[8.5px] font-black flex items-center justify-center space-x-1 shadow-xs transition-colors"
                                  title="Mark Vehicle Exit from Pallet"
                                >
                                  <XCircle className="w-2.5 h-2.5" />
                                  <span>Mark Exit</span>
                                </button>
                              </div>
                            ) : (
                              <span>{palletSlot.status}</span>
                            )}
                          </div>

                          <div className="text-[9px] text-slate-600 border-t border-slate-300/50 pt-1 flex items-center justify-between font-mono">
                            <span>{palletSlot.slotType}</span>
                            <span className="text-emerald-700 font-bold">Lock: OK</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Stacker System Diagnostics */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-[10px] font-mono text-slate-600">
                      <span className="flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>Motor: <strong>Hydraulic Lift Ready</strong></span>
                      </span>
                      <span className="text-emerald-600 font-bold">Safety Sensor: CLEAR</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Page Navigation Footer Control */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 font-mono text-xs">
          Showing Page <strong>{validCurrentPage}</strong> of <strong>{currentTotalPages}</strong>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={validCurrentPage === 1}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center space-x-1"
          >
            <span>◄ Previous Page</span>
          </button>

          <button
            onClick={() => setCurrentPage((p) => Math.min(currentTotalPages, p + 1))}
            disabled={validCurrentPage === currentTotalPages}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center space-x-1"
          >
            <span>Next Page ►</span>
          </button>
        </div>
      </div>

      {/* Slot Inspector / Action Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl text-slate-900 relative">
            <button
              onClick={() => setSelectedSlot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-lg font-bold"
            >
              ✕
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Car className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  Slot {selectedSlot.slotNumber} ({selectedSlot.slotType})
                  {getStatusBadge(selectedSlot.status)}
                </h3>
                <p className="text-xs text-slate-500 font-mono">{selectedSlot.floorLocation}</p>
              </div>
            </div>

            {/* Spec Details */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-5">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Slot Type</span>
                <span className="font-semibold text-slate-900">{selectedSlot.slotType} ({selectedSlot.height} Clearance)</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Parking Type</span>
                <span className="font-semibold text-slate-900">{getFormattedParkingType(selectedSlot.parkingType)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Allocation</span>
                <span className="font-semibold text-blue-600">{selectedSlot.allocation}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">ANPR Camera</span>
                <span className="font-mono text-slate-700">{selectedSlot.cameraNumber || 'G-ANPR-CAM01'}</span>
              </div>
            </div>

            {/* Current Occupant Details */}
            {selectedSlot.status === 'OCCUPIED' && selectedSlot.currentVehicle && (
              <div className="mb-5 bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Occupied Vehicle</span>
                  <span className="text-xs font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm">
                    {selectedSlot.currentVehicle}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-700 pt-2 border-t border-rose-200">
                  <button
                    onClick={() => {
                      onVehicleExit(selectedSlot.currentVehicle!);
                      setSelectedSlot(null);
                    }}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Process Vehicle Exit Checkout</span>
                  </button>
                </div>
              </div>
            )}

            {/* Actions for Vacant / Other status */}
            {selectedSlot.status === 'VACANT' && (
              <form onSubmit={handleManualAssign} className="mb-5 space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-800 block">Direct Vehicle Entry to this Slot</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter License Plate (e.g. KA-01-AB-1234)"
                    value={entryVehicleNum}
                    onChange={(e) => setEntryVehicleNum(e.target.value)}
                    required
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono"
                  />
                  <select
                    value={entryVehicleType}
                    onChange={(e) => setEntryVehicleType(e.target.value as VehicleType)}
                    className="bg-white border border-slate-300 rounded-xl px-2 py-2 text-xs text-slate-900 font-mono"
                  >
                    <option value="SEDAN">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="EV">EV</option>
                    <option value="TWO_WHEELER">Two Wheeler</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Assign Vehicle Entry</span>
                </button>
              </form>
            )}

            {/* Quick Status Toggles */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
              <button
                onClick={() => {
                  onUpdateSlotStatus(selectedSlot.id, 'MAINTENANCE');
                  setSelectedSlot(null);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors border border-slate-300 flex items-center space-x-1"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Mark Maintenance</span>
              </button>

              <button
                onClick={() => {
                  onUpdateSlotStatus(selectedSlot.id, 'RESERVED');
                  setSelectedSlot(null);
                }}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition-colors border border-amber-300"
              >
                Reserve Slot
              </button>

              <button
                onClick={() => {
                  onUpdateSlotStatus(selectedSlot.id, 'VACANT');
                  setSelectedSlot(null);
                }}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-medium transition-colors border border-emerald-300"
              >
                Set Vacant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
