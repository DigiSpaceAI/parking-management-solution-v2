import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ParkingSlot, VehicleType, ANPRScanResult, Employee, SlotChangeNotification, RegistrationRequest } from '../types';
import { normalizeVehicleNumber } from '../utils/plateNormalization';
import {
  Smartphone,
  Camera,
  Search,
  CheckCircle2,
  XCircle,
  Zap,
  Car,
  Layers,
  Loader2,
  Upload,
  RefreshCw,
  UserCheck,
  Check,
  ArrowRightLeft,
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  Moon,
  Sun,
  Filter,
  CheckSquare,
  Hash,
  MapPin,
  Building,
  ArrowUpRight,
  Eye,
  Users,
  IdCard,
  ShieldCheck
} from 'lucide-react';

interface AttendantMobileAppProps {
  slots: ParkingSlot[];
  employees?: Employee[];
  onVehicleEntry: (vehicleNumber: string, vehicleType?: VehicleType, entryType?: any, targetSlotNumber?: string) => void;
  onVehicleExit: (vehicleNumberOrSlot: string) => void;
  onRefresh: () => void;
}

export const AttendantMobileApp: React.FC<AttendantMobileAppProps> = ({
  slots,
  employees = [],
  onVehicleEntry,
  onVehicleExit,
  onRefresh,
}) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [inputPlate, setInputPlate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<VehicleType>('SEDAN');
  const [activeTab, setActiveTab] = useState<'CAMERA_SCAN' | 'QUICK_ENTRY' | 'QUICK_EXIT' | 'SLOT_CHANGE'>('CAMERA_SCAN');

  const [cameraScanning, setCameraScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ANPRScanResult | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>('');
  const [actionErrorMsg, setActionErrorMsg] = useState<string>('');

  const triggerError = (msg: string) => {
    setActionErrorMsg(msg);
    setTimeout(() => setActionErrorMsg(''), 4000);
  };

  const triggerSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  // Manual Slot Selector State (with live auto-fetch from uploaded inventory)
  const [manualSlotInput, setManualSlotInput] = useState<string>('');
  const [showAutoFetchSuggestions, setShowAutoFetchSuggestions] = useState<boolean>(false);
  const [showSlotPickerModal, setShowSlotPickerModal] = useState<boolean>(false);
  const [slotPickerFloor, setSlotPickerFloor] = useState<string>('ALL');
  const [slotPickerSearch, setSlotPickerSearch] = useState<string>('');
  const [slotPickerType, setSlotPickerType] = useState<string>('ALL');

  // Basement Live Slots Viewer State
  const [selectedLiveBasement, setSelectedLiveBasement] = useState<string>('ALL');
  const [liveSlotFilterStatus, setLiveSlotFilterStatus] = useState<'ALL' | 'VACANT' | 'OCCUPIED'>('ALL');
  const [liveSlotSearch, setLiveSlotSearch] = useState<string>('');

  // Slot Change State
  const [changeVehicleQuery, setChangeVehicleQuery] = useState<string>('');
  const [targetNewSlotNumber, setTargetNewSlotNumber] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>('Attendant Re-allocation / Stacker Maintenance');
  const [attendantName, setAttendantName] = useState<string>('Gate Attendant Raj');
  const [changeLoading, setChangeLoading] = useState<boolean>(false);
  const [driverNotification, setDriverNotification] = useState<SlotChangeNotification | null>(null);

  // Live Slot Direct Assign Modal State (Tap to Assign Feature)
  const [selectedLiveSlotForAssign, setSelectedLiveSlotForAssign] = useState<ParkingSlot | null>(null);
  const [directAssignPlate, setDirectAssignPlate] = useState<string>('');
  const [directAssignVehicleType, setDirectAssignVehicleType] = useState<VehicleType>('SEDAN');
  const [registrations, setRegistrations] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/registrations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.registrations)) {
          setRegistrations(d.registrations);
        }
      })
      .catch((e) => console.warn('Failed to load registrations in Attendant App:', e));
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotInputRef = useRef<HTMLInputElement>(null);

  // Vacant slots list
  const vacantSlotList = useMemo(() => slots.filter((s) => s.status === 'VACANT'), [slots]);

  // Current active vehicle category
  const currentActiveCategory: VehicleType = scanResult ? scanResult.vehicleType : selectedCategory;

  // Auto-fetch matching slots from uploaded inventory as attendant types
  const autoFetchedSuggestions = useMemo(() => {
    const q = manualSlotInput.trim().toLowerCase();
    if (!q) return [];
    return slots
      .filter(
        (s) =>
          s.slotNumber.toLowerCase().includes(q) ||
          s.basement.toLowerCase().includes(q) ||
          s.floorLocation.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [slots, manualSlotInput]);

  // Verified matched slot from uploaded inventory based on manual slot input
  const verifiedInventorySlot = useMemo(() => {
    const q = manualSlotInput.trim().toUpperCase();
    if (!q) return null;
    return slots.find((s) => s.slotNumber.toUpperCase() === q) || null;
  }, [slots, manualSlotInput]);

  // Basement-Wise Availability Summary Calculations
  const basementSummaryList = useMemo(() => {
    const basementOrder = ['Ground', 'B1', 'B2', 'B3', 'Driveway'];
    // Get unique basements from slots
    const uniqueBasements: string[] = Array.from(new Set(slots.map((s) => s.basement || 'Ground')));
    
    // Sort according to standard hierarchy
    const sortedBasements = uniqueBasements.sort((a, b) => {
      const idxA = basementOrder.indexOf(a);
      const idxB = basementOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedBasements.map((bName) => {
      const bSlots = slots.filter((s) => s.basement === bName);
      const total = bSlots.length;
      const vacant = bSlots.filter((s) => s.status === 'VACANT').length;
      const occupied = bSlots.filter((s) => s.status === 'OCCUPIED').length;
      const reserved = bSlots.filter((s) => s.status === 'RESERVED').length;
      const percentAvailable = total > 0 ? Math.round((vacant / total) * 100) : 0;

      return {
        basement: bName,
        total,
        vacant,
        occupied,
        reserved,
        percentAvailable,
      };
    });
  }, [slots]);

  // Total availability summary across all basements
  const totalStats = useMemo(() => {
    const total = slots.length;
    const vacant = vacantSlotList.length;
    const occupied = slots.filter((s) => s.status === 'OCCUPIED').length;
    const percentAvailable = total > 0 ? Math.round((vacant / total) * 100) : 0;
    return { total, vacant, occupied, percentAvailable };
  }, [slots, vacantSlotList]);

  // Filtered live slots for the Basement Wise Grid
  const filteredLiveSlots = useMemo(() => {
    let list = slots;

    if (selectedLiveBasement !== 'ALL') {
      list = list.filter((s) => s.basement === selectedLiveBasement);
    }

    if (liveSlotFilterStatus !== 'ALL') {
      list = list.filter((s) => s.status === liveSlotFilterStatus);
    }

    if (liveSlotSearch.trim()) {
      const q = liveSlotSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.slotNumber.toLowerCase().includes(q) ||
          s.floorLocation.toLowerCase().includes(q) ||
          s.slotType.toLowerCase().includes(q) ||
          (s.currentVehicle && s.currentVehicle.toLowerCase().includes(q))
      );
    }

    return list;
  }, [slots, selectedLiveBasement, liveSlotFilterStatus, liveSlotSearch]);

  // Filtered slots for attendant manual slot picker modal
  const filteredSlotPickerList = useMemo(() => {
    let list = vacantSlotList;

    if (slotPickerFloor !== 'ALL') {
      list = list.filter((s) => s.basement === slotPickerFloor);
    }

    if (slotPickerType !== 'ALL') {
      list = list.filter((s) => s.slotType === slotPickerType);
    }

    if (slotPickerSearch.trim()) {
      const q = slotPickerSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.slotNumber.toLowerCase().includes(q) ||
          s.floorLocation.toLowerCase().includes(q) ||
          s.slotType.toLowerCase().includes(q)
      );
    }

    return list;
  }, [vacantSlotList, slotPickerFloor, slotPickerType, slotPickerSearch]);

  // Find currently occupied slot matching changeVehicleQuery
  const currentOccupiedSlot = useMemo(() => {
    const q = changeVehicleQuery.trim().toUpperCase();
    if (!q) return null;
    return (
      slots.find(
        (s) =>
          s.status === 'OCCUPIED' &&
          ((s.currentVehicle && s.currentVehicle.toUpperCase().includes(q)) ||
            s.slotNumber.toUpperCase() === q)
      ) || null
    );
  }, [slots, changeVehicleQuery]);

  // Find employee corresponding to currently occupied vehicle
  const currentVehicleEmp = useMemo(() => {
    if (!currentOccupiedSlot?.currentVehicle) return null;
    const v = currentOccupiedSlot.currentVehicle.toUpperCase();
    return employees.find((e) => e.vehicleNumber.toUpperCase() === v) || null;
  }, [currentOccupiedSlot, employees]);

  const handleExecuteSlotChange = async () => {
    if (!changeVehicleQuery.trim() || !targetNewSlotNumber.trim()) return;
    setChangeLoading(true);
    setActionSuccessMsg('');
    setDriverNotification(null);

    try {
      const res = await fetch('/api/v1/slots/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleNumberOrSlot: changeVehicleQuery,
          newSlotNumber: targetNewSlotNumber,
          reason: changeReason,
          attendantName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerSuccess(data.message);
        if (data.notification) {
          setDriverNotification(data.notification);
        }
        setChangeVehicleQuery('');
        setTargetNewSlotNumber('');
        onRefresh();
      } else {
        triggerError(data.message || 'Slot change failed.');
      }
    } catch (err) {
      console.error('Slot change error:', err);
      triggerError('Failed to process slot change request.');
    } finally {
      setChangeLoading(false);
    }
  };

  // Direct Slot Assignment & Vehicle Entry (from Live Parking Slots Tap to Assign)
  const handleDirectSlotAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLiveSlotForAssign || !directAssignPlate.trim()) return;
    const normPlate = normalizeVehicleNumber(directAssignPlate.trim());
    onVehicleEntry(normPlate, directAssignVehicleType, 'MANUAL', selectedLiveSlotForAssign.slotNumber);
    setActionSuccessMsg(
      `VEHICLE ENTRY SUCCESS: Vehicle ${normPlate} (${directAssignVehicleType}) successfully assigned to Slot ${selectedLiveSlotForAssign.slotNumber} (${selectedLiveSlotForAssign.basement})!`
    );
    setSelectedLiveSlotForAssign(null);
    setDirectAssignPlate('');
    setTimeout(() => setActionSuccessMsg(''), 5000);
  };

  // Registered Vehicles & Master Whitelist Aggregation
  const [registeredRequests, setRegisteredRequests] = useState<RegistrationRequest[]>([]);
  const [showRegisteredVehiclesModal, setShowRegisteredVehiclesModal] = useState(false);
  const [registeredVehiclesSearch, setRegisteredVehiclesSearch] = useState('');
  const [showPlateDropdown, setShowPlateDropdown] = useState(false);

  useEffect(() => {
    const fetchRegistrations = async () => {
      try {
        const res = await fetch('/api/v1/registrations');
        const data = await res.json();
        if (data.requests) {
          setRegisteredRequests(data.requests);
        }
      } catch (e) {
        console.warn('Registration fetch error:', e);
      }
    };
    fetchRegistrations();
  }, []);

  // Aggregated Master List of All Registered & Bulk-Uploaded Vehicles
  const allRegisteredVehiclesList = useMemo(() => {
    const map = new Map<string, {
      id: string;
      employeeId: string;
      name: string;
      department: string;
      vehicleNumber: string;
      vehicleType: VehicleType;
      vehicleBrand: string;
      mobile?: string;
      status: string;
      source: string;
    }>();

    (employees || []).forEach((e) => {
      const norm = normalizeVehicleNumber(e.vehicleNumber);
      if (norm) {
        map.set(norm, {
          id: e.id,
          employeeId: e.employeeId,
          name: e.name,
          department: e.department || 'General',
          vehicleNumber: e.vehicleNumber,
          vehicleType: e.vehicleType || 'SEDAN',
          vehicleBrand: e.vehicleBrand || 'Standard',
          mobile: e.mobile,
          status: e.status || 'ACTIVE',
          source: 'Employee Master',
        });
      }
    });

    (registeredRequests || []).forEach((r) => {
      const norm = normalizeVehicleNumber(r.vehicleNumber);
      if (norm) {
        map.set(norm, {
          id: r.id,
          employeeId: r.employeeId || 'REG-' + r.id.slice(0, 6),
          name: r.name || 'Registered Driver',
          department: r.department || 'Operations',
          vehicleNumber: r.vehicleNumber,
          vehicleType: (r.vehicleType as VehicleType) || 'SEDAN',
          vehicleBrand: r.vehicleBrand || 'Standard',
          mobile: r.mobile,
          status: r.status === 'APPROVED' ? 'ACTIVE' : r.status,
          source: 'Bulk / Portal Registration',
        });
      }
    });

    return Array.from(map.values());
  }, [employees, registeredRequests]);

  // Auto-search employee whitelist & live Firestore registrations whenever inputPlate changes
  const cleanInputPlate = inputPlate.trim().toUpperCase();
  const normInputPlate = normalizeVehicleNumber(cleanInputPlate);

  // Instant Autocomplete Suggestions for Plate Input
  const matchingRegisteredSuggestions = useMemo(() => {
    if (!cleanInputPlate || cleanInputPlate.length < 2) return [];
    const q = cleanInputPlate.toLowerCase();
    const qNorm = normInputPlate.toLowerCase();
    return allRegisteredVehiclesList
      .filter((v) => {
        const vNorm = normalizeVehicleNumber(v.vehicleNumber).toLowerCase();
        return (
          vNorm.includes(qNorm) ||
          v.vehicleNumber.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q) ||
          v.employeeId.toLowerCase().includes(q) ||
          v.department.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [allRegisteredVehiclesList, cleanInputPlate, normInputPlate]);

  const matchedEmployee = useMemo(() => {
    if (normInputPlate.length < 2 && cleanInputPlate.length < 2) return null;

    // First check local/API employees list
    const foundEmp = employees.find((e) => {
      const eNorm = normalizeVehicleNumber(e.vehicleNumber);
      return (
        (normInputPlate && eNorm === normInputPlate) ||
        (normInputPlate && eNorm.includes(normInputPlate)) ||
        e.vehicleNumber.toUpperCase().includes(cleanInputPlate) ||
        e.employeeId.toUpperCase().includes(cleanInputPlate)
      );
    });
    if (foundEmp) return foundEmp;

    // Check fetched registrations
    const foundLive = registrations.find((r) => {
      const rNorm = normalizeVehicleNumber(r.vehicleNumber);
      return (
        (normInputPlate && rNorm === normInputPlate) ||
        (normInputPlate && rNorm.includes(normInputPlate)) ||
        r.vehicleNumber.toUpperCase().includes(cleanInputPlate)
      );
    });

    if (foundLive) {
      return {
        id: foundLive.id,
        employeeId: foundLive.employeeId || 'REG-' + foundLive.id.slice(0, 6),
        name: foundLive.name || 'Registered Driver',
        department: foundLive.department || 'Operations',
        designation: 'Authorized Vehicle',
        mobile: foundLive.mobile || '',
        email: foundLive.email || '',
        vehicleNumber: foundLive.vehicleNumber,
        vehicleType: (foundLive.vehicleType as VehicleType) || 'SEDAN',
        vehicleBrand: foundLive.vehicleBrand || 'Verified Fleet',
        status: 'ACTIVE' as const,
        isActive: true,
        createdAt: foundLive.createdAt || new Date().toISOString(),
        updatedAt: foundLive.updatedAt || new Date().toISOString(),
      };
    }

    return null;
  }, [employees, registrations, cleanInputPlate, normInputPlate]);

  // Auto-update selected category if matched employee is found
  useEffect(() => {
    if (matchedEmployee) {
      setSelectedCategory(matchedEmployee.vehicleType);
    }
  }, [matchedEmployee]);

  // Simulate or execute Camera OCR Plate Scan
  const handleScanPlateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCameraScanning(true);
      setScanResult(null);

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch('/api/v1/vehicles/scan-plate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        setScanResult(data);
        if (data.plateNumber) {
          setInputPlate(data.plateNumber);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Camera OCR Error:', err);
    } finally {
      setCameraScanning(false);
    }
  };

  const triggerSimulatedScan = async () => {
    try {
      setCameraScanning(true);
      setScanResult(null);
      const res = await fetch('/api/v1/vehicles/scan-plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: null }),
      });
      const data = await res.json();
      setScanResult(data);
      if (data.plateNumber) {
        setInputPlate(data.plateNumber);
      }
    } catch (err) {
      console.error('Simulated scan failed:', err);
    } finally {
      setCameraScanning(false);
    }
  };

  const handleExecuteEntry = () => {
    if (!inputPlate.trim()) {
      triggerError('Please enter or scan a vehicle license plate number.');
      return;
    }
    const cat = scanResult?.vehicleType || selectedCategory;
    const finalSlot = manualSlotInput.trim();

    onVehicleEntry(inputPlate, cat, 'MANUAL', finalSlot || undefined);
    triggerSuccess(
      `ENTRY GRANTED: Vehicle ${inputPlate} allocated ${finalSlot ? `slot ${finalSlot}` : 'next available vacant inventory slot'}.`
    );
    setInputPlate('');
    setScanResult(null);
    setManualSlotInput('');
  };

  const handleExecuteExit = () => {
    if (!inputPlate.trim()) {
      triggerError('Please enter vehicle license plate or slot number to checkout.');
      return;
    }
    onVehicleExit(inputPlate);
    triggerSuccess(`EXIT CHECKOUT PROCESSED for ${inputPlate}. Slot released to inventory.`);
    setInputPlate('');
    setScanResult(null);
  };

  // Helper to select slot into manual input
  const handleSelectSlotIntoInput = (slotNumber: string) => {
    setManualSlotInput(slotNumber);
    setShowAutoFetchSuggestions(false);
    setShowSlotPickerModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Control Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black text-white">Field Attendant Terminal</h2>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Gate Terminal Active
              </span>
            </div>
            <p className="text-xs text-slate-300">
              License plate scanning, manual slot number entry with auto-fetch inventory lookup, and live basement availability.
            </p>
          </div>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-700/80 px-4 py-2 rounded-xl text-xs">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-mono">TOTAL INVENTORY</span>
            <span className="font-mono font-bold text-white text-sm">{slots.length} Slots</span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div className="text-right">
            <span className="text-[10px] text-emerald-400 block font-mono">VACANT / FREE</span>
            <span className="font-mono font-black text-emerald-400 text-sm">{vacantSlotList.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Mobile Attendant POS Terminal */}
        <div className="lg:col-span-6 xl:col-span-5">
          <div
            className={`border-4 rounded-[2.5rem] shadow-2xl p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden ${
              isDarkMode
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Speaker / Notch */}
            <div
              className={`w-28 h-4 border rounded-b-xl mx-auto mb-4 flex items-center justify-center transition-colors ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <div className={`w-8 h-1 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
            </div>

            {/* Mobile App Header & Theme Switcher */}
            <div
              className={`flex items-center justify-between mb-4 pb-3 border-b transition-colors ${
                isDarkMode ? 'border-slate-800/80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow shadow-blue-600/30">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold leading-tight font-sans ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    ParkOrbit<span className="text-blue-500 font-mono"> Field</span>
                  </h3>
                  <span className="text-[10px] text-emerald-500 font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
                    Attendant Console Online
                  </span>
                </div>
              </div>

              {/* Theme Switcher Toggle & Refresh */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`p-2 rounded-xl transition-all border flex items-center space-x-1 text-xs font-mono font-bold ${
                    isDarkMode
                      ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-700 shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title="Toggle Light / Dark Mode Theme"
                >
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
                  <span className="text-[10px] uppercase hidden sm:inline">{isDarkMode ? 'Dark' : 'Light'}</span>
                </button>

                <button
                  onClick={onRefresh}
                  className={`p-2 rounded-xl transition-colors border ${
                    isDarkMode
                      ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                  }`}
                  title="Refresh System Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Success Alert Banner */}
            {actionSuccessMsg && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            {/* Error Alert Banner */}
            {actionErrorMsg && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-400 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{actionErrorMsg}</span>
              </div>
            )}

            {/* Mobile App View Tabs Switcher Bar */}
            <div
              className={`flex p-1.5 rounded-2xl mb-4 border-2 transition-colors gap-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <button
                onClick={() => setActiveTab('CAMERA_SCAN')}
                className={`flex-1 py-2 font-bold rounded-xl transition-all border flex items-center justify-center space-x-1 ${
                  activeTab === 'CAMERA_SCAN'
                    ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                    : isDarkMode
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Scan</span>
              </button>

              <button
                onClick={() => setActiveTab('QUICK_ENTRY')}
                className={`flex-1 py-2 font-bold rounded-xl transition-all border flex items-center justify-center space-x-1 ${
                  activeTab === 'QUICK_ENTRY'
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-md'
                    : isDarkMode
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Entry</span>
              </button>

              <button
                onClick={() => setActiveTab('QUICK_EXIT')}
                className={`flex-1 py-2 font-bold rounded-xl transition-all border flex items-center justify-center space-x-1 ${
                  activeTab === 'QUICK_EXIT'
                    ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                    : isDarkMode
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>

              <button
                onClick={() => setActiveTab('SLOT_CHANGE')}
                className={`flex-1 py-2 font-bold rounded-xl transition-all border flex items-center justify-center space-x-1 ${
                  activeTab === 'SLOT_CHANGE'
                    ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                    : isDarkMode
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Move Slot</span>
              </button>
            </div>

            {/* Tab 1: Camera Scan Tab */}
            {activeTab === 'CAMERA_SCAN' && (
              <div
                className={`p-4 rounded-2xl border-2 transition-colors mb-4 ${
                  isDarkMode
                    ? 'bg-slate-900/60 border-blue-900/80 shadow-inner'
                    : 'bg-blue-50/40 border-blue-200 shadow-sm'
                }`}
              >
                <div
                  className={`border-2 border-dashed rounded-2xl p-4 sm:p-5 text-center relative overflow-hidden min-h-[190px] flex flex-col items-center justify-center transition-colors ${
                    isDarkMode ? 'bg-slate-900/80 border-slate-700' : 'bg-white border-slate-300'
                  }`}
                >
                  {cameraScanning ? (
                    <div className="flex flex-col items-center text-blue-500 py-6">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <span className="text-xs font-bold">Scanning Plate from Camera...</span>
                    </div>
                  ) : scanResult ? (
                    <div className="w-full text-left space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-emerald-400">Camera OCR Match</span>
                        <span className="text-[10px] font-bold text-slate-400">ANPR Confidence 98%</span>
                      </div>

                      <div
                        className={`border rounded-xl p-3 flex items-center justify-between shadow-sm ${
                          isDarkMode
                            ? 'bg-slate-900 border-emerald-800/80 text-white'
                            : 'bg-white border-emerald-300 text-slate-900'
                        }`}
                      >
                        <div>
                          <span className="text-xs text-slate-400 block font-mono">Recognized Plate Number</span>
                          <span className="text-base font-mono font-black">{scanResult.plateNumber}</span>
                        </div>
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded border border-emerald-500/30">
                          {scanResult.vehicleType}
                        </span>
                      </div>

                      {scanResult.matchedEmployee ? (
                        <div className="bg-blue-950/60 border border-blue-800/80 rounded-xl p-2.5 text-xs text-blue-200">
                          <span className="font-bold block text-blue-100">
                            Registered Employee: {scanResult.matchedEmployee.name} ({scanResult.matchedEmployee.employeeId})
                          </span>
                          <span className="text-[11px] opacity-80 block">
                            Department: {scanResult.matchedEmployee.department}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-amber-950/60 border border-amber-800/80 rounded-xl p-2.5 text-xs text-amber-200">
                          Guest / Unregistered Visitor License Plate
                        </div>
                      )}

                      {/* Manual Slot Input with Real-Time Auto Fetch */}
                      <div className="space-y-2 pt-1 relative">
                        <div className="flex items-center justify-between">
                          <label className={`block font-bold text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            Fill / Select Slot Number:
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowSlotPickerModal(true)}
                            className="text-[11px] text-blue-400 font-bold hover:underline flex items-center space-x-1"
                          >
                            <Layers className="w-3 h-3" />
                            <span>Browse Inventory ({vacantSlotList.length})</span>
                          </button>
                        </div>

                        {/* Manual Slot Number Text Field with Auto-Fetch Suggestion */}
                        <div className="relative">
                          <input
                            type="text"
                            ref={slotInputRef}
                            placeholder="Type slot number e.g. B1-P01-S01 or G-VIS-01..."
                            value={manualSlotInput}
                            onChange={(e) => {
                              setManualSlotInput(e.target.value.toUpperCase());
                              setShowAutoFetchSuggestions(true);
                            }}
                            onFocus={() => setShowAutoFetchSuggestions(true)}
                            className={`w-full border rounded-xl px-3 py-2.5 font-mono font-bold focus:outline-none focus:border-blue-500 text-xs shadow-sm ${
                              isDarkMode
                                ? 'bg-slate-900 text-white border-slate-700 placeholder-slate-500'
                                : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                            }`}
                          />
                          {manualSlotInput && (
                            <button
                              type="button"
                              onClick={() => setManualSlotInput('')}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Auto-Fetched Matching Inventory Slots Dropdown */}
                        {showAutoFetchSuggestions && autoFetchedSuggestions.length > 0 && (
                          <div
                            className={`absolute z-30 w-full left-0 mt-1 rounded-xl border shadow-xl max-h-48 overflow-y-auto p-1 text-xs ${
                              isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          >
                            <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800 flex justify-between">
                              <span>AUTO-FETCHED FROM INVENTORY ({autoFetchedSuggestions.length})</span>
                              <span>Click to fill</span>
                            </div>
                            {autoFetchedSuggestions.map((slot) => {
                              const isVacant = slot.status === 'VACANT';
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectSlotIntoInput(slot.slotNumber)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                                    isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <span className="font-mono font-bold">{slot.slotNumber}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {slot.basement} • {slot.slotType} • {slot.height}
                                    </span>
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      isVacant
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                  >
                                    {slot.status}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Live Inventory Auto-Fetch Verification Card */}
                        {manualSlotInput.trim() && (
                          <div>
                            {verifiedInventorySlot ? (
                              <div
                                className={`p-2.5 rounded-xl border text-xs shadow-sm ${
                                  verifiedInventorySlot.status === 'VACANT'
                                    ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-100'
                                    : 'bg-rose-950/80 border-rose-700/80 text-rose-100'
                                }`}
                              >
                                <div className="flex items-center justify-between font-mono font-bold">
                                  <div className="flex items-center space-x-1.5">
                                    <span>{verifiedInventorySlot.slotNumber}</span>
                                    <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-black/40 text-slate-200 border border-white/10">
                                      {verifiedInventorySlot.basement} • {verifiedInventorySlot.height} • {verifiedInventorySlot.slotType}
                                    </span>
                                  </div>
                                  <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-black/50">
                                    {verifiedInventorySlot.status}
                                  </span>
                                </div>
                                <div className="text-[10.5px] mt-1 opacity-90">
                                  {verifiedInventorySlot.status === 'VACANT' ? (
                                    <span className="text-emerald-300 flex items-center space-x-1">
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Slot verified in inventory & ready for parking allocation.</span>
                                    </span>
                                  ) : (
                                    <span className="text-rose-300 flex items-center space-x-1">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      <span>
                                        Warning: Slot is currently {verifiedInventorySlot.status}
                                        {verifiedInventorySlot.currentVehicle ? ` by ${verifiedInventorySlot.currentVehicle}` : ''}.
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Custom slot number (Not listed in initial 1,080 uploaded inventory).</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleExecuteEntry}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Process Vehicle Entry ({manualSlotInput.trim() || 'Auto Next Vacant'})</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <Camera className={`w-10 h-10 mb-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-xs font-bold block ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                        Gate Camera OCR Scanner
                      </span>
                      <p className="text-[11px] text-slate-400 mb-4 max-w-xs">
                        Scan vehicle license plate via device camera or simulate live Gate ANPR camera.
                      </p>

                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        ref={fileInputRef}
                        onChange={handleScanPlateFile}
                        className="hidden"
                      />

                      <div className="flex gap-2 w-full">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Upload / Camera</span>
                        </button>

                        <button
                          onClick={triggerSimulatedScan}
                          className={`flex-1 py-2.5 border font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-sm ${
                            isDarkMode
                              ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                              : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                          }`}
                        >
                          <Camera className="w-4 h-4 text-blue-400" />
                          <span>Simulate Gate OCR</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Quick Single-Tap Entry */}
            {activeTab === 'QUICK_ENTRY' && (
              <div
                className={`p-4 rounded-2xl border-2 space-y-3.5 text-xs transition-colors mb-4 ${
                  isDarkMode
                    ? 'bg-slate-900/60 border-emerald-900/80 shadow-inner'
                    : 'bg-emerald-50/40 border-emerald-200 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={`font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Vehicle License Plate Number:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRegisteredVehiclesModal(true)}
                      className="text-[11px] text-emerald-400 font-bold hover:underline flex items-center space-x-1"
                    >
                      <Users className="w-3 h-3" />
                      <span>Browse Registered ({allRegisteredVehiclesList.length})</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type plate e.g. KA-01-EX-8821 or name/ID..."
                      value={inputPlate}
                      onChange={(e) => {
                        setInputPlate(e.target.value.toUpperCase());
                        setShowPlateDropdown(true);
                      }}
                      onFocus={() => setShowPlateDropdown(true)}
                      className={`w-full font-mono font-bold border rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 ${
                        isDarkMode
                          ? 'bg-slate-900 text-white border-slate-700 placeholder-slate-500'
                          : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                      }`}
                    />
                    {matchedEmployee ? (
                      <span className="absolute right-3 top-2.5 px-2 py-0.5 rounded bg-emerald-500 text-white font-bold text-[10px] flex items-center space-x-1 shadow-sm">
                        <UserCheck className="w-3 h-3" />
                        <span>REGISTERED</span>
                      </span>
                    ) : inputPlate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setInputPlate('');
                          setShowPlateDropdown(false);
                        }}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs px-1"
                      >
                        ✕
                      </button>
                    ) : null}

                    {/* Auto-suggest dropdown for matching registered vehicles */}
                    {showPlateDropdown && matchingRegisteredSuggestions.length > 0 && (
                      <div
                        className={`absolute z-30 w-full left-0 mt-1 rounded-xl border shadow-xl max-h-56 overflow-y-auto p-1 text-xs ${
                          isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <div className="px-2 py-1 text-[10px] font-mono font-bold text-emerald-400 border-b border-slate-800 flex justify-between">
                          <span>MATCHING REGISTERED VEHICLES ({matchingRegisteredSuggestions.length})</span>
                          <span>Click to auto-fill</span>
                        </div>
                        {matchingRegisteredSuggestions.map((veh) => (
                          <button
                            key={veh.id || veh.vehicleNumber}
                            type="button"
                            onClick={() => {
                              setInputPlate(veh.vehicleNumber);
                              setSelectedCategory(veh.vehicleType);
                              setShowPlateDropdown(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors ${
                              isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-emerald-50'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-emerald-400">{veh.vehicleNumber}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                                  {veh.vehicleType}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300">
                                {veh.name} • <span className="opacity-75">{veh.department}</span> ({veh.employeeId})
                              </div>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-bold">Select ➔</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Matched Whitelist Employee Card */}
                {matchedEmployee ? (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span>
                        {matchedEmployee.name} ({matchedEmployee.employeeId})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/80 text-emerald-200 font-mono">
                        {matchedEmployee.department}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-400 flex items-center justify-between font-mono">
                      <span>Plate: {matchedEmployee.vehicleNumber}</span>
                      <span>
                        Type: {matchedEmployee.vehicleType} ({matchedEmployee.vehicleBrand})
                      </span>
                    </div>
                  </div>
                ) : cleanInputPlate.length >= 3 ? (
                  <div className="p-2.5 bg-amber-950/50 border border-amber-800/70 rounded-xl text-amber-200 font-medium text-[11px] flex items-center space-x-1.5">
                    <Car className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Guest / Unregistered Vehicle — Enter or select slot below.</span>
                  </div>
                ) : null}

                {/* Vehicle Category Selector */}
                <div>
                  <label className={`block font-semibold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Vehicle Category:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['SEDAN', 'SUV', 'EV', 'CSUV', 'HATCHBACK', 'TWO_WHEELER'] as VehicleType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedCategory(type)}
                        className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all truncate ${
                          selectedCategory === type
                            ? 'bg-blue-600 border-blue-400 text-white shadow-sm'
                            : isDarkMode
                            ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Option to Fill Slot Number Manually with Auto-Fetch */}
                <div className="space-y-2 pt-1 relative">
                  <div className="flex items-center justify-between">
                    <label className={`block font-bold text-xs ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      Fill Slot Number (Auto-Fetched from Inventory):
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSlotPickerModal(true)}
                      className="text-[11px] text-emerald-400 font-bold hover:underline flex items-center space-x-1"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Browse Inventory ({vacantSlotList.length})</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type slot e.g. B1-P01-S01 or B2-S05..."
                      value={manualSlotInput}
                      onChange={(e) => {
                        setManualSlotInput(e.target.value.toUpperCase());
                        setShowAutoFetchSuggestions(true);
                      }}
                      onFocus={() => setShowAutoFetchSuggestions(true)}
                      className={`w-full border rounded-xl px-3 py-2.5 font-mono font-bold focus:outline-none focus:border-emerald-500 text-xs shadow-sm ${
                        isDarkMode
                          ? 'bg-slate-900 text-white border-slate-700 placeholder-slate-500'
                          : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                      }`}
                    />
                    {manualSlotInput && (
                      <button
                        type="button"
                        onClick={() => setManualSlotInput('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Auto-Fetched Matching Inventory Slots Dropdown */}
                  {showAutoFetchSuggestions && autoFetchedSuggestions.length > 0 && (
                    <div
                      className={`absolute z-30 w-full left-0 mt-1 rounded-xl border shadow-xl max-h-48 overflow-y-auto p-1 text-xs ${
                        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800 flex justify-between">
                        <span>AUTO-FETCHED SLOTS ({autoFetchedSuggestions.length})</span>
                        <span>Click to choose</span>
                      </div>
                      {autoFetchedSuggestions.map((slot) => {
                        const isVacant = slot.status === 'VACANT';
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => handleSelectSlotIntoInput(slot.slotNumber)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                              isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold">{slot.slotNumber}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {slot.basement} • {slot.slotType}
                              </span>
                            </div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                isVacant
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {slot.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Live Inventory Auto-Fetch Verification Card */}
                  {manualSlotInput.trim() && (
                    <div>
                      {verifiedInventorySlot ? (
                        <div
                          className={`p-2.5 rounded-xl border text-xs shadow-sm ${
                            verifiedInventorySlot.status === 'VACANT'
                              ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-100'
                              : 'bg-rose-950/80 border-rose-700/80 text-rose-100'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono font-bold">
                            <div className="flex items-center space-x-1.5">
                              <span>{verifiedInventorySlot.slotNumber}</span>
                              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-black/40 text-slate-200 border border-white/10">
                                {verifiedInventorySlot.basement} • {verifiedInventorySlot.height} • {verifiedInventorySlot.slotType}
                              </span>
                            </div>
                            <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-black/50">
                              {verifiedInventorySlot.status}
                            </span>
                          </div>
                          <div className="text-[10.5px] mt-1 opacity-90">
                            {verifiedInventorySlot.status === 'VACANT' ? (
                              <span className="text-emerald-300 flex items-center space-x-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>Slot found in uploaded inventory & available.</span>
                              </span>
                            ) : (
                              <span className="text-rose-300 flex items-center space-x-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>
                                  Slot is currently {verifiedInventorySlot.status}
                                  {verifiedInventorySlot.currentVehicle ? ` (${verifiedInventorySlot.currentVehicle})` : ''}.
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Custom slot number (Manual attendant designation).</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleExecuteEntry}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Grant Entry & Assign Slot ({manualSlotInput.trim() || 'Auto Available'})</span>
                </button>
              </div>
            )}

            {/* Tab 3: Quick Exit */}
            {activeTab === 'QUICK_EXIT' && (
              <div
                className={`p-4 rounded-2xl border-2 space-y-3 text-xs transition-colors mb-4 ${
                  isDarkMode
                    ? 'bg-slate-900/60 border-rose-900/80 shadow-inner'
                    : 'bg-rose-50/40 border-rose-200 shadow-sm'
                }`}
              >
                <div>
                  <label className={`block font-semibold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    License Plate or Slot Number:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KA-01-EX-8821 or B1-P01-S01"
                    value={inputPlate}
                    onChange={(e) => setInputPlate(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:border-rose-600 ${
                      isDarkMode
                        ? 'bg-slate-900 text-white border-slate-700 placeholder-slate-500'
                        : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                    }`}
                  />
                </div>

                <button
                  onClick={handleExecuteExit}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Process Exit & Release Slot</span>
                </button>
              </div>
            )}

            {/* Tab 4: Slot Change */}
            {activeTab === 'SLOT_CHANGE' && (
              <div
                className={`p-4 rounded-2xl border-2 space-y-3 text-xs transition-colors mb-4 ${
                  isDarkMode
                    ? 'bg-slate-900/60 border-amber-900/80 shadow-inner'
                    : 'bg-amber-50/40 border-amber-200 shadow-sm'
                }`}
              >
                <div className="bg-amber-950/60 border border-amber-800/80 rounded-xl p-2.5 flex items-start space-x-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-200 block text-[11px]">Vehicle Relocation & Driver Sync</span>
                    <p className="text-[10px] text-amber-300/80">
                      Attendant can re-allocate an occupied vehicle to a new vacant slot. Updated slot details will be dispatched to the driver.
                    </p>
                  </div>
                </div>

                <div>
                  <label className={`block font-bold mb-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    1. Vehicle Plate or Current Slot:
                  </label>
                  <input
                    type="text"
                    placeholder="Type e.g. KA-01-EX-1037 or B1-P01-S01"
                    value={changeVehicleQuery}
                    onChange={(e) => setChangeVehicleQuery(e.target.value.toUpperCase())}
                    className={`w-full font-mono font-bold border rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 ${
                      isDarkMode
                        ? 'bg-slate-900 text-white border-slate-700 placeholder-slate-500'
                        : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                    }`}
                  />
                </div>

                {/* Matched Occupied Slot Info */}
                {currentOccupiedSlot ? (
                  <div className="p-2.5 bg-blue-950/60 border border-blue-800/80 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-blue-200 font-bold">
                      <span>
                        Matched Slot: {currentOccupiedSlot.slotNumber} ({currentOccupiedSlot.basement})
                      </span>
                      <span className="px-1.5 py-0.5 bg-blue-900 text-blue-200 font-mono rounded text-[10px] border border-blue-700/60">
                        {currentOccupiedSlot.parkingType || 'Ground'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between">
                      <span>
                        Occupied Vehicle: <strong>{currentOccupiedSlot.currentVehicle}</strong>
                      </span>
                      {currentVehicleEmp && <span className="text-emerald-400 font-bold">Emp: {currentVehicleEmp.name}</span>}
                    </div>
                  </div>
                ) : changeVehicleQuery.length >= 3 ? (
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-[11px] flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Type full vehicle plate or slot number to locate occupied vehicle...</span>
                  </div>
                ) : null}

                <div>
                  <label className={`block font-bold mb-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    2. Select Target Vacant Slot:
                  </label>
                  <select
                    value={targetNewSlotNumber}
                    onChange={(e) => setTargetNewSlotNumber(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2.5 font-mono font-bold focus:outline-none focus:border-amber-600 ${
                      isDarkMode
                        ? 'bg-slate-900 text-white border-slate-700'
                        : 'bg-white text-slate-900 border-slate-300'
                    }`}
                  >
                    <option value="">-- Choose Vacant Slot ({vacantSlotList.length} Available) --</option>
                    {vacantSlotList.slice(0, 50).map((s) => (
                      <option key={s.id} value={s.slotNumber}>
                        {s.slotNumber} • {s.basement} • {s.slotType} ({s.parkingType || 'Standard'}) [{s.height}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block font-bold mb-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Reason for Relocation:
                  </label>
                  <select
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    className={`w-full border rounded-xl px-2.5 py-2 font-medium ${
                      isDarkMode
                        ? 'bg-slate-900 text-slate-200 border-slate-700'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <option value="Attendant Optimization / Re-allocation">Attendant Re-allocation</option>
                    <option value="Puzzle Stacker Mechanical Maintenance">Stacker Mechanical Service</option>
                    <option value="EV Charging Request">EV Charging Station Request</option>
                    <option value="VIP / Executive Reservation">Executive Priority Allocation</option>
                    <option value="Clearance / High Vehicle Adjustment">Vehicle Clearance Adjustment</option>
                  </select>
                </div>

                <button
                  onClick={handleExecuteSlotChange}
                  disabled={changeLoading || !changeVehicleQuery.trim() || !targetNewSlotNumber.trim()}
                  className={`w-full py-3 text-white font-black rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm ${
                    changeLoading || !changeVehicleQuery.trim() || !targetNewSlotNumber.trim()
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-800'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {changeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating Slot & Sending SMS...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Relocate Slot & Send Driver Notification</span>
                    </>
                  )}
                </button>

                {driverNotification && (
                  <div className="mt-3 p-3 bg-emerald-950 text-emerald-100 border border-emerald-800 rounded-2xl space-y-2 shadow-lg">
                    <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px] font-bold border-b border-emerald-800/80 pb-1.5">
                      <span className="flex items-center space-x-1">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <span>SMS DISPATCH CONFIRMED</span>
                      </span>
                      <span>
                        {new Date(driverNotification.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] font-sans text-slate-200">
                      <span className="block text-emerald-300 font-bold">
                        To: {driverNotification.employeeName || 'Vehicle Driver'} ({driverNotification.mobile})
                      </span>
                      <div className="mt-1 bg-black/40 p-2 rounded-xl font-mono text-[10.5px] text-emerald-200 border border-emerald-900/60 leading-relaxed">
                        "{driverNotification.messageText}"
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Parking Slots & Basement-Wise Availability Summary */}
        <div className="lg:col-span-6 xl:col-span-7 space-y-5">
          {/* 1. Basement-Wise Availability Summary Cards */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Basement-Wise Availability Summary</h3>
                  <p className="text-xs text-slate-500">Live breakdown of vacant and occupied slots per basement floor</p>
                </div>
              </div>

              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-mono font-bold text-xs rounded-lg border border-emerald-200">
                {totalStats.vacant} / {totalStats.total} Free ({totalStats.percentAvailable}%)
              </span>
            </div>

            {/* Grid of Basement Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {basementSummaryList.map((item) => {
                const isSelected = selectedLiveBasement === item.basement;
                return (
                  <div
                    key={item.basement}
                    onClick={() => setSelectedLiveBasement(isSelected ? 'ALL' : item.basement)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-400/30'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-900 flex items-center space-x-1.5">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        <span>{item.basement === 'Ground' ? 'Ground Floor' : item.basement === 'Driveway' ? 'Perimeter Drive' : `Basement ${item.basement}`}</span>
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] rounded-md">
                        {item.vacant} Free
                      </span>
                    </div>

                    {/* Counts Row */}
                    <div className="flex items-center justify-between text-xs text-slate-600 font-mono mb-2">
                      <span>Total: <strong>{item.total}</strong></span>
                      <span>Occupied: <strong className="text-rose-600">{item.occupied}</strong></span>
                      <span>{item.percentAvailable}% Free</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percentAvailable}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Live Parking Slots Interactive Grid / Selector */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center space-x-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-black text-slate-900">Live Parking Slots</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Showing {filteredLiveSlots.length} slots. Click any vacant slot to auto-fill into attendant terminal.
                </p>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold gap-1">
                <button
                  onClick={() => setLiveSlotFilterStatus('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    liveSlotFilterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({slots.length})
                </button>
                <button
                  onClick={() => setLiveSlotFilterStatus('VACANT')}
                  className={`px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1 ${
                    liveSlotFilterStatus === 'VACANT' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span>Vacant ({vacantSlotList.length})</span>
                </button>
                <button
                  onClick={() => setLiveSlotFilterStatus('OCCUPIED')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    liveSlotFilterStatus === 'OCCUPIED' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Occupied
                </button>
              </div>
            </div>

            {/* Filter Bar: Basement selector + Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', ...basementSummaryList.map((b) => b.basement)].map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedLiveBasement(b)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                      selectedLiveBasement === b
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {b === 'ALL' ? 'All Floors' : b}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by slot #, location, vehicle..."
                  value={liveSlotSearch}
                  onChange={(e) => setLiveSlotSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Slot Grid Container */}
            <div className="max-h-[380px] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {filteredLiveSlots.slice(0, 100).map((slot) => {
                  const isVacant = slot.status === 'VACANT';
                  const isSelectedForManual = manualSlotInput.toUpperCase() === slot.slotNumber.toUpperCase();

                  return (
                    <div
                      key={slot.id}
                      onClick={() => {
                        setSelectedLiveSlotForAssign(slot);
                        setDirectAssignPlate(inputPlate || (scanResult?.plateNumber || ''));
                        setDirectAssignVehicleType((slot.slotType as VehicleType) || selectedCategory || 'SEDAN');
                      }}
                      className={`p-2.5 rounded-xl border text-xs transition-all relative cursor-pointer group ${
                        isSelectedForManual
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400 text-blue-950 shadow-sm'
                          : isVacant
                          ? 'bg-emerald-50/70 hover:bg-emerald-100/90 border-emerald-200 hover:border-emerald-400 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-black text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                          {slot.slotNumber}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${
                            isVacant
                              ? 'bg-emerald-200/80 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {slot.status}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 font-mono flex items-center justify-between">
                        <span>{slot.basement}</span>
                        <span>{slot.slotType}</span>
                      </div>

                      {slot.currentVehicle && (
                        <div className="mt-1 text-[9.5px] font-mono font-bold text-rose-700 truncate bg-white/80 p-0.5 rounded border border-rose-200/60">
                          🚘 {slot.currentVehicle}
                        </div>
                      )}

                      {!isVacant && slot.status === 'OCCUPIED' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVehicleExit(slot.currentVehicle || slot.slotNumber);
                            setActionSuccessMsg(
                              `EXIT CHECKOUT: Pallet / Slot ${slot.slotNumber} (Vehicle ${slot.currentVehicle || 'N/A'}) released to inventory.`
                            );
                            setTimeout(() => setActionSuccessMsg(''), 4000);
                          }}
                          className="mt-1.5 w-full py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9.5px] rounded-lg flex items-center justify-center space-x-1 shadow-xs transition-colors"
                          title="Mark Vehicle Exit & Free Pallet/Slot"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Mark Exit</span>
                        </button>
                      )}

                      {isVacant && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLiveSlotForAssign(slot);
                            setDirectAssignPlate(inputPlate || (scanResult?.plateNumber || ''));
                            setDirectAssignVehicleType((slot.slotType as VehicleType) || selectedCategory || 'SEDAN');
                          }}
                          className="mt-1.5 w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9.5px] rounded-lg flex items-center justify-center space-x-1 shadow-xs transition-colors"
                          title="Tap to assign vehicle entry to this slot"
                        >
                          <CheckSquare className="w-3 h-3" />
                          <span>Tap to assign</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredLiveSlots.length > 100 && (
                <p className="text-center text-xs text-slate-400 py-3 font-mono">
                  Showing first 100 slots of {filteredLiveSlots.length}. Use filters above to refine search.
                </p>
              )}

              {filteredLiveSlots.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl">
                  No slots found matching the selected filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Overlay for Attendant Custom Slot Selection */}
      {showSlotPickerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 max-h-[90vh] flex flex-col shadow-2xl ${
              isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-sm">Select Parking Slot from Uploaded Inventory</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose an available slot to fill directly into the attendant terminal.
                </p>
              </div>
              <button
                onClick={() => setShowSlotPickerModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Filters: Basement, Type & Search */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Basement:</label>
                <select
                  value={slotPickerFloor}
                  onChange={(e) => setSlotPickerFloor(e.target.value)}
                  className={`w-full py-1.5 px-2 rounded-xl border text-[11px] font-mono font-bold focus:outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  <option value="ALL">All Basements</option>
                  {basementSummaryList.map((b) => (
                    <option key={b.basement} value={b.basement}>
                      {b.basement} ({b.vacant} Free)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Slot Type:</label>
                <select
                  value={slotPickerType}
                  onChange={(e) => setSlotPickerType(e.target.value)}
                  className={`w-full py-1.5 px-2 rounded-xl border text-[11px] font-mono font-bold focus:outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  <option value="ALL">All Types</option>
                  <option value="SEDAN">SEDAN</option>
                  <option value="SUV">SUV</option>
                  <option value="EV">EV</option>
                  <option value="CSUV">CSUV</option>
                  <option value="HATCHBACK">HATCHBACK</option>
                  <option value="TWO_WHEELER">TWO WHEELER</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Search #:</label>
                <input
                  type="text"
                  placeholder="e.g. B1-P01..."
                  value={slotPickerSearch}
                  onChange={(e) => setSlotPickerSearch(e.target.value)}
                  className={`w-full px-2 py-1.5 rounded-xl border text-[11px] font-mono focus:outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* Slot List */}
            <div className="mt-3 overflow-y-auto max-h-[45vh] space-y-2 pr-1">
              {filteredSlotPickerList.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-800 rounded-xl">
                  No vacant slots found matching filters.
                </div>
              ) : (
                filteredSlotPickerList.map((slot) => {
                  const isSelected = manualSlotInput.toUpperCase() === slot.slotNumber.toUpperCase();

                  return (
                    <div
                      key={slot.id}
                      onClick={() => handleSelectSlotIntoInput(slot.slotNumber)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100 shadow-lg ring-1 ring-emerald-500'
                          : isDarkMode
                          ? 'bg-slate-950 hover:bg-slate-800/80 border-slate-800 text-slate-200'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-sm">{slot.slotNumber}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {slot.basement} • {slot.height}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200">
                            {slot.slotType}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          <span>{slot.floorLocation}</span>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        ) : (
                          <button className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg">
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">
                {filteredSlotPickerList.length} Vacant Slots Available
              </span>
              <button
                onClick={() => setShowSlotPickerModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Slot Vehicle Entry & Inspection Modal (Tap to Assign Feature) */}
      {selectedLiveSlotForAssign && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl ${
              isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black flex items-center gap-2">
                    Slot {selectedLiveSlotForAssign.slotNumber}
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                        selectedLiveSlotForAssign.status === 'VACANT'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {selectedLiveSlotForAssign.status}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {selectedLiveSlotForAssign.basement} • {selectedLiveSlotForAssign.floorLocation}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLiveSlotForAssign(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Spec Details */}
            <div
              className={`mt-4 grid grid-cols-2 gap-2 text-xs p-3 rounded-xl border ${
                isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Slot Type</span>
                <span className="font-semibold">{selectedLiveSlotForAssign.slotType} ({selectedLiveSlotForAssign.height || 'Standard'})</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Allocation</span>
                <span className="font-semibold text-blue-400">{selectedLiveSlotForAssign.allocation || 'GENERAL'}</span>
              </div>
            </div>

            {/* Occupied Vehicle View */}
            {selectedLiveSlotForAssign.status === 'OCCUPIED' && (
              <div className="mt-4 p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">Parked Vehicle</span>
                  <span className="text-xs font-mono font-bold bg-slate-950 text-white px-2 py-0.5 rounded border border-rose-800">
                    {selectedLiveSlotForAssign.currentVehicle || 'OCCUPIED'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onVehicleExit(selectedLiveSlotForAssign.currentVehicle || selectedLiveSlotForAssign.slotNumber);
                    setActionSuccessMsg(
                      `EXIT CHECKOUT: Slot ${selectedLiveSlotForAssign.slotNumber} (Vehicle ${selectedLiveSlotForAssign.currentVehicle || 'N/A'}) released to inventory.`
                    );
                    setSelectedLiveSlotForAssign(null);
                    setTimeout(() => setActionSuccessMsg(''), 4000);
                  }}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Process Vehicle Exit Checkout</span>
                </button>
              </div>
            )}

            {/* Vacant Direct Entry Form */}
            {selectedLiveSlotForAssign.status === 'VACANT' && (
              <form onSubmit={handleDirectSlotAssign} className="mt-4 space-y-3">
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4" />
                      Direct Vehicle Entry to Slot {selectedLiveSlotForAssign.slotNumber}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Field Attendant Entry</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Vehicle License Plate *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. KA-01-AB-1234 or DL-03-CC-9988"
                      value={directAssignPlate}
                      onChange={(e) => setDirectAssignPlate(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Vehicle Category
                    </label>
                    <select
                      value={directAssignVehicleType}
                      onChange={(e) => setDirectAssignVehicleType(e.target.value as VehicleType)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none ${
                        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="SEDAN">SEDAN</option>
                      <option value="SUV">SUV</option>
                      <option value="EV">EV</option>
                      <option value="CSUV">CSUV</option>
                      <option value="HATCHBACK">HATCHBACK</option>
                      <option value="TWO_WHEELER">TWO WHEELER</option>
                    </select>
                  </div>

                  {/* Quick Plate Presets from Attendant state */}
                  {inputPlate && inputPlate.toUpperCase() !== directAssignPlate.toUpperCase() && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Scanned / Input Plate:</span>
                      <button
                        type="button"
                        onClick={() => setDirectAssignPlate(inputPlate)}
                        className="px-2 py-0.5 bg-blue-900/60 text-blue-200 border border-blue-700 rounded text-[10px] font-mono font-bold"
                      >
                        Use {inputPlate}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Assign Vehicle Entry to Slot {selectedLiveSlotForAssign.slotNumber}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Quick Fill into manual entry tab */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  handleSelectSlotIntoInput(selectedLiveSlotForAssign.slotNumber);
                  setSelectedLiveSlotForAssign(null);
                }}
                className="text-blue-400 hover:text-blue-300 text-[11px] font-bold flex items-center space-x-1"
              >
                <span>Autofill Slot #{selectedLiveSlotForAssign.slotNumber} into Quick Entry Form</span>
              </button>

              <button
                onClick={() => setSelectedLiveSlotForAssign(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registered Whitelist Vehicles Directory Modal for Attendants */}
      {showRegisteredVehiclesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">Registered Whitelist Vehicles Directory</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {allRegisteredVehiclesList.length} Authorized Employee & Fleet Vehicles
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowRegisteredVehiclesModal(false);
                  setRegisteredVehiclesSearch('');
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by license plate, employee name, ID, or department..."
                  value={registeredVehiclesSearch}
                  onChange={(e) => setRegisteredVehiclesSearch(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isDarkMode ? 'bg-slate-950 border border-slate-800 text-white' : 'bg-slate-50 border border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* List */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {allRegisteredVehiclesList
                .filter((v) => {
                  if (!registeredVehiclesSearch.trim()) return true;
                  const q = registeredVehiclesSearch.toLowerCase();
                  const qNorm = normalizeVehicleNumber(q);
                  const vNorm = normalizeVehicleNumber(v.vehicleNumber);
                  return (
                    vNorm.includes(qNorm) ||
                    v.vehicleNumber.toLowerCase().includes(q) ||
                    v.name.toLowerCase().includes(q) ||
                    v.employeeId.toLowerCase().includes(q) ||
                    v.department.toLowerCase().includes(q)
                  );
                })
                .map((veh) => (
                  <div
                    key={veh.id || veh.vehicleNumber}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                      isDarkMode ? 'bg-slate-950/60 border-slate-800 hover:border-emerald-600/60' : 'bg-slate-50 border-slate-200 hover:border-emerald-400'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-sm text-emerald-400">{veh.vehicleNumber}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                          {veh.vehicleType}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                          {veh.vehicleBrand || 'Fleet'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-300">
                        {veh.name} • <span className="text-slate-400">{veh.department}</span>
                        <span className="text-[11px] font-mono text-slate-400 ml-1.5">({veh.employeeId})</span>
                      </div>
                      {veh.mobile && (
                        <div className="text-[11px] text-slate-400 font-mono">Mobile: {veh.mobile}</div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInputPlate(veh.vehicleNumber);
                        setSelectedCategory(veh.vehicleType);
                        setShowRegisteredVehiclesModal(false);
                        setRegisteredVehiclesSearch('');
                        setActiveTab('QUICK_ENTRY');
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-1.5 transition-all"
                    >
                      <span>Select for Entry</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowRegisteredVehiclesModal(false);
                  setRegisteredVehiclesSearch('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
