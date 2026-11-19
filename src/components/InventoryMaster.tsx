import React, { useState, useRef, useMemo } from 'react';
import { ParkingSlot, SlotStatus } from '../types';
import { useWriteGuard } from '../utils/withSite';
import { SiteCodeChip } from './SiteCodeChip';
import type { SlotField as SlotFieldName } from '../utils/slotFields';
import { optionsFor, labelFor, isCode, inventoryRow, slotMatchesFilters, compareInventory, INVENTORY_CSV_COLUMNS } from '../utils/slotFields';
import { previewSlotCsv, sendableRows, mergeServerRows, sampleCsv, TEMPLATE_HELP, inventoryExportUrl } from '../utils/slotCsv';
import { getSessionToken } from '../sessionTokenFallback';
import { emptyNewSlot, selectModel, missingRequired, buildSavePayload, mapSaveError } from '../utils/slotEditor';
import { planBulkAdd, bulkAddRows, bulkOutcome, COPY_BULK_NAMES_EXIST, type BulkOutcome } from '../utils/bulkAdd';
import {
  autoFloorLocation, checkZoneForm, COPY_NAME_EXISTS, mapZoneSaveError, nameTaken, originOf, setZoneInputs, usesZoneForm, zoneInputsOf, type ZoneFormOrigin,
} from '../utils/slotZoneForm';
import {
  Cpu,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Wrench,
  ShieldAlert,
  Car,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  Edit2,
  X,
  AlertTriangle,
  Check,
  RefreshCw,
  Sparkles,
  Trash2
} from 'lucide-react';

// 005 F1: one select for every list field. Options, labels and codes come from slotFields (through selectModel).
const FieldSelect: React.FC<{
  id: string; label: string; field: SlotFieldName; value: unknown; error?: string; onChange: (code: string) => void;
}> = ({ id, label, field, value, error, onChange }) => {
  const model = selectModel(field, value);
  return (
    <div>
      <label htmlFor={id} className="block text-slate-700 font-bold mb-1">{label}</label>
      <select
        id={id}
        value={model.value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
      >
        {model.options.map((o) => (
          <option key={o.value || 'placeholder'} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
};

interface InventoryMasterProps {
  slots: ParkingSlot[];
  onUpdateSlotStatus: (slotId: string, newStatus: SlotStatus) => void;
  onRefresh: () => void;
  currentSiteId: string;
  /** ANALYTICS:canExport of the viewer: the export route needs it. Without it the Download CSV button is not shown. */
  canExport?: boolean;
}

export const InventoryMaster: React.FC<InventoryMasterProps> = ({
  slots,
  onUpdateSlotStatus,
  onRefresh,
  currentSiteId,
  canExport = false,
}) => {
  const guard = useWriteGuard();
  const [activeTab, setActiveTab] = useState<'SLOTS'>('SLOTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [basementFilter, setBasementFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Single Slot Edit/Add Modal State
  const [isSlotEditModalOpen, setIsSlotEditModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Partial<ParkingSlot> | null>(null);
  const [slotFormSaving, setSlotFormSaving] = useState(false);
  const [slotFormError, setSlotFormError] = useState<string | null>(null);
  // 005 F1: server errors shown next to the field they name (400 ERR_VALIDATION {field}, 409 on the slot number)
  const [fieldErrors, setFieldErrors] = useState<{ [field: string]: string }>({});
  // 002 F5 (B1): optional slot length (m) and pallet level, typed as text so the server's own
  // validation message comes back for a bad value. Empty = not set.
  const [dimText, setDimText] = useState<{ lengthM: string; palletLevel: string }>({ lengthM: '', palletLevel: '' });
  const [dimErrors, setDimErrors] = useState<{ lengthM?: string; palletLevel?: string }>({});
  // 008 F7: the two-wheeler part of the form (Level, Zone, Slot number are typed; the slot name is built)
  const [zoneText, setZoneText] = useState('');
  const [numText, setNumText] = useState('');
  const [zoneTouched, setZoneTouched] = useState<{ zone?: boolean; number?: boolean }>({});
  const [zoneErrs, setZoneErrs] = useState<{ zone?: string; number?: string; name?: string }>({});
  const [origin, setOrigin] = useState<ZoneFormOrigin | null>(null);
  const [forceZone, setForceZone] = useState(false);

  // 008 F8: bulk add of two-wheeler slots (Level + Zone + From..To)
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulk, setBulk] = useState({ basement: '', zone: '', from: '', to: '', height: '', parkingType: '', allocation: '' });
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // Bulk Upload Slots Modal State
  const [isSlotBulkModalOpen, setIsSlotBulkModalOpen] = useState(false);
  const [slotBulkCsvText, setSlotBulkCsvText] = useState('');
  // 005 F2: what the server said for each row (renumbered to the preview's rows); null before an upload
  const [bulkRows, setBulkRows] = useState<{ row: number; slotNumber: string; result: string; errors: string[] }[] | null>(null);
  const [slotBulkUploading, setSlotBulkUploading] = useState(false);
  const [slotBulkSuccessMsg, setSlotBulkSuccessMsg] = useState<string | null>(null);
  const slotFileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter slots & sort empty (VACANT) slots first, occupied pushed to last. The filter and the order are the ones the CSV export uses (slotFields).
  const tableFilters = { basement: basementFilter, status: statusFilter, search: searchQuery };
  const filteredSlots = slots.filter((s) => slotMatchesFilters(s, tableFilters)).sort(compareInventory);

  // 005 F2: preview of the pasted / uploaded CSV, against the slots of the site it will go to
  const siteSlots = useMemo(() => slots.filter((s) => currentSiteId === 'ALL' || s.siteId === currentSiteId), [slots, currentSiteId]);
  const preview = useMemo(() => previewSlotCsv(slotBulkCsvText, siteSlots), [slotBulkCsvText, siteSlots]);
  const sendable = sendableRows(preview);

  // 008 F8: the names to create, checked against the inventory loaded for this site (the server checks again: createOnly)
  const bulkPlan = useMemo(() => planBulkAdd(bulk.basement, bulk.zone, bulk.from, bulk.to, siteSlots.map((x) => x.slotNumber)), [bulk.basement, bulk.zone, bulk.from, bulk.to, siteSlots]);
  const bulkListsChosen = bulk.height !== '' && bulk.parkingType !== '' && bulk.allocation !== '';

  const handleOpenBulkAdd = () => {
    setBulk({ basement: '', zone: '', from: '', to: '', height: '', parkingType: '', allocation: '' });
    setBulkResult(null);
    setBulkMsg(null);
    setIsBulkAddOpen(true);
  };

  const handleConfirmBulkAdd = async () => {
    if (!bulkPlan.ready || !bulkListsChosen || bulkResult) return;
    if (currentSiteId === 'ALL') {
      setBulkMsg('Select a specific site (top right) before adding slots.');
      return;
    }
    try {
      setBulkBusy(true);
      setBulkMsg(`Adding ${bulkPlan.count} slots...`);
      // ONE request; the server saves in chunks and answers after saving. createOnly: an existing name is a row error, never an update.
      const res = await fetch('/api/v1/slots/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: bulkAddRows(bulkPlan, bulk, bulk.zone.trim().toUpperCase(), currentSiteId), createOnly: true }),
      });
      const data = await res.json().catch(() => ({}));
      const serverRows = Array.isArray(data?.result?.rows) ? data.result.rows : [];
      const outcome = bulkOutcome(bulkPlan.names, serverRows);
      setBulkResult(serverRows.length ? outcome : null);
      setBulkMsg(
        serverRows.length
          ? outcome.refused === 0 ? `Added ${outcome.added} slots: ${bulkPlan.first} to ${bulkPlan.last}.` : `Added ${outcome.added} of ${bulkPlan.count}. ${outcome.refused} were not added: see the list.`
          : `Not added: ${data.message || "Couldn't save. Nothing was changed."}`
      );
      onRefresh();
      if (data.success && outcome.refused === 0) setTimeout(() => setIsBulkAddOpen(false), 1800);
    } catch (err: any) {
      setBulkMsg(`Upload failed: ${err.message || err}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDownloadCsv = () => {
    // Same route as Reports; the table's current filters go along, so the file = the rows on screen (all pages).
    window.open(inventoryExportUrl(currentSiteId, tableFilters, getSessionToken()), '_blank');
  };

  const totalSlotPages = Math.ceil(filteredSlots.length / pageSize) || 1;
  const paginatedSlots = filteredSlots.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Slot Management Handlers
  const handleOpenSlotEditModal = (slot?: ParkingSlot, opts: { setZone?: boolean } = {}) => {
    setDimText({ lengthM: slot?.lengthM != null ? String(slot.lengthM) : '', palletLevel: slot?.palletLevel != null ? String(slot.palletLevel) : '' });
    setDimErrors({});
    setFieldErrors({});
    // 008 F7: Set zone opens the normal two-wheeler form with the number taken from the old name; nothing is written until Save
    const inputs = slot ? (opts.setZone ? setZoneInputs(slot.slotNumber) : zoneInputsOf(slot)) : { zone: '', number: '' };
    setZoneText(inputs.zone);
    setNumText(inputs.number);
    setZoneTouched({});
    setZoneErrs({});
    setOrigin(originOf(slot ?? null));
    setForceZone(!!opts.setZone);
    if (slot) {
      setEditingSlot({ ...slot });
    } else {
      // AC-14: the Add form starts empty (no made-up number, location, height or type)
      setEditingSlot(emptyNewSlot() as unknown as Partial<ParkingSlot>);
    }
    setSlotFormError(null);
    setIsSlotEditModalOpen(true);
  };

  const handleDeleteSlot = async (slot: ParkingSlot) => {
    const confirmMsg = slot.status === 'OCCUPIED'
      ? `Slot ${slot.slotNumber} is currently occupied by ${slot.currentVehicle || 'a vehicle'}. Delete it anyway? This does not close out that vehicle's session — it just removes the slot record.`
      : `Delete slot ${slot.slotNumber}? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/v1/slots/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, force: slot.status === 'OCCUPIED' }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        // If it failed specifically because it's occupied and we hadn't
        // yet forced it, offer that as an explicit second confirmation
        // rather than silently retrying — the user should see why it
        // was rejected the first time.
        if (data.message?.includes('occupied') && window.confirm(`${data.message}\n\nDelete anyway?`)) {
          const retryRes = await fetch('/api/v1/slots/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId: slot.id, force: true }),
          });
          const retryData = await retryRes.json();
          if (retryData.success) onRefresh();
          else alert(retryData.message || 'Failed to delete slot.');
        } else if (!data.message?.includes('occupied')) {
          alert(data.message || 'Failed to delete slot.');
        }
      }
    } catch {
      alert('Could not reach the server. Nothing was deleted — safe to retry.');
    }
  };

  const isNewSlot = !!editingSlot && !editingSlot.id;
  // 008 F7: two-wheeler slots are named by Level + Zone + Slot number; the name is built, never typed
  const zoneMode = !!editingSlot && usesZoneForm(editingSlot.slotType, origin, forceZone);
  const zoneCheck = zoneMode ? checkZoneForm(String(editingSlot?.basement || ''), zoneText, numText, zoneTouched) : null;
  const builtName = zoneCheck?.built ?? null;
  const nameClash = !!builtName && nameTaken(builtName.slotNumber, siteSlots, editingSlot?.id);
  const missingFields = editingSlot ? missingRequired(editingSlot, isNewSlot).filter((f) => !(zoneMode && f === 'slotNumber')) : [];
  const zoneBlocked = zoneMode && (!builtName || nameClash);
  const setEditorField = (field: string, value: string) => {
    if (!editingSlot) return;
    const next = { ...editingSlot, [field]: value } as Partial<ParkingSlot>;
    // the floor location follows Level and Zone until the admin types their own
    if (zoneMode && field === 'basement') {
      const was = autoFloorLocation(String(editingSlot.basement || ''), zoneText);
      if (!editingSlot.floorLocation || editingSlot.floorLocation === was) next.floorLocation = autoFloorLocation(value, zoneText);
    }
    setEditingSlot(next);
    if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: '' });
    if (field === 'basement') setZoneErrs({});
  };
  const setZoneField = (value: string) => {
    if (!editingSlot) return;
    const zone = value.toUpperCase().replace(/\s+/g, '');
    const was = autoFloorLocation(String(editingSlot.basement || ''), zoneText);
    const floor = !editingSlot.floorLocation || editingSlot.floorLocation === was ? autoFloorLocation(String(editingSlot.basement || ''), zone) : editingSlot.floorLocation;
    setZoneText(zone);
    setZoneTouched({ ...zoneTouched, zone: true });
    setZoneErrs({ ...zoneErrs, zone: undefined, name: undefined });
    setEditingSlot({ ...editingSlot, floorLocation: floor });
  };
  const setNumberField = (value: string) => {
    setNumText(value.trim());
    setZoneTouched({ ...zoneTouched, number: true });
    setZoneErrs({ ...zoneErrs, number: undefined, name: undefined });
  };

  const handleSaveSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) {
      setSlotFormError('No slot selected.');
      return;
    }
    if (missingFields.length > 0) return;
    if (zoneMode && (!builtName || nameClash)) {
      setZoneTouched({ zone: true, number: true });
      return;
    }

    try {
      setSlotFormSaving(true);
      setSlotFormError(null);
      setFieldErrors({});
      setZoneErrs({});
      setDimErrors({});

      // A new slot never carries an id: the server makes it (AC-11). A two-wheeler slot sends its built name and zone (AC-09).
      const slotPayload = buildSavePayload(zoneMode && builtName ? { ...editingSlot, slotNumber: builtName.slotNumber, puzzleNumber: builtName.puzzleNumber } : editingSlot, dimText);

      const res = await fetch('/api/v1/slots/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: slotPayload,
          ...slotPayload,
          siteId: editingSlot.siteId || (currentSiteId !== 'ALL' ? currentSiteId : undefined),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setIsSlotEditModalOpen(false);
        setEditingSlot(null);
        onRefresh();
      } else {
        // Typed values stay in the form; the error is shown next to the field it names.
        const view = zoneMode ? mapZoneSaveError(res.status, data) : { ...mapSaveError(res.status, data), zoneErrors: {} };
        setZoneErrs(view.zoneErrors);
        setFieldErrors(view.fieldErrors);
        setDimErrors(view.dimErrors);
        setSlotFormError(view.banner);
      }
    } catch (err: any) {
      setSlotFormError(err.message || 'Error communicating with server');
    } finally {
      setSlotFormSaving(false);
    }
  };

  const handleSlotBulkTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSlotBulkCsvText(e.target.value);
    setBulkRows(null);
    setSlotBulkSuccessMsg(null);
  };

  const handleSlotFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSlotBulkCsvText(event.target?.result as string);
      setBulkRows(null);
      setSlotBulkSuccessMsg(null);
    };
    reader.readAsText(file);
  };

  const handleDownloadSlotSampleCSV = () => {
    // Codes come from slotFields. LengthM (metres, 0–20) and PalletLevel (1–10, puzzle stackers) are optional (002 B1).
    const csvContent = sampleCsv();

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Parking_Slots_Inventory_Sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmSlotBulkUpload = async () => {
    if (sendable.length === 0) return;
    if (currentSiteId === 'ALL') {
      setSlotBulkSuccessMsg('Select a specific site (top right) before bulk-uploading — "All Sites" is ambiguous for new inventory.');
      return;
    }
    try {
      setSlotBulkUploading(true);
      setSlotBulkSuccessMsg(`Uploading & processing ${sendable.length} inventory slots...`);

      // Only rows that passed the preview are sent, with codes; a row's own id is never sent (matching is by slot number).
      const res = await fetch('/api/v1/slots/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: sendable.map((p) => ({ ...p.slot, siteId: currentSiteId })) }),
      });
      const data = await res.json().catch(() => ({}));
      const serverRows = Array.isArray(data?.result?.rows) ? data.result.rows : [];
      const merged = mergeServerRows(preview, serverRows);
      const failed = merged.filter((r) => r.result === 'error' || r.result === 'pending').length;
      setBulkRows(serverRows.length ? merged : null);
      if (data.success) {
        setSlotBulkSuccessMsg(data.message || `Uploaded ${sendable.length} slots.`);
      } else {
        setSlotBulkSuccessMsg(`Upload note: ${data.message || 'Not processed'}`);
      }

      // Keep the dialog open when some rows were refused or the upload failed, so the reasons can be read.
      onRefresh();
      if (!data.success || failed > 0) return;
      setTimeout(() => {
        setIsSlotBulkModalOpen(false);
        setSlotBulkSuccessMsg(null);
        setSlotBulkCsvText('');
        setBulkRows(null);
      }, 1800);
    } catch (err: any) {
      console.error('Slot Bulk Upload Error:', err);
      setSlotBulkSuccessMsg(`Upload failed: ${err.message || err}`);
    } finally {
      setSlotBulkUploading(false);
    }
  };

  // Reconstructed: this helper was lost from an earlier edit (its own
  // usages were the only reason CheckCircle/Wrench/ShieldAlert/Car
  // were still imported), matching the same visual pattern used for
  // getEmployeeStatusBadge.
  const getSlotStatusBadge = (status?: SlotStatus) => {
    switch (status) {
      case 'OCCUPIED':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-300 inline-flex items-center space-x-1">
            <Car className="w-3 h-3 text-slate-600" />
            <span>{labelFor('status', 'OCCUPIED')}</span>
          </span>
        );
      case 'RESERVED':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center space-x-1">
            <ShieldAlert className="w-3 h-3 text-amber-600" />
            <span>{labelFor('status', 'RESERVED')}</span>
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center space-x-1">
            <Wrench className="w-3 h-3 text-rose-600" />
            <span>{labelFor('status', 'MAINTENANCE')}</span>
          </span>
        );
      case 'VACANT':
      default:
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>{labelFor('status', 'VACANT')}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-tab Switcher */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setActiveTab('SLOTS');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all ${
                activeTab === 'SLOTS'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 border border-blue-600'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
              }`}
            >
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>Slots Inventory</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] ${
                  activeTab === 'SLOTS' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {slots.length}
              </span>
            </button>
          </div>

          {/* Action Buttons for Slots Inventory */}
          {activeTab === 'SLOTS' && (
            <div className="flex items-center space-x-2">
              <button
                {...guard()}
                onClick={() => handleOpenSlotEditModal()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Cpu className="w-4 h-4" />
                <span>+ Add Slot</span>
              </button>

              <button
                {...guard()}
                onClick={() => {
                  setSlotBulkCsvText('');
                  setBulkRows(null);
                  setSlotBulkSuccessMsg(null);
                  setIsSlotBulkModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Bulk Upload Inventory</span>
              </button>

              <button
                {...guard()}
                onClick={handleOpenBulkAdd}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Cpu className="w-4 h-4 text-blue-300" />
                <span>Bulk add two-wheeler</span>
              </button>

              {canExport && (
                <button
                  onClick={handleDownloadCsv}
                  disabled={currentSiteId === 'ALL'}
                  title={currentSiteId === 'ALL' ? 'Select a specific site to download its inventory' : 'Download the rows now shown in the table (current filters, all pages) as CSV'}
                  className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5 disabled:opacity-40"
                >
                  <Download className="w-4 h-4 text-blue-300" />
                  <span>Download CSV</span>
                </button>
              )}
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search slot number, vehicle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs"
              />
            </div>

            <select
              value={basementFilter}
              onChange={(e) => setBasementFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
            >
              <option value="ALL">All Levels</option>
              {optionsFor('basement').map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
            >
              <option value="ALL">All Statuses</option>
              {optionsFor('status').map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  {INVENTORY_CSV_COLUMNS.map((name) => <th key={name} className="p-3.5">{name}</th>)}
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSlots.map((slot) => {
                  // Table = CSV: the cells are inventoryRow (labels; a legacy value reads "<value> (old)")
                  const cells = inventoryRow(slot);
                  return (
                  <tr key={slot.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      <SiteCodeChip siteId={slot.siteId} />
                      {cells[0]}
                    </td>
                    <td className="p-3.5 font-medium">{cells[1]}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-800">
                      {/* 008 AC-13: blank for four-wheelers; an old two-wheeler slot with no zone reads Unzoned (the CSV cell stays blank) */}
                      {cells[2] || (slot.slotType === 'TWO_WHEELER' ? <span className="font-sans font-semibold text-amber-800">Unzoned</span> : '')}
                    </td>
                    <td className="p-3.5 text-slate-500 max-w-xs truncate" title={cells[3]}>{cells[3]}</td>
                    <td className="p-3.5 font-semibold text-blue-600">{cells[4]}</td>
                    <td className="p-3.5 text-slate-700">{cells[5]}</td>
                    <td className="p-3.5 text-slate-600 font-medium">{cells[6]}</td>
                    <td className="p-3.5 font-medium">{cells[7]}</td>
                    <td className="p-3.5">{isCode('status', slot.status) ? getSlotStatusBadge(slot.status) : cells[8]}</td>
                    <td className="p-3.5">
                      {slot.currentVehicle ? (
                        <span className="font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm text-[11px]">
                          {cells[9]}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">{cells[9]}</span>
                      )}
                    </td>
                    <td className="p-3.5">{cells[10]}</td>
                    <td className="p-3.5">{cells[11]}</td>
                    <td className="p-3.5 text-right space-x-1">

                      <button
                        {...guard()}
                        onClick={() => handleOpenSlotEditModal(slot)}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded border border-blue-300 text-[10px] font-bold transition-colors inline-flex items-center space-x-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      {slot.slotType === 'TWO_WHEELER' && !cells[2] && (
                        <button
                          {...guard('Put this slot in a zone')}
                          onClick={() => handleOpenSlotEditModal(slot, { setZone: true })}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded border border-amber-300 text-[10px] font-bold transition-colors"
                        >
                          Set zone
                        </button>
                      )}

                      {slot.status === 'MAINTENANCE' ? (
                        <button
                          {...guard()}
                          onClick={() => onUpdateSlotStatus(slot.id, 'VACANT')}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-300 text-[10px] font-bold transition-colors"
                        >
                          Clear Maintenance
                        </button>
                      ) : (
                        <button
                          {...guard()}
                          onClick={() => onUpdateSlotStatus(slot.id, 'MAINTENANCE')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-[10px] font-bold transition-colors"
                        >
                          Set Maintenance
                        </button>
                      )}

                      <button
                        {...guard('Delete this slot permanently')}
                        onClick={() => handleDeleteSlot(slot)}
                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded border border-rose-300 text-[10px] font-bold transition-colors inline-flex items-center space-x-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-mono">
          <span>
            Showing Page {currentPage} of {totalSlotPages} (
            {filteredSlots.length} total entries)
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
              onClick={() =>
                setCurrentPage((p) => Math.min(totalSlotPages, p + 1))
              }
              disabled={currentPage === totalSlotPages}
              className="p-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded border border-slate-300 disabled:opacity-40 shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Single Slot Edit / Add Modal */}
      {isSlotEditModalOpen && editingSlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-xs space-y-4 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <Cpu className="w-5 h-5 text-blue-600" />
                <span>{editingSlot.id ? 'Edit Parking Slot Configuration' : 'Add New Parking Slot'}</span>
              </div>
              <button
                onClick={() => setIsSlotEditModalOpen(false)}
                className="p-1 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {slotFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{slotFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSlotSubmit} className="space-y-3">
              {zoneMode ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldSelect id="slot-basement" label="Level *" field="basement" value={editingSlot.basement}
                      error={fieldErrors.basement} onChange={(v) => setEditorField('basement', v)} />
                    <div>
                      <label htmlFor="slot-zone" className="block text-slate-700 font-bold mb-1">Zone *</label>
                      <input
                        id="slot-zone"
                        type="text"
                        maxLength={6}
                        placeholder="e.g. Z1"
                        value={zoneText}
                        onChange={(e) => setZoneField(e.target.value)}
                        aria-invalid={zoneCheck?.errors.zone || zoneErrs.zone ? true : undefined}
                        aria-describedby={zoneCheck?.errors.zone || zoneErrs.zone ? 'slot-zone-error' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                      />
                      {(zoneErrs.zone || zoneCheck?.errors.zone) && <p id="slot-zone-error" role="alert" className="mt-1 text-xs text-red-700">{zoneErrs.zone || zoneCheck?.errors.zone}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="slot-no" className="block text-slate-700 font-bold mb-1">Slot number *</label>
                      <input
                        id="slot-no"
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="e.g. 001"
                        value={numText}
                        onChange={(e) => setNumberField(e.target.value)}
                        aria-invalid={zoneCheck?.errors.number || zoneErrs.number ? true : undefined}
                        aria-describedby={zoneCheck?.errors.number || zoneErrs.number ? 'slot-no-error' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                      />
                      {(zoneErrs.number || zoneCheck?.errors.number) && <p id="slot-no-error" role="alert" className="mt-1 text-xs text-red-700">{zoneErrs.number || zoneCheck?.errors.number}</p>}
                    </div>
                    <div>
                      <span id="slot-name-label" className="block text-slate-700 font-bold mb-1">Slot name</span>
                      <output
                        id="slot-name"
                        aria-labelledby="slot-name-label"
                        aria-describedby={nameClash || zoneErrs.name ? 'slot-name-error' : undefined}
                        className="block w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold"
                      >
                        {builtName ? builtName.slotNumber : '—'}
                      </output>
                      {(nameClash || zoneErrs.name) && <p id="slot-name-error" role="alert" className="mt-1 text-xs text-red-700">{COPY_NAME_EXISTS}</p>}
                    </div>
                  </div>
                  {editingSlot.id && forceZone && (
                    <p className="text-slate-600">
                      Setting the zone renames this slot from <span className="font-mono font-bold">{origin ? editingSlot.slotNumber : ''}</span>{builtName ? <> to <span className="font-mono font-bold">{builtName.slotNumber}</span></> : null}. Older log rows keep the old name.
                    </p>
                  )}
                </>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="slot-number" className="block text-slate-700 font-bold mb-1">Slot Identifier Number *</label>
                  <input
                    id="slot-number"
                    type="text"
                    placeholder="e.g. B1-P01-S01"
                    value={editingSlot.slotNumber || ''}
                    onChange={(e) => setEditorField('slotNumber', e.target.value.toUpperCase())}
                    aria-invalid={fieldErrors.slotNumber ? true : undefined}
                    aria-describedby={fieldErrors.slotNumber ? 'slot-number-error' : undefined}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                  />
                  {fieldErrors.slotNumber && <p id="slot-number-error" role="alert" className="mt-1 text-xs text-red-700">{fieldErrors.slotNumber}</p>}
                  {editingSlot.slotType === 'TWO_WHEELER' && !!editingSlot.id && <p className="mt-1 text-xs text-slate-600">Zone not set. Use "Set zone" in the table to place this slot in a zone.</p>}
                </div>

                <FieldSelect id="slot-basement" label="Basement / Level *" field="basement" value={editingSlot.basement}
                  error={fieldErrors.basement} onChange={(v) => setEditorField('basement', v)} />
              </div>
              )}

              <div>
                <label htmlFor="slot-floor" className="block text-slate-700 font-bold mb-1">Floor Location Description *</label>
                <input
                  id="slot-floor"
                  type="text"
                  placeholder="e.g. North Wing Level 1 Stacker"
                  value={editingSlot.floorLocation || ''}
                  onChange={(e) => setEditorField('floorLocation', e.target.value)}
                  aria-invalid={fieldErrors.floorLocation ? true : undefined}
                  aria-describedby={fieldErrors.floorLocation ? 'slot-floor-error' : undefined}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                />
                {fieldErrors.floorLocation && <p id="slot-floor-error" role="alert" className="mt-1 text-xs text-red-700">{fieldErrors.floorLocation}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FieldSelect id="slot-type" label="Bound Vehicle Type *" field="slotType" value={editingSlot.slotType}
                  error={fieldErrors.slotType} onChange={(v) => setEditorField('slotType', v)} />
                <FieldSelect id="slot-height" label="Clearance Height *" field="height" value={editingSlot.height}
                  error={fieldErrors.height} onChange={(v) => setEditorField('height', v)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FieldSelect id="slot-parking" label="Parking Type *" field="parkingType" value={editingSlot.parkingType}
                  error={fieldErrors.parkingType} onChange={(v) => setEditorField('parkingType', v)} />
                <FieldSelect id="slot-allocation" label="Allocation Rule *" field="allocation" value={editingSlot.allocation}
                  error={fieldErrors.allocation} onChange={(v) => setEditorField('allocation', v)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="slot-length" className="block text-slate-700 font-bold mb-1">Length (m)</label>
                  <input
                    id="slot-length"
                    inputMode="decimal"
                    value={dimText.lengthM}
                    onChange={(e) => setDimText({ ...dimText, lengthM: e.target.value })}
                    aria-invalid={dimErrors.lengthM ? true : undefined}
                    aria-describedby="slot-length-help"
                    placeholder="e.g. 5.0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                  <p id="slot-length-help" className={dimErrors.lengthM ? 'mt-1 text-xs text-red-700' : 'mt-1 text-xs text-slate-600'}>
                    {dimErrors.lengthM || 'Optional. More than 0, at most 20.'}
                  </p>
                </div>
                <div>
                  <label htmlFor="slot-pallet" className="block text-slate-700 font-bold mb-1">Pallet level</label>
                  <input
                    id="slot-pallet"
                    inputMode="numeric"
                    value={dimText.palletLevel}
                    onChange={(e) => setDimText({ ...dimText, palletLevel: e.target.value })}
                    aria-invalid={dimErrors.palletLevel ? true : undefined}
                    aria-describedby="slot-pallet-help"
                    placeholder="1 = ground"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                  <p id="slot-pallet-help" className={dimErrors.palletLevel ? 'mt-1 text-xs text-red-700' : 'mt-1 text-xs text-slate-600'}>
                    {dimErrors.palletLevel || 'Optional, puzzle stackers only: 1 to 10.'}
                  </p>
                </div>
              </div>

              <FieldSelect id="slot-status" label="Slot Operational Status" field="status" value={editingSlot.status}
                error={fieldErrors.status} onChange={(v) => setEditorField('status', v)} />

              {missingFields.length > 0 && (
                <p className="text-slate-600">Fill every field marked * to save the new slot.</p>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsSlotEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={slotFormSaving || missingFields.length > 0 || zoneBlocked}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  {slotFormSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Save Slot Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Slots Inventory Modal */}
      {isSlotBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-3xl w-full p-6 text-xs space-y-4 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <Upload className="w-5 h-5 text-emerald-600" />
                <span>Bulk Upload Parking Slots Inventory (CSV)</span>
              </div>
              <button
                onClick={() => setIsSlotBulkModalOpen(false)}
                className="p-1 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {slotBulkSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold flex items-center space-x-2">
                <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{slotBulkSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200 rounded-2xl">
                <div>
                  <span className="font-bold text-blue-900 block">Download Template Sample CSV:</span>
                  <span className="text-[11px] text-blue-700">Columns: {TEMPLATE_HELP}. Codes or labels, any case. A downloaded inventory file imports back as it is.</span>
                </div>
                <button
                  onClick={handleDownloadSlotSampleCSV}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">Upload CSV File:</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  ref={slotFileInputRef}
                  onChange={handleSlotFileUpload}
                  className="w-full text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">Or Paste Raw CSV Text:</label>
                <textarea
                  rows={4}
                  value={slotBulkCsvText}
                  onChange={handleSlotBulkTextChange}
                  placeholder={`Paste CSV lines here... (e.g. ${sampleCsv().split('\n')[1]})`}
                  className="w-full bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-2xl border border-slate-800 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                />
              </div>

              {preview.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>
                      {bulkRows ? 'Result of the upload:' : `${sendable.length} of ${preview.length} rows ready to import${preview.length - sendable.length ? ` · ${preview.length - sendable.length} will be skipped` : ''}:`}
                    </span>
                  </span>
                  <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px] sticky top-0">
                        <tr>
                          <th className="p-2">Row</th>
                          <th className="p-2">Slot Number</th>
                          <th className="p-2">Level</th>
                          <th className="p-2">Vehicle type</th>
                          <th className="p-2">Height</th>
                          <th className="p-2">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {preview.map((p) => {
                          const done = bulkRows ? bulkRows[p.row - 1] : null;
                          const result = done ? done.result : p.action;
                          const problems = done ? done.errors : p.errors;
                          return (
                            <tr key={p.row} className="hover:bg-slate-50 align-top">
                              <td className="p-2 font-mono text-slate-500">{p.row}</td>
                              <td className="p-2 font-mono font-bold text-slate-900">{p.slotNumber || '-'}</td>
                              <td className="p-2 font-medium">{p.slot ? labelFor('basement', p.slot.basement) : ''}</td>
                              <td className="p-2 font-mono text-blue-600">{p.slot ? labelFor('slotType', p.slot.slotType) : ''}</td>
                              <td className="p-2 text-slate-600">{p.slot ? labelFor('height', p.slot.height) : ''}</td>
                              <td className="p-2">
                                {result === 'error' ? (
                                  <span className="text-red-700 font-semibold">{problems.map((m, i) => <span key={i} className="block">{m}</span>)}</span>
                                ) : (
                                  <span className={result === 'add' || result === 'added' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                    {result === 'add' ? 'New slot' : result === 'update' ? 'Updates existing slot' : result === 'added' ? 'Added' : result === 'updated' ? 'Updated' : 'Not sent'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-slate-500 font-mono text-[11px]">{preview.length} rows parsed</span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsSlotBulkModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    {...guard()}
                    onClick={handleConfirmSlotBulkUpload}
                    disabled={slotBulkUploading || sendable.length === 0 || !!bulkRows || !!guard().disabled}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-40"
                  >
                    {slotBulkUploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>Confirm & Save ({sendable.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 008 F8: Bulk add two-wheeler slots */}
      {isBulkAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-add-title" className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full p-6 text-xs space-y-4 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div id="bulk-add-title" className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <Cpu className="w-5 h-5 text-blue-600" />
                <span>Bulk add two-wheeler slots</span>
              </div>
              <button onClick={() => setIsBulkAddOpen(false)} aria-label="Close" className="p-1 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkMsg && (
              <div role="status" className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold flex items-center space-x-2">
                <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{bulkMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FieldSelect id="bulk-level" label="Level *" field="basement" value={bulk.basement} onChange={(v) => setBulk({ ...bulk, basement: v })} />
              <div>
                <label htmlFor="bulk-zone" className="block text-slate-700 font-bold mb-1">Zone *</label>
                <input
                  id="bulk-zone"
                  type="text"
                  maxLength={6}
                  placeholder="e.g. Z1"
                  value={bulk.zone}
                  onChange={(e) => setBulk({ ...bulk, zone: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                  aria-invalid={bulkPlan.errors.zone ? true : undefined}
                  aria-describedby={bulkPlan.errors.zone ? 'bulk-zone-error' : undefined}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                />
                {bulkPlan.errors.zone && <p id="bulk-zone-error" role="alert" className="mt-1 text-xs text-red-700">{bulkPlan.errors.zone}</p>}
              </div>
              <div>
                <label htmlFor="bulk-from" className="block text-slate-700 font-bold mb-1">From *</label>
                <input
                  id="bulk-from"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1"
                  value={bulk.from}
                  onChange={(e) => setBulk({ ...bulk, from: e.target.value.trim() })}
                  aria-invalid={bulkPlan.errors.from ? true : undefined}
                  aria-describedby={bulkPlan.errors.from ? 'bulk-from-error' : undefined}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                />
                {bulkPlan.errors.from && <p id="bulk-from-error" role="alert" className="mt-1 text-xs text-red-700">{bulkPlan.errors.from}</p>}
              </div>
              <div>
                <label htmlFor="bulk-to" className="block text-slate-700 font-bold mb-1">To *</label>
                <input
                  id="bulk-to"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="40"
                  value={bulk.to}
                  onChange={(e) => setBulk({ ...bulk, to: e.target.value.trim() })}
                  aria-invalid={bulkPlan.errors.to ? true : undefined}
                  aria-describedby={bulkPlan.errors.to ? 'bulk-to-error' : undefined}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                />
                {bulkPlan.errors.to && <p id="bulk-to-error" role="alert" className="mt-1 text-xs text-red-700">{bulkPlan.errors.to}</p>}
              </div>
              <FieldSelect id="bulk-height" label="Clearance Height *" field="height" value={bulk.height} onChange={(v) => setBulk({ ...bulk, height: v })} />
              <FieldSelect id="bulk-parking" label="Parking Type *" field="parkingType" value={bulk.parkingType} onChange={(v) => setBulk({ ...bulk, parkingType: v })} />
              <FieldSelect id="bulk-allocation" label="Allocation Rule *" field="allocation" value={bulk.allocation} onChange={(v) => setBulk({ ...bulk, allocation: v })} />
            </div>

            <div aria-live="polite" className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              {bulkPlan.count > 0 ? (
                <>
                  <p className="text-slate-900 font-bold">
                    Will add {bulkPlan.count} {bulkPlan.count === 1 ? 'slot' : 'slots'}: <span className="font-mono">{bulkPlan.first}</span>{bulkPlan.count > 1 && <> to <span className="font-mono">{bulkPlan.last}</span></>}
                  </p>
                  <p className="text-slate-600">Vehicle type Two-wheeler, status Vacant, floor location "{autoFloorLocation(bulk.basement, bulk.zone)}".</p>
                </>
              ) : (
                <p className="text-slate-600">Enter Level, Zone, From and To to see the names.</p>
              )}
              {bulkPlan.clashes.length > 0 && (
                <p role="alert" className="text-red-700 font-semibold">
                  {COPY_BULK_NAMES_EXIST} {bulkPlan.clashes.length === 1 ? 'Already used:' : `Already used (${bulkPlan.clashes.length}):`} <span className="font-mono">{bulkPlan.clashes.slice(0, 5).join(', ')}{bulkPlan.clashes.length > 5 ? ', …' : ''}</span>
                </p>
              )}
            </div>

            {bulkResult && (
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-[11px] text-slate-700">
                  <caption className="sr-only">Result for each slot</caption>
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px] sticky top-0">
                    <tr><th className="p-2">Slot name</th><th className="p-2">Result</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {bulkResult.rows.map((r) => (
                      <tr key={r.slotNumber} className="align-top">
                        <td className="p-2 font-mono font-bold text-slate-900">{r.slotNumber}</td>
                        <td className="p-2">
                          {r.result === 'added' ? (
                            <span className="text-emerald-700 font-semibold">Added</span>
                          ) : (
                            <span className="text-red-700 font-semibold">{r.errors.length ? r.errors.map((m, i) => <span key={i} className="block">{m}</span>) : 'Not added'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button onClick={() => setIsBulkAddOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                {bulkResult ? 'Close' : 'Cancel'}
              </button>
              <button
                {...guard()}
                onClick={handleConfirmBulkAdd}
                disabled={bulkBusy || !bulkPlan.ready || !bulkListsChosen || !!bulkResult || !!guard().disabled}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-40"
              >
                {bulkBusy && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Confirm & Add ({bulkPlan.count})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
