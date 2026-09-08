import React, { useState, useEffect, useRef } from 'react';
import { RegistrationRequest, WhitelistedDomain, VehicleType, ParkingSlot } from '../types';
import { normalizeVehicleNumber } from '../utils/plateNormalization';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  UserPlus,
  Building2,
  Mail,
  Car,
  Smartphone,
  Plus,
  Trash2,
  Search,
  Filter,
  AlertTriangle,
  Lock,
  Globe,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Check,
  X,
  Zap,
  LayoutGrid,
  Activity,
  Layers,
  Download,
  Upload,
  FileSpreadsheet
} from 'lucide-react';

interface EmployeeRegistrationProps {
  onRefreshAll?: () => void;
  mode?: 'REGISTRATION' | 'APPROVALS';
}

export const EmployeeRegistration: React.FC<EmployeeRegistrationProps> = ({ onRefreshAll, mode = 'REGISTRATION' }) => {
  const [activeView, setActiveView] = useState<'REGISTER' | 'ADMIN_APPROVAL'>(
    mode === 'APPROVALS' ? 'ADMIN_APPROVAL' : 'REGISTER'
  );

  useEffect(() => {
    if (mode === 'APPROVALS') {
      setActiveView('ADMIN_APPROVAL');
    } else if (mode === 'REGISTRATION') {
      setActiveView('REGISTER');
    }
  }, [mode]);
  const [adminTab, setAdminTab] = useState<'REQUESTS' | 'DOMAINS'>('REQUESTS');

  // Requests, Domains & Live Parking Slots Data
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [slotMatrixFilter, setSlotMatrixFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'Engineering',
    designation: 'Senior Specialist',
    mobile: '',
    vehicleNumber: '',
    vehicleType: 'SEDAN' as VehicleType,
    vehicleBrand: '',
    employeeId: '',
  });

  // Rejection modal
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Add Domain State
  const [newDomain, setNewDomain] = useState<string>('');

  // Bulk Upload Registration State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkCsvText, setBulkCsvText] = useState<string>('');
  const [bulkAutoApprove, setBulkAutoApprove] = useState<boolean>(true);
  const [parsedBulkReqs, setParsedBulkReqs] = useState<Partial<RegistrationRequest>[]>([]);
  const [bulkUploading, setBulkUploading] = useState<boolean>(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Status Search for Employee
  const [trackQuery, setTrackQuery] = useState<string>('');
  const [trackResult, setTrackResult] = useState<RegistrationRequest | null>(null);
  const [trackSearched, setTrackSearched] = useState<boolean>(false);

  // Message Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showMsg = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  // CSV Parsing & Bulk Upload Handlers
  const parseBulkCSVText = (text: string): Partial<RegistrationRequest>[] => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    const startIndex =
      lines[0].toLowerCase().includes('email') ||
      lines[0].toLowerCase().includes('name') ||
      lines[0].toLowerCase().includes('vehicle') ||
      lines[0].toLowerCase().includes('employee')
        ? 1
        : 0;

    const results: Partial<RegistrationRequest>[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 3) continue;

      let empId = cols[0] || '';
      let name = cols[1] || '';
      let email = cols[2] || '';
      let dept = cols[3] || 'Engineering';
      let desig = cols[4] || 'Specialist';
      let mobile = cols[5] || '+91 9800000000';
      let plate = cols[6] || '';
      let rawVType = (cols[7] || 'SEDAN').toUpperCase();
      let vBrand = cols[8] || 'Standard';

      if (!email.includes('@')) {
        const foundEmail = cols.find((c) => c.includes('@'));
        if (foundEmail) email = foundEmail;
      }

      if (name && plate && email) {
        const validTypes = ['SEDAN', 'SUV', 'HATCHBACK', 'EV', 'TWO_WHEELER'];
        const vType: VehicleType = validTypes.includes(rawVType) ? (rawVType as VehicleType) : 'SEDAN';

        results.push({
          employeeId: empId || `EMP-${2000 + Math.floor(Math.random() * 8000)}`,
          name,
          email,
          department: dept,
          designation: desig,
          mobile,
          vehicleNumber: plate.toUpperCase(),
          vehicleType: vType,
          vehicleBrand: vBrand,
          registrationType: 'PARKING_ADMIN',
        });
      }
    }
    return results;
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setBulkCsvText(content);
        const parsed = parseBulkCSVText(content);
        setParsedBulkReqs(parsed);
      }
    };
    reader.readAsText(file);
  };

  const handleCsvTextChange = (text: string) => {
    setBulkCsvText(text);
    const parsed = parseBulkCSVText(text);
    setParsedBulkReqs(parsed);
  };

  const downloadSampleBulkCSV = () => {
    const headers = [
      'Employee ID',
      'Full Name',
      'Corporate Email',
      'Department',
      'Designation',
      'Mobile Contact',
      'Vehicle Plate Number',
      'Vehicle Type',
      'Vehicle Brand',
    ];
    const sampleRows = [
      ['EMP-8001', 'Anand Verma', 'anand.v@company.com', 'Engineering', 'Lead Architect', '+91 9876543210', 'KA-01-AB-1001', 'SEDAN', 'Honda City'],
      ['EMP-8002', 'Priya Sharma', 'priya.s@company.com', 'Operations', 'Senior Manager', '+91 9876543211', 'KA-05-MH-2022', 'SUV', 'Tata Harrier'],
      ['EMP-8003', 'Rahul Nair', 'rahul.n@company.com', 'Finance & Legal', 'Financial Analyst', '+91 9876543212', 'DL-01-EV-3033', 'EV', 'Nexon EV'],
    ];
    const csvContent = [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Employee_Vehicle_Registration_Bulk_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmBulkUpload = async () => {
    if (parsedBulkReqs.length === 0) {
      showMsg('error', 'No valid employee registration rows parsed.');
      return;
    }
    try {
      setBulkUploading(true);
      const payloadReqs = parsedBulkReqs.map((r) => ({
        ...r,
        registrationType: 'PARKING_ADMIN' as const,
      }));

      // Persist to backend database API
      const res = await fetch('/api/v1/registrations/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: payloadReqs, autoApprove: bulkAutoApprove }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(
          'success',
          `Bulk Upload Successful! Added ${data.added} new records, updated ${data.updated} records.`
        );
        setIsBulkModalOpen(false);
        setBulkCsvText('');
        setParsedBulkReqs([]);
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message || 'Bulk upload failed.');
      }
    } catch (err) {
      showMsg('error', 'Failed to execute bulk registration upload.');
    } finally {
      setBulkUploading(false);
    }
  };

  const fetchRegistrations = async () => {
    try {
      const res = await fetch('/api/v1/registrations');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Error fetching registration requests:', err);
    }
  };

  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/v1/domains');
      const data = await res.json();
      setDomains(data.domains || []);
    } catch (err) {
      console.error('Error fetching domains:', err);
    }
  };

  const fetchSlots = async () => {
    try {
      const res = await fetch('/api/v1/slots');
      const data = await res.json();
      setSlots(data.slots || []);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await Promise.all([fetchRegistrations(), fetchDomains(), fetchSlots()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Compute email domain validity in real-time
  const getEnteredDomain = (emailStr: string) => {
    if (!emailStr || !emailStr.includes('@')) return null;
    const parts = emailStr.trim().split('@');
    if (parts.length < 2 || !parts[1]) return null;
    return parts[1].toLowerCase();
  };

  const currentEnteredDomain = getEnteredDomain(formData.email);
  const activeDomainList = domains.filter((d) => d.isActive).map((d) => d.domain.toLowerCase());
  const isDomainWhitelisted = currentEnteredDomain ? activeDomainList.includes(currentEnteredDomain) : null;

  // Submit Registration Request
  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.vehicleNumber) {
      showMsg('error', 'Please fill in all required fields (Name, Corporate Email, and License Plate).');
      return;
    }

    if (isDomainWhitelisted === false) {
      showMsg(
        'error',
        `Domain @${currentEnteredDomain} is not whitelisted. Registrations allowed only for corporate domains (${activeDomainList.map((d) => '@' + d).join(', ')}).`
      );
      return;
    }

    try {
      setLoading(true);
      const payload = {
        ...formData,
        registrationType: activeView === 'ADMIN_APPROVAL' ? 'PARKING_ADMIN' : 'EMPLOYEE_SELF',
      };
      const res = await fetch('/api/v1/registrations/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message || `Registration request submitted successfully!`);
        setFormData({
          name: '',
          email: '',
          department: 'Engineering',
          designation: 'Senior Specialist',
          mobile: '',
          vehicleNumber: '',
          vehicleType: 'SEDAN',
          vehicleBrand: '',
          employeeId: '',
        });
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message || 'Failed to submit registration request.');
      }
    } catch (err: any) {
      console.error('Registration submit error:', err);
      const errMsg = err?.message || 'Failed to submit registration request.';
      showMsg('error', `Registration Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Approve Request
  const handleApprove = async (requestId: string) => {
    try {
      const res = await fetch('/api/v1/registrations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message);
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message);
      }
    } catch (err) {
      showMsg('error', 'Failed to approve registration request.');
    }
  };

  // Reject Request
  const handleRejectSubmit = async () => {
    if (!rejectingReqId) return;
    try {
      const res = await fetch('/api/v1/registrations/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: rejectingReqId, reason: rejectionReason }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message);
        setRejectingReqId(null);
        setRejectionReason('');
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message);
      }
    } catch (err) {
      showMsg('error', 'Failed to reject registration request.');
    }
  };

  // Add Domain
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDom = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!cleanDom) return;
    try {
      const res = await fetch('/api/v1/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cleanDom }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message || `Domain @${cleanDom} whitelisted!`);
        setNewDomain('');
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message);
      }
    } catch (err) {
      showMsg('error', 'Failed to add domain.');
    }
  };

  // Remove Domain
  const handleRemoveDomain = async (domainId: string) => {
    try {
      const res = await fetch('/api/v1/domains/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message || 'Domain removed from whitelist');
        refreshData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg('error', data.message);
      }
    } catch (err) {
      showMsg('error', 'Failed to remove domain.');
    }
  };

  // Export All Registrations CSV with Timestamps
  const exportAllRegistrationsCSV = () => {
    if (requests.length === 0) {
      showMsg('error', 'No registration requests available to export.');
      return;
    }

    const headers = [
      'Employee ID',
      'Employee Name',
      'Corporate Email',
      'Mobile Number',
      'Department',
      'Designation',
      'Vehicle Plate Number',
      'Vehicle Type',
      'Vehicle Brand',
      'Registration Type (Source Log)',
      'Approval Status',
      'Request Date & Time (Created)',
      'Approval/Decision Date & Time (Reviewed)',
      'Rejection Reason'
    ];

    const rows = requests.map((r) => {
      const createdStr = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'N/A';
      const reviewedStr = r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : 'N/A';
      const cleanReason = (r.rejectionReason || 'N/A').replace(/"/g, '""');
      const regTypeLabel = r.registrationType === 'PARKING_ADMIN' ? 'Parking Admin Registration' : 'Employee Self Registration';

      return [
        `"${r.employeeId || ''}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.email || '').replace(/"/g, '""')}"`,
        `"${(r.mobile || '').replace(/"/g, '""')}"`,
        `"${(r.department || '').replace(/"/g, '""')}"`,
        `"${(r.designation || '').replace(/"/g, '""')}"`,
        `"${(r.vehicleNumber || '').replace(/"/g, '""')}"`,
        `"${r.vehicleType || ''}"`,
        `"${(r.vehicleBrand || '').replace(/"/g, '""')}"`,
        `"${regTypeLabel}"`,
        `"${r.status || 'PENDING'}"`,
        `"${createdStr}"`,
        `"${reviewedStr}"`,
        `"${cleanReason}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateTag = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Employee_Vehicle_Registrations_With_Timestamps_${dateTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMsg('success', `Exported ${requests.length} registration records with timestamps!`);
  };

  // Track Application Status
  const handleTrackStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    const q = trackQuery.trim().toLowerCase();
    const found = requests.find(
      (r) => r.email.toLowerCase() === q || r.vehicleNumber.toLowerCase() === q || r.employeeId.toLowerCase() === q
    );
    setTrackResult(found || null);
    setTrackSearched(true);
  };

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;

  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.vehicleNumber.toLowerCase().includes(q) ||
        r.employeeId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-[#121826] space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl shadow-lg border text-xs font-mono font-bold flex items-center justify-between transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-emerald-100'
              : 'bg-rose-50 border-rose-300 text-rose-900 shadow-rose-100'
          }`}
        >
          <div className="flex items-center space-x-3">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{toast.msg}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 text-white rounded-xl shadow-md ${
              activeView === 'REGISTER' 
                ? 'bg-blue-600 shadow-blue-600/20' 
                : 'bg-indigo-600 shadow-indigo-600/20'
            }`}>
              {activeView === 'REGISTER' ? (
                <UserPlus className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                {activeView === 'REGISTER' ? 'Employee Vehicle Registration' : 'Employee Vehicle Approval'}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                  activeView === 'REGISTER'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}>
                  {activeView === 'REGISTER' ? 'Domain Whitelisted' : `${pendingCount} Pending Requests`}
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                {activeView === 'REGISTER'
                  ? 'Self-service vehicle whitelist registration form with corporate domain authentication and live application tracking.'
                  : 'Parking admin verification queue, vehicle request approvals/rejections, and corporate domain whitelist management.'}
              </p>
            </div>
          </div>
        </div>

        {activeView === 'REGISTER' && (
          <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto shrink-0">
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md shadow-purple-600/20 transition-all"
              title="Bulk register employee vehicles via CSV"
            >
              <Upload className="w-4 h-4" />
              <span>Bulk Register (CSV)</span>
            </button>

            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Live Parking Sync Active</span>
            </div>
            <button
              onClick={refreshData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all"
              title="Refresh Live Parking & Registrations Data"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: EMPLOYEE SELF-REGISTRATION PORTAL */}
      {activeView === 'REGISTER' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Registration Form */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Car className="w-5 h-5 text-blue-600" />
                  Submit Vehicle Parking Registration
                </h3>
                <p className="text-xs text-slate-500">
                  Fill in your details. Registration requests are domain-authenticated and sent to Parking Admin for approval.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 shrink-0 transition-all"
              >
                <Upload className="w-3.5 h-3.5 text-purple-600" />
                <span>Bulk Upload Option</span>
              </button>
            </div>

            {/* Whitelisted Domain Live Indicator Banner */}
            <div className="mb-6 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-bold text-slate-700">Whitelisted Corporate Domains:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeDomainList.map((dom) => (
                  <span
                    key={dom}
                    className="px-2 py-0.5 bg-blue-100/80 text-blue-900 font-mono font-bold rounded text-[11px] border border-blue-200"
                  >
                    @{dom}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmitRegistration} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Full Employee Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Employee ID */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Employee ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-2045 (auto-generated if empty)"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Corporate Email Address with Domain Validation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 font-bold">
                    Corporate Email Address <span className="text-rose-500">*</span>
                  </label>
                  {currentEnteredDomain && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center space-x-1 ${
                        isDomainWhitelisted
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {isDomainWhitelisted ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Whitelisted Domain (@{currentEnteredDomain})</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3 text-rose-600" />
                          <span>Unauthorized Domain (@{currentEnteredDomain})</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="e.g. employee.name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3.5 py-2.5 pl-9 bg-white border rounded-xl font-medium focus:ring-2 focus:outline-none transition-colors ${
                      isDomainWhitelisted === true
                        ? 'border-emerald-400 focus:ring-emerald-500'
                        : isDomainWhitelisted === false
                        ? 'border-rose-400 focus:ring-rose-500'
                        : 'border-slate-200 focus:ring-blue-500'
                    }`}
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                {isDomainWhitelisted === false && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">
                    Only whitelisted corporate domains ({activeDomainList.map((d) => '@' + d).join(', ')}) are allowed. Unregistered domains will be blocked.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Department */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Department</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
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

                {/* Designation */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Software Engineer"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mobile */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Mobile Contact</label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Vehicle License Plate Number */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Vehicle License Plate Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KA-01-AB-1234"
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase tracking-wider"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Vehicle Type */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vehicle Type</label>
                  <select
                    value={formData.vehicleType}
                    onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value as VehicleType })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="SEDAN">SEDAN / Compact</option>
                    <option value="SUV">SUV / CSUV (High Clearance)</option>
                    <option value="HATCHBACK">HATCHBACK</option>
                    <option value="EV">EV (Electric Vehicle - Rapid Bay Access)</option>
                    <option value="TWO_WHEELER">TWO_WHEELER (2W Bay)</option>
                  </select>
                </div>

                {/* Vehicle Brand / Model */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vehicle Brand & Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Tesla Model 3 / Tata Nexon EV"
                    value={formData.vehicleBrand}
                    onChange={(e) => setFormData({ ...formData, vehicleBrand: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isDomainWhitelisted === false}
                  className={`w-full py-3.5 px-6 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md ${
                    isDomainWhitelisted === false
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Submit Registration Request to Parking Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Track Registration Status & Instructions */}
          <div className="lg:col-span-5 space-y-6">
            {/* Status Tracker */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center space-x-2">
                <Search className="w-4 h-4 text-blue-600" />
                <span>Check Registration Application Status</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Enter your email address or license plate number to check if your request has been approved by Parking Admin.
              </p>

              <form onSubmit={handleTrackStatus} className="space-y-3">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="e.g. john.doe@company.com or KA-01-AB-1234"
                    value={trackQuery}
                    onChange={(e) => setTrackQuery(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
                  >
                    Check
                  </button>
                </div>
              </form>

              {/* Status Output Box */}
              {trackSearched && (
                <div className="mt-4 p-4 rounded-xl border text-xs">
                  {trackResult ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{trackResult.name}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                            trackResult.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : trackResult.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          }`}
                        >
                          {trackResult.status}
                        </span>
                      </div>
                      <div className="text-slate-600 space-y-1 font-mono text-[11px]">
                        <div>Email: {trackResult.email}</div>
                        <div>Vehicle Plate: {trackResult.vehicleNumber} ({trackResult.vehicleType})</div>
                        <div>Submitted: {new Date(trackResult.createdAt).toLocaleString()}</div>
                        {trackResult.rejectionReason && (
                          <div className="text-rose-600 font-bold mt-1">
                            Rejection Reason: {trackResult.rejectionReason}
                          </div>
                        )}
                      </div>
                      {trackResult.status === 'APPROVED' && (
                        <div className="p-2 bg-emerald-50 text-emerald-900 rounded-lg text-[11px] font-medium flex items-center space-x-2 mt-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Vehicle whitelisted! ANPR automatic gate entry is ACTIVE.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-2 text-slate-500">
                      No registration request found for '{trackQuery}'.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Registration Workflow Steps Card */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md space-y-4">
              <h4 className="text-sm font-bold flex items-center space-x-2 text-blue-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Domain-Authenticated Registration Flow</span>
              </h4>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                    1
                  </div>
                  <div>
                    <span className="font-bold text-white block">Domain Email Verification</span>
                    Employee enters corporate email ending in authorized domain (e.g., @company.com).
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                    2
                  </div>
                  <div>
                    <span className="font-bold text-white block">Parking Admin Review</span>
                    Request enters the approval queue for verification by security & parking managers.
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-mono font-bold shrink-0 text-[11px]">
                    3
                  </div>
                  <div>
                    <span className="font-bold text-white block">Instant Whitelist Activation</span>
                    Upon admin approval, vehicle plate is automatically added to live ANPR OCR camera recognition.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: PARKING ADMIN APPROVAL HUB */}
      {activeView === 'ADMIN_APPROVAL' && (
        <div className="space-y-6">
          {/* Admin Header Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Pending Requests</span>
                <span className="text-2xl font-black font-mono text-amber-600">{pendingCount}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Approved Whitelisted</span>
                <span className="text-2xl font-black font-mono text-emerald-600">{approvedCount}</span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Rejected Requests</span>
                <span className="text-2xl font-black font-mono text-rose-600">{rejectedCount}</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                <XCircle className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Requests Queue Container */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
              <div className="flex items-center space-x-2">
                <div className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 bg-blue-600 text-white shadow-md shadow-blue-600/20">
                  <UserCheck className="w-4 h-4" />
                  <span>Registration Requests Queue ({requests.length})</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-slate-900 rounded-full font-black text-[10px]">
                      {pendingCount}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={refreshData}
                className="p-2.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 text-xs font-bold flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </button>
            </div>

            {/* TAB 1: REGISTRATION REQUESTS QUEUE */}
            <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative w-full sm:w-80">
                    <input
                      type="text"
                      placeholder="Search name, email, vehicle..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-500">Filter:</span>
                    {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          statusFilter === st
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}

                    <button
                      onClick={() => setIsBulkModalOpen(true)}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all"
                      title="Bulk upload vehicle registrations via CSV"
                    >
                      <Upload className="w-3.5 h-3.5 text-purple-600" />
                      <span>Bulk Upload CSV</span>
                    </button>

                    <button
                      onClick={exportAllRegistrationsCSV}
                      className="ml-auto px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all"
                      title="Download full CSV report with approval status and timestamps"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Table Listing */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">Employee Info</th>
                        <th className="p-3.5">Department</th>
                        <th className="p-3.5">Vehicle License Plate</th>
                        <th className="p-3.5">Registration Source</th>
                        <th className="p-3.5">Domain Status</th>
                        <th className="p-3.5">Requested Timestamp</th>
                        <th className="p-3.5">Approval Decision Timestamp</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredRequests.length > 0 ? (
                        filteredRequests.map((req) => {
                          const dom = getEnteredDomain(req.email);
                          const isDomainValid = dom ? activeDomainList.includes(dom) : false;

                          return (
                            <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3.5">
                                <div className="font-bold text-slate-900">{req.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">{req.email}</div>
                                <div className="text-[10px] text-blue-600 font-mono font-bold">{req.employeeId}</div>
                              </td>

                              <td className="p-3.5 text-slate-700">
                                <div className="font-semibold">{req.department}</div>
                                <div className="text-[11px] text-slate-400">{req.designation}</div>
                              </td>

                              <td className="p-3.5">
                                <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                  {req.vehicleNumber}
                                </span>
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  {req.vehicleType}
                                </span>
                              </td>

                              <td className="p-3.5">
                                {req.registrationType === 'PARKING_ADMIN' ? (
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 flex items-center space-x-1 w-max">
                                    <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    <span>Parking Admin</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 flex items-center space-x-1 w-max">
                                    <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span>Employee Self</span>
                                  </span>
                                )}
                              </td>

                              <td className="p-3.5">
                                {isDomainValid ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    @{dom} Valid
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                    @{dom || 'unknown'} Invalid
                                  </span>
                                )}
                              </td>

                              <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                                <div>{new Date(req.createdAt).toLocaleDateString()}</div>
                                <div className="text-[10px] text-slate-400">{new Date(req.createdAt).toLocaleTimeString()}</div>
                              </td>

                              <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                                {req.reviewedAt ? (
                                  <>
                                    <div className="text-emerald-700 font-bold">{new Date(req.reviewedAt).toLocaleDateString()}</div>
                                    <div className="text-[10px] text-slate-500">{new Date(req.reviewedAt).toLocaleTimeString()}</div>
                                  </>
                                ) : (
                                  <span className="text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    Awaiting Review
                                  </span>
                                )}
                              </td>

                              <td className="p-3.5">
                                <span
                                  className={`px-2.5 py-1 rounded-full font-mono text-[10px] font-bold ${
                                    req.status === 'APPROVED'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : req.status === 'REJECTED'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </td>

                              <td className="p-3.5 text-right">
                                {req.status === 'PENDING' ? (
                                  <div className="flex items-center justify-end space-x-2">
                                    <button
                                      onClick={() => handleApprove(req.id)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center space-x-1 shadow-sm transition-all"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Approve</span>
                                    </button>

                                    <button
                                      onClick={() => setRejectingReqId(req.id)}
                                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold flex items-center space-x-1 shadow-sm transition-all"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-mono italic">Processed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            No registration requests found matching filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingReqId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>Reject Registration Request</span>
            </h3>

            <p className="text-xs text-slate-500">
              Provide a reason for rejecting this vehicle registration request.
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Invalid license plate format or expired employment contract."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setRejectingReqId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Registrations Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-md shadow-purple-600/20">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Bulk Employee Vehicle Registration
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-300">
                      Log Source: Parking Admin
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Register multiple employee vehicles at once. All entries will be maintained in the log as <strong className="text-purple-700">Parking Admin Registration</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {/* Helper info & sample template button */}
              <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2 text-purple-900 font-medium">
                  <FileSpreadsheet className="w-5 h-5 text-purple-600 shrink-0" />
                  <span>CSV Columns: <code>Employee ID, Full Name, Email, Dept, Designation, Mobile, Plate, Vehicle Type</code></span>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleBulkCSV}
                  className="px-3 py-1.5 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg font-bold text-xs flex items-center space-x-1.5 shrink-0 transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-purple-600" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>

              {/* File upload zone & auto-approve toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1">
                    Select CSV File
                  </label>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleBulkFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    className="w-full py-3 px-4 border-2 border-dashed border-purple-300 hover:border-purple-500 bg-purple-50/40 hover:bg-purple-50 rounded-xl text-xs font-bold text-purple-800 flex items-center justify-center space-x-2 transition-all"
                  >
                    <Upload className="w-4 h-4 text-purple-600" />
                    <span>Choose CSV File from Device</span>
                  </button>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="block text-slate-700 font-bold text-xs mb-1">
                    Processing Mode & Approval Log
                  </label>
                  <div
                    onClick={() => setBulkAutoApprove(!bulkAutoApprove)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                      bulkAutoApprove
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {bulkAutoApprove ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold">
                          {bulkAutoApprove ? 'Auto-Approve & Whitelist Immediately' : 'Submit to Pending Review Queue'}
                        </div>
                        <div className="text-[10px] opacity-80 font-mono">
                          Logged as Parking Admin Registration
                        </div>
                      </div>
                    </div>
                    <div className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors shrink-0 ${
                      bulkAutoApprove ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}>
                      <div className="w-4 h-4 bg-white rounded-full shadow-md"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Area Copy-Paste Option */}
              <div>
                <label className="block text-slate-700 font-bold text-xs mb-1">
                  Or Paste Raw CSV Text Data Below
                </label>
                <textarea
                  rows={4}
                  placeholder={`EMP-8001, Anand Verma, anand.v@company.com, Engineering, Lead Architect, +91 9876543210, KA-01-AB-1001, SEDAN, Honda City\nEMP-8002, Priya Sharma, priya.s@company.com, Operations, Senior Manager, +91 9876543211, KA-05-MH-2022, SUV, Tata Harrier`}
                  value={bulkCsvText}
                  onChange={(e) => handleCsvTextChange(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              {/* Parsed Preview Table */}
              {parsedBulkReqs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Parsed {parsedBulkReqs.length} Valid Registration Records</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-purple-700">
                      Log Source: Parking Admin
                    </span>
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold sticky top-0">
                        <tr>
                          <th className="p-2">EMP ID</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Email</th>
                          <th className="p-2">Plate Number</th>
                          <th className="p-2">Type</th>
                          <th className="p-2 text-right">Log Tag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[11px]">
                        {parsedBulkReqs.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white">
                            <td className="p-2 font-bold text-blue-700">{row.employeeId}</td>
                            <td className="p-2 text-slate-900 font-sans font-bold">{row.name}</td>
                            <td className="p-2 text-slate-600">{row.email}</td>
                            <td className="p-2 font-black text-slate-900">{row.vehicleNumber}</td>
                            <td className="p-2 text-slate-700">{row.vehicleType}</td>
                            <td className="p-2 text-right">
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                PARKING_ADMIN
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsBulkModalOpen(false);
                  setBulkCsvText('');
                  setParsedBulkReqs([]);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmBulkUpload}
                disabled={parsedBulkReqs.length === 0 || bulkUploading}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md transition-all ${
                  parsedBulkReqs.length === 0 || bulkUploading
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
                }`}
              >
                <Upload className={`w-4 h-4 ${bulkUploading ? 'animate-bounce' : ''}`} />
                <span>
                  {bulkUploading
                    ? 'Uploading Registrations...'
                    : `Process ${parsedBulkReqs.length} Registrations (Parking Admin)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
