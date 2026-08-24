import React, { useState, useRef } from 'react';
import { ParkingSlot, Employee, SlotStatus, VehicleType, EmployeeStatus, SlotType, ParkingType, Allocation } from '../types';
import {
  Cpu,
  UserCheck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Wrench,
  ShieldAlert,
  Car,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Upload,
  Download,
  Edit2,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface InventoryMasterProps {
  slots: ParkingSlot[];
  employees: Employee[];
  onUpdateSlotStatus: (slotId: string, newStatus: SlotStatus) => void;
  onVehicleExit?: (vehicleNumberOrSlot: string) => void;
  onRefresh: () => void;
}

export const InventoryMaster: React.FC<InventoryMasterProps> = ({
  slots,
  employees,
  onUpdateSlotStatus,
  onVehicleExit,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'SLOTS' | 'EMPLOYEES'>('SLOTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [basementFilter, setBasementFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [empStatusFilter, setEmpStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Single Employee Edit/Add Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee> | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk Upload Registration Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [parsedBulkEmployees, setParsedBulkEmployees] = useState<Partial<Employee>[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Single Slot Edit/Add Modal State
  const [isSlotEditModalOpen, setIsSlotEditModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Partial<ParkingSlot> | null>(null);
  const [slotFormSaving, setSlotFormSaving] = useState(false);
  const [slotFormError, setSlotFormError] = useState<string | null>(null);

  // Bulk Upload Slots Modal State
  const [isSlotBulkModalOpen, setIsSlotBulkModalOpen] = useState(false);
  const [slotBulkCsvText, setSlotBulkCsvText] = useState('');
  const [parsedBulkSlots, setParsedBulkSlots] = useState<Partial<ParkingSlot>[]>([]);
  const [slotBulkUploading, setSlotBulkUploading] = useState(false);
  const [slotBulkSuccessMsg, setSlotBulkSuccessMsg] = useState<string | null>(null);
  const slotFileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter slots & sort empty (VACANT) slots first, occupied pushed to last
  const filteredSlots = slots.filter((s) => {
    if (basementFilter !== 'ALL' && s.basement !== basementFilter) return false;
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSlot = s.slotNumber.toLowerCase().includes(q);
      const matchLoc = s.floorLocation.toLowerCase().includes(q);
      const matchVehicle = s.currentVehicle && s.currentVehicle.toLowerCase().includes(q);
      if (!matchSlot && !matchLoc && !matchVehicle) return false;
    }
    return true;
  }).sort((a, b) => {
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

  // Filter employees
  const filteredEmployees = employees.filter((e) => {
    if (deptFilter !== 'ALL' && e.department !== deptFilter) return false;
    if (empStatusFilter !== 'ALL' && (e.status || (e.isActive ? 'ACTIVE' : 'INACTIVE')) !== empStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = e.name.toLowerCase().includes(q);
      const matchId = e.employeeId.toLowerCase().includes(q);
      const matchVehicle = e.vehicleNumber.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchVehicle) return false;
    }
    return true;
  });

  const totalSlotPages = Math.ceil(filteredSlots.length / pageSize) || 1;
  const paginatedSlots = filteredSlots.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalEmpPages = Math.ceil(filteredEmployees.length / pageSize) || 1;
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getSlotStatusBadge = (status: SlotStatus) => {
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

  const getEmployeeStatusBadge = (status?: EmployeeStatus) => {
    switch (status) {
      case 'INACTIVE':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-300 inline-flex items-center space-x-1">
            <XCircle className="w-3 h-3 text-slate-500" />
            <span>Inactive</span>
          </span>
        );
      case 'DEFAULTER':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Defaulter</span>
          </span>
        );
      case 'ACTIVE':
      default:
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>Active</span>
          </span>
        );
    }
  };

  // Open modal for editing or adding single employee
  const handleOpenEditModal = (emp?: Employee) => {
    if (emp) {
      setEditingEmployee({
        ...emp,
        status: emp.status || (emp.isActive ? 'ACTIVE' : 'INACTIVE'),
      });
    } else {
      setEditingEmployee({
        employeeId: `EMP-${1000 + employees.length + 1}`,
        name: '',
        department: 'Engineering',
        designation: 'Staff',
        mobile: '+91 ',
        email: '',
        vehicleNumber: '',
        vehicleType: 'SEDAN',
        vehicleBrand: 'Toyota',
        status: 'ACTIVE',
        isActive: true,
      });
    }
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Save Employee Form submit
  const handleSaveEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee?.name || !editingEmployee?.vehicleNumber) {
      setFormError('Employee Full Name and Vehicle License Plate are required.');
      return;
    }
    try {
      setFormSaving(true);
      setFormError(null);
      const res = await fetch('/api/v1/employees/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEmployee),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditModalOpen(false);
        setEditingEmployee(null);
        onRefresh();
      } else {
        setFormError(data.message || 'Failed to save employee.');
      }
    } catch (err: any) {
      setFormError('Error communicating with server.');
    } finally {
      setFormSaving(false);
    }
  };

  // CSV Parsing Helper
  const parseCSVText = (text: string): Partial<Employee>[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const startIndex =
      lines[0].toLowerCase().includes('employee') ||
      lines[0].toLowerCase().includes('name') ||
      lines[0].toLowerCase().includes('plate')
        ? 1
        : 0;

    const results: Partial<Employee>[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) continue;

      const empId = cols[0] || `EMP-${2000 + i}`;
      const name = cols[1] || `Employee ${i}`;
      const dept = cols[2] || 'Operations';
      const desig = cols[3] || 'Staff';
      const mobile = cols[4] || '+91 9800000000';
      const email = cols[5] || 'employee@company.com';
      const vehicleNumber = cols[6] || 'KA-01-EX-0000';

      let vType: VehicleType = 'SEDAN';
      const rawType = (cols[7] || '').toUpperCase();
      if (rawType.includes('SUV')) vType = 'SUV';
      else if (rawType.includes('EV')) vType = 'EV';
      else if (rawType.includes('TWO') || rawType.includes('2W')) vType = 'TWO_WHEELER';
      else if (rawType.includes('HATCH')) vType = 'HATCHBACK';

      const brand = cols[8] || 'Standard';

      let status: EmployeeStatus = 'ACTIVE';
      const rawStatus = (cols[9] || '').toUpperCase();
      if (rawStatus.includes('INACTIVE')) status = 'INACTIVE';
      else if (rawStatus.includes('DEFAULT')) status = 'DEFAULTER';

      results.push({
        employeeId: empId,
        name,
        department: dept,
        designation: desig,
        mobile,
        email,
        vehicleNumber: vehicleNumber.toUpperCase(),
        vehicleType: vType,
        vehicleBrand: brand,
        status,
        isActive: status === 'ACTIVE',
      });
    }
    return results;
  };

  const handleBulkTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setBulkCsvText(text);
    const parsed = parseCSVText(text);
    setParsedBulkEmployees(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkCsvText(text);
      const parsed = parseCSVText(text);
      setParsedBulkEmployees(parsed);
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCSV = () => {
    const csvContent = `EmployeeID,FullName,Department,Designation,Mobile,Email,VehicleNumber,VehicleType,VehicleBrand,Status
EMP-3001,Aarav Mehta,Engineering,Principal Architect,+91 9876543210,aarav@company.com,KA-01-EX-5544,SUV,Tesla,Active
EMP-3002,Priya Nair,HR & Admin,HR Manager,+91 9876543211,priya@company.com,KA-03-EX-1234,SEDAN,Honda,Inactive
EMP-3003,Karan Patel,Operations,Logistics Lead,+91 9876543212,karan@company.com,MH-12-EX-9988,EV,Ather,Defaulter
EMP-3004,Siddharth Verma,Finance & Legal,Senior Analyst,+91 9876543213,siddharth@company.com,DL-01-EX-7711,HATCHBACK,Hyundai,Active`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Employee_Whitelist_Sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmBulkUpload = async () => {
    if (parsedBulkEmployees.length === 0) return;
    try {
      setBulkUploading(true);
      const res = await fetch('/api/v1/employees/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: parsedBulkEmployees }),
      });
      const data = await res.json();
      if (data.success) {
        setBulkSuccessMsg(data.message);

        setTimeout(() => {
          setIsBulkModalOpen(false);
          setBulkSuccessMsg(null);
          setBulkCsvText('');
          setParsedBulkEmployees([]);
          onRefresh();
        }, 1800);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkUploading(false);
    }
  };

  const removeParsedRow = (index: number) => {
    setParsedBulkEmployees((prev) => prev.filter((_, i) => i !== index));
  };

  // Slot Management Handlers
  const handleOpenSlotEditModal = (slot?: ParkingSlot) => {
    if (slot) {
      setEditingSlot({ ...slot });
    } else {
      setEditingSlot({
        slotNumber: `B1-P01-S${Math.floor(Math.random() * 90 + 10)}`,
        basement: 'B1',
        floorLocation: 'Level 1 Stacker',
        slotType: 'SEDAN',
        height: 'Standard (2.0m)',
        parkingType: 'PUZZLE',
        allocation: 'EMPLOYEE',
        status: 'VACANT',
      });
    }
    setSlotFormError(null);
    setIsSlotEditModalOpen(true);
  };

  const handleSaveSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) {
      setSlotFormError('No slot selected.');
      return;
    }
    const cleanSlotNumber = (editingSlot.slotNumber || editingSlot.id || '').trim().toUpperCase();
    if (!cleanSlotNumber) {
      setSlotFormError('Slot Identifier Number is required.');
      return;
    }

    try {
      setSlotFormSaving(true);
      setSlotFormError(null);

      const slotPayload = {
        ...editingSlot,
        id: editingSlot.id || cleanSlotNumber.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        slotNumber: cleanSlotNumber,
      };

      const res = await fetch('/api/v1/slots/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: slotPayload,
          ...slotPayload,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSlotEditModalOpen(false);
        setEditingSlot(null);
        onRefresh();
      } else {
        setSlotFormError(data.message || 'Failed to save slot');
      }
    } catch (err: any) {
      setSlotFormError(err.message || 'Error communicating with server');
    } finally {
      setSlotFormSaving(false);
    }
  };

  const parseSlotCSVText = (text: string): Partial<ParkingSlot>[] => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    const startIndex = lines[0].toLowerCase().includes('slot') || lines[0].toLowerCase().includes('basement') ? 1 : 0;
    const results: Partial<ParkingSlot>[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) continue;

      const slotNum = cols[0] || `B1-P01-S${10 + i}`;
      const basement = (cols[1] || 'B1') as any;
      const floorLoc = cols[2] || 'Level 1 Stacker';

      let slotType: SlotType = 'SEDAN';
      const rawType = (cols[3] || '').toUpperCase();
      if (rawType.includes('SUV')) slotType = 'SUV';
      else if (rawType.includes('EV')) slotType = 'EV';
      else if (rawType.includes('TWO') || rawType.includes('2W')) slotType = 'TWO_WHEELER';
      else if (rawType.includes('CSUV')) slotType = 'CSUV';

      const height = cols[4] || 'Standard (2.0m)';
      const parkingType: ParkingType = (cols[5] as ParkingType) || 'PUZZLE';
      const allocation: Allocation = (cols[6] as Allocation) || 'EMPLOYEE';

      let status: SlotStatus = 'VACANT';
      const rawStatus = (cols[7] || '').toUpperCase();
      if (rawStatus.includes('OCCUPIED')) status = 'OCCUPIED';
      else if (rawStatus.includes('RESERVED')) status = 'RESERVED';
      else if (rawStatus.includes('MAINT')) status = 'MAINTENANCE';

      results.push({
        slotNumber: slotNum,
        basement,
        floorLocation: floorLoc,
        slotType,
        height,
        parkingType,
        allocation,
        status,
      });
    }
    return results;
  };

  const handleSlotBulkTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setSlotBulkCsvText(text);
    const parsed = parseSlotCSVText(text);
    setParsedBulkSlots(parsed);
  };

  const handleSlotFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setSlotBulkCsvText(text);
      const parsed = parseSlotCSVText(text);
      setParsedBulkSlots(parsed);
    };
    reader.readAsText(file);
  };

  const handleDownloadSlotSampleCSV = () => {
    const csvContent = `SlotNumber,Basement,FloorLocation,SlotType,Height,ParkingType,Allocation,Status
B1-P01-S01,B1,North Wing Level 1 Stacker,SEDAN,Standard (2.0m),Puzzle 2-Tier,General Employee,Vacant
B1-P01-S05,B1,North Wing High Clearance,SUV,High Clearance (2.5m),Puzzle 2-Tier,Executive & VIP,Vacant
B2-EV-001,B2,South Bay EV Charging Station,EV,Standard (2.0m),Ground Open,EV Charging Only,Vacant
B3-2W-101,B3,East Bay Two Wheeler Rack,TWO_WHEELER,Compact (1.8m),Ground Open,General Employee,Vacant`;

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
    if (parsedBulkSlots.length === 0) return;
    try {
      setSlotBulkUploading(true);
      setSlotBulkSuccessMsg(`Uploading & processing ${parsedBulkSlots.length} inventory slots...`);

      const res = await fetch('/api/v1/slots/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: parsedBulkSlots }),
      });
      const data = await res.json();

      if (data.success) {
        setSlotBulkSuccessMsg(data.message || `Successfully uploaded ${parsedBulkSlots.length} slots.`);
      } else {
        setSlotBulkSuccessMsg(`Upload note: ${data.message || 'Processed'}`);
      }

      setTimeout(() => {
        setIsSlotBulkModalOpen(false);
        setSlotBulkSuccessMsg(null);
        setSlotBulkCsvText('');
        setParsedBulkSlots([]);
        onRefresh();
      }, 1800);
    } catch (err: any) {
      console.error('Slot Bulk Upload Error:', err);
      setSlotBulkSuccessMsg(`Upload failed: ${err.message || err}`);
    } finally {
      setSlotBulkUploading(false);
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
              <span>1,080 Slots Inventory</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] ${
                  activeTab === 'SLOTS' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {slots.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('EMPLOYEES');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all ${
                activeTab === 'EMPLOYEES'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 border border-blue-600'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
              }`}
            >
              <UserCheck className="w-4 h-4 text-indigo-400" />
              <span>Employee Whitelist</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] ${
                  activeTab === 'EMPLOYEES' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {employees.length}
              </span>
            </button>
          </div>

          {/* Action Buttons for Slots Inventory */}
          {activeTab === 'SLOTS' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenSlotEditModal()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Cpu className="w-4 h-4" />
                <span>+ Add Slot</span>
              </button>

              <button
                onClick={() => {
                  setSlotBulkCsvText('');
                  setParsedBulkSlots([]);
                  setSlotBulkSuccessMsg(null);
                  setIsSlotBulkModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Bulk Upload Inventory</span>
              </button>
            </div>
          )}

          {/* Action Buttons for Whitelist (Add & Bulk Upload) */}
          {activeTab === 'EMPLOYEES' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenEditModal()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Add Employee</span>
              </button>

              <button
                onClick={() => {
                  setBulkCsvText('');
                  setParsedBulkEmployees([]);
                  setBulkSuccessMsg(null);
                  setIsBulkModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Bulk Upload Registration</span>
              </button>
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={activeTab === 'SLOTS' ? 'Search slot number, vehicle...' : 'Search employee ID, plate, name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs"
              />
            </div>

            {activeTab === 'SLOTS' ? (
              <>
                <select
                  value={basementFilter}
                  onChange={(e) => setBasementFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
                >
                  <option value="ALL">All Basements</option>
                  <option value="B1">Basement B1</option>
                  <option value="B2">Basement B2</option>
                  <option value="B3">Basement B3</option>
                  <option value="Ground">Ground Floor</option>
                  <option value="Driveway">Driveway</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="VACANT">Vacant</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
              </>
            ) : (
              <>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs"
                >
                  <option value="ALL">All Departments</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Operations">Operations</option>
                  <option value="HR & Admin">HR & Admin</option>
                  <option value="Sales & Marketing">Sales & Marketing</option>
                  <option value="Finance & Legal">Finance & Legal</option>
                  <option value="Executive Leadership">Executive Leadership</option>
                  <option value="Transport Fleet">Transport Fleet</option>
                </select>

                <select
                  value={empStatusFilter}
                  onChange={(e) => setEmpStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs font-semibold"
                >
                  <option value="ALL">All Whitelist Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="DEFAULTER">Defaulter</option>
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {activeTab === 'SLOTS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Slot Number</th>
                  <th className="p-3.5">Level</th>
                  <th className="p-3.5">Floor Location</th>
                  <th className="p-3.5">Type & Height</th>
                  <th className="p-3.5">Parking Mechanism</th>
                  <th className="p-3.5">Allocation</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Current Occupant</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSlots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-900">{slot.slotNumber}</td>
                    <td className="p-3.5 font-medium">{slot.basement}</td>
                    <td className="p-3.5 text-slate-500 max-w-xs truncate">{slot.floorLocation}</td>
                    <td className="p-3.5 font-semibold text-blue-600">
                      {slot.slotType} ({slot.height})
                    </td>
                    <td className="p-3.5 text-slate-600 font-medium">
                      {(() => {
                        const t = (slot.parkingType || '').toUpperCase();
                        if (t.includes('PUZZLE')) return 'Puzzle';
                        if (t.includes('STACK')) return 'Stack';
                        return 'Ground';
                      })()}
                    </td>
                    <td className="p-3.5 font-medium">{slot.allocation}</td>
                    <td className="p-3.5">{getSlotStatusBadge(slot.status)}</td>
                    <td className="p-3.5">
                      {slot.currentVehicle ? (
                        <span className="font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm text-[11px]">
                          {slot.currentVehicle}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">-</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right space-x-1">
                      {slot.status === 'OCCUPIED' && onVehicleExit && (
                        <button
                          onClick={() => onVehicleExit(slot.currentVehicle || slot.slotNumber)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded border border-rose-300 text-[10px] font-bold transition-colors inline-flex items-center space-x-1"
                          title="Mark Vehicle Exit from Pallet / Slot"
                        >
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>Mark Exit</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenSlotEditModal(slot)}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded border border-blue-300 text-[10px] font-bold transition-colors inline-flex items-center space-x-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      {slot.status === 'MAINTENANCE' ? (
                        <button
                          onClick={() => onUpdateSlotStatus(slot.id, 'VACANT')}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-300 text-[10px] font-bold transition-colors"
                        >
                          Clear Maintenance
                        </button>
                      ) : (
                        <button
                          onClick={() => onUpdateSlotStatus(slot.id, 'MAINTENANCE')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-[10px] font-bold transition-colors"
                        >
                          Set Maintenance
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Employee ID</th>
                  <th className="p-3.5">Full Name</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Designation</th>
                  <th className="p-3.5">Vehicle License Plate</th>
                  <th className="p-3.5">Vehicle Type & Brand</th>
                  <th className="p-3.5">Mobile Contact</th>
                  <th className="p-3.5">Whitelist Status</th>
                  <th className="p-3.5 text-right">Option</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-900">{emp.employeeId}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{emp.name}</td>
                    <td className="p-3.5 text-blue-600 font-medium">{emp.department}</td>
                    <td className="p-3.5 text-slate-500">{emp.designation}</td>
                    <td className="p-3.5">
                      <span className="font-mono font-bold bg-slate-900 text-white px-2 py-1 rounded shadow-sm text-[11px] inline-block">
                        {emp.vehicleNumber}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-700">
                      {emp.vehicleType} - <span className="text-slate-500">{emp.vehicleBrand}</span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{emp.mobile}</td>
                    <td className="p-3.5">
                      {getEmployeeStatusBadge(emp.status)}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleOpenEditModal(emp)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold flex items-center space-x-1.5 ml-auto transition-colors shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-mono">
          <span>
            Showing Page {currentPage} of {activeTab === 'SLOTS' ? totalSlotPages : totalEmpPages} (
            {activeTab === 'SLOTS' ? filteredSlots.length : filteredEmployees.length} total entries)
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
                setCurrentPage((p) => Math.min(activeTab === 'SLOTS' ? totalSlotPages : totalEmpPages, p + 1))
              }
              disabled={currentPage === (activeTab === 'SLOTS' ? totalSlotPages : totalEmpPages)}
              className="p-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded border border-slate-300 disabled:opacity-40 shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ----------------- MODAL 1: EDIT / REGISTER SINGLE EMPLOYEE ----------------- */}
      {isEditModalOpen && editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-tight">
                    {editingEmployee.id ? 'Edit Employee Whitelist Record' : 'Register New Whitelist Employee'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    ID: {editingEmployee.employeeId || 'New'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEmployeeSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Status Radio Buttons (Active, Inactive, Defaulter) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block text-slate-900 font-bold text-xs uppercase tracking-wider">
                  Whitelist Access Status:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingEmployee((prev) => ({ ...prev!, status: 'ACTIVE', isActive: true }))
                    }
                    className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center space-x-1.5 transition-all ${
                      editingEmployee.status === 'ACTIVE'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Active</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingEmployee((prev) => ({ ...prev!, status: 'INACTIVE', isActive: false }))
                    }
                    className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center space-x-1.5 transition-all ${
                      editingEmployee.status === 'INACTIVE'
                        ? 'bg-slate-700 text-white border-slate-700 shadow-md shadow-slate-700/20'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Inactive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingEmployee((prev) => ({ ...prev!, status: 'DEFAULTER', isActive: false }))
                    }
                    className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center space-x-1.5 transition-all ${
                      editingEmployee.status === 'DEFAULTER'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Defaulter</span>
                  </button>
                </div>
              </div>

              {/* Grid Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={editingEmployee.employeeId || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, employeeId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. EMP-1052"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editingEmployee.name || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. Rahul Sharma"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Department</label>
                  <select
                    value={editingEmployee.department || 'Engineering'}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Operations">Operations</option>
                    <option value="HR & Admin">HR & Admin</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Finance & Legal">Finance & Legal</option>
                    <option value="Executive Leadership">Executive Leadership</option>
                    <option value="Transport Fleet">Transport Fleet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    value={editingEmployee.designation || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, designation: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. Senior Lead Engineer"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Vehicle License Plate</label>
                  <input
                    type="text"
                    value={editingEmployee.vehicleNumber || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, vehicleNumber: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 text-white font-mono font-bold border border-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. KA-01-EX-8821"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Vehicle Type</label>
                  <select
                    value={editingEmployee.vehicleType || 'SEDAN'}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, vehicleType: e.target.value as VehicleType })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  >
                    <option value="SEDAN">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="HATCHBACK">Hatchback</option>
                    <option value="TWO_WHEELER">Two-Wheeler</option>
                    <option value="EV">EV Electric</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Vehicle Brand / Model</label>
                  <input
                    type="text"
                    value={editingEmployee.vehicleBrand || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, vehicleBrand: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. Tesla / Toyota"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Contact</label>
                  <input
                    type="text"
                    value={editingEmployee.mobile || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, mobile: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. +91 9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  value={editingEmployee.email || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  placeholder="e.g. employee@company.com"
                />
              </div>

              {/* Submit / Cancel Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  {formSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 2: BULK UPLOAD REGISTRATION ----------------- */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-tight">
                    Bulk Whitelist CSV Registration Engine
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Import multiple employee vehicles at once into the PMS Whitelist
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {bulkSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 font-bold flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{bulkSuccessMsg}</span>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <span className="font-bold text-slate-900 block text-xs">CSV Data Format Guide</span>
                  <span className="text-slate-500 text-[11px]">
                    Columns: EmployeeID, FullName, Department, Designation, Mobile, Email, VehicleNumber, VehicleType, VehicleBrand, Status
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleDownloadSampleCSV}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] rounded-xl flex items-center space-x-1 shadow-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Download Sample CSV</span>
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl flex items-center space-x-1 shadow-sm transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CSV File</span>
                  </button>
                </div>
              </div>

              {/* Paste Textarea */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">
                  Or Paste Raw CSV Text:
                </label>
                <textarea
                  rows={4}
                  value={bulkCsvText}
                  onChange={handleBulkTextChange}
                  placeholder="Paste CSV lines here... (e.g. EMP-3001, Aarav Mehta, Engineering, Lead, +91 9876543210, aarav@co.com, KA-01-EX-5544, SUV, Tesla, Active)"
                  className="w-full bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-2xl border border-slate-800 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                />
              </div>

              {/* Live Parsed Preview Table */}
              {parsedBulkEmployees.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Parsed {parsedBulkEmployees.length} Whitelist Entries Ready to Import:</span>
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
                    <table className="w-full text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px] sticky top-0">
                        <tr>
                          <th className="p-2">Emp ID</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Department</th>
                          <th className="p-2">Plate</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Status</th>
                          <th className="p-2 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedBulkEmployees.map((emp, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold text-slate-900">{emp.employeeId}</td>
                            <td className="p-2 font-semibold text-slate-800">{emp.name}</td>
                            <td className="p-2 text-blue-600">{emp.department}</td>
                            <td className="p-2 font-mono font-bold text-slate-900">{emp.vehicleNumber}</td>
                            <td className="p-2 font-mono text-slate-600">{emp.vehicleType}</td>
                            <td className="p-2">{getEmployeeStatusBadge(emp.status)}</td>
                            <td className="p-2 text-right">
                              <button
                                onClick={() => removeParsedRow(idx)}
                                className="p-1 hover:bg-rose-100 text-rose-600 rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Submit Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-slate-500 font-mono text-[11px]">
                  {parsedBulkEmployees.length} valid rows detected
                </span>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleConfirmBulkUpload}
                    disabled={bulkUploading || parsedBulkEmployees.length === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-40"
                  >
                    {bulkUploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>Confirm & Register All ({parsedBulkEmployees.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Slot Identifier Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. B1-P01-S01"
                    value={editingSlot.slotNumber || ''}
                    onChange={(e) => setEditingSlot({ ...editingSlot, slotNumber: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Basement / Level *</label>
                  <select
                    value={editingSlot.basement || 'B1'}
                    onChange={(e) => setEditingSlot({ ...editingSlot, basement: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  >
                    <option value="B1">Basement B1</option>
                    <option value="B2">Basement B2</option>
                    <option value="B3">Basement B3</option>
                    <option value="Ground">Ground Floor</option>
                    <option value="Driveway">Driveway</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Floor Location Description</label>
                <input
                  type="text"
                  placeholder="e.g. North Wing Level 1 Stacker"
                  value={editingSlot.floorLocation || ''}
                  onChange={(e) => setEditingSlot({ ...editingSlot, floorLocation: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Bound Vehicle Type</label>
                  <select
                    value={editingSlot.slotType || 'SEDAN'}
                    onChange={(e) => setEditingSlot({ ...editingSlot, slotType: e.target.value as SlotType })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  >
                    <option value="SEDAN">Sedan</option>
                    <option value="SUV">SUV (High Clearance)</option>
                    <option value="EV">EV Charging Bay</option>
                    <option value="TWO_WHEELER">Two Wheeler</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Clearance Height</label>
                  <select
                    value={editingSlot.height || 'Standard (2.0m)'}
                    onChange={(e) => setEditingSlot({ ...editingSlot, height: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="Standard (2.0m)">Standard (2.0m)</option>
                    <option value="High Clearance (2.5m)">High Clearance (2.5m)</option>
                    <option value="Compact (1.8m)">Compact (1.8m)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Parking Type</label>
                  <select
                    value={(() => {
                      const t = (editingSlot.parkingType || '').toUpperCase();
                      if (t.includes('PUZZLE')) return 'PUZZLE';
                      if (t.includes('STACK')) return 'STACK';
                      return 'GROUND';
                    })()}
                    onChange={(e) => setEditingSlot({ ...editingSlot, parkingType: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="GROUND">Ground</option>
                    <option value="PUZZLE">Puzzle</option>
                    <option value="STACK">Stack</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Allocation Rule</label>
                  <select
                    value={editingSlot.allocation || 'General Employee'}
                    onChange={(e) => setEditingSlot({ ...editingSlot, allocation: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="General Employee">General Employee</option>
                    <option value="Executive & VIP">Executive & VIP</option>
                    <option value="Visitor / Guest">Visitor / Guest</option>
                    <option value="EV Charging Only">EV Charging Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Slot Operational Status *</label>
                <select
                  value={editingSlot.status || 'VACANT'}
                  onChange={(e) => setEditingSlot({ ...editingSlot, status: e.target.value as SlotStatus })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="VACANT">VACANT (Available)</option>
                  <option value="OCCUPIED">OCCUPIED</option>
                  <option value="RESERVED">RESERVED</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>

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
                  disabled={slotFormSaving}
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
                  <span className="text-[11px] text-blue-700">Format: SlotNumber, Basement, Location, Type, Height, Mechanism, Allocation, Status</span>
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
                  placeholder="Paste CSV lines here... (e.g. B1-P01-S01, B1, North Wing Stacker, SEDAN, Standard (2.0m), Puzzle 2-Tier, General Employee, Vacant)"
                  className="w-full bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-2xl border border-slate-800 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                />
              </div>

              {parsedBulkSlots.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Parsed {parsedBulkSlots.length} Slots Ready to Import:</span>
                  </span>
                  <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px] sticky top-0">
                        <tr>
                          <th className="p-2">Slot Number</th>
                          <th className="p-2">Level</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Height</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedBulkSlots.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold text-slate-900">{s.slotNumber}</td>
                            <td className="p-2 font-medium">{s.basement}</td>
                            <td className="p-2 font-mono text-blue-600">{s.slotType}</td>
                            <td className="p-2 text-slate-600">{s.height}</td>
                            <td className="p-2">{getSlotStatusBadge(s.status as any)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-slate-500 font-mono text-[11px]">{parsedBulkSlots.length} rows parsed</span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsSlotBulkModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSlotBulkUpload}
                    disabled={slotBulkUploading || parsedBulkSlots.length === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center space-x-2 disabled:opacity-40"
                  >
                    {slotBulkUploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>Confirm & Save All ({parsedBulkSlots.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
