import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Car,
  Zap,
  RefreshCw,
  Bell,
  Lock,
  User,
  Mail,
  Search,
  Layers,
  Send,
  Clock,
  X,
  ChevronRight,
  Sparkles,
  Plus,
  Building2,
  MapPin,
  Activity,
  Info,
  Phone,
  ArrowRight,
  Check,
  LogOut,
  Volume2,
  Wifi,
  Battery,
  AlertCircle,
  Edit3,
  QrCode,
  History,
  CheckCircle
} from 'lucide-react';
import { ParkingSlot, RegistrationRequest, WhitelistedDomain, VehicleType } from '../types';
import { normalizeVehicleNumber } from '../utils/plateNormalization';

interface EmployeeMobileAppProps {
  slots?: ParkingSlot[];
  onRefreshAll?: () => void;
}

interface AuthEmployee {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  mobile: string;
  domain: string;
}

interface RegisteredVehicleInfo {
  id?: string;
  employeeId?: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  status: string;
  isParked?: boolean;
  parkedSlotNumber?: string;
  parkedBasement?: string;
  updatedAt?: string;
}

interface VehicleUpdateLog {
  id: string;
  previousPlate: string;
  newPlate: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  reason: string;
  timestamp: string;
}

export const EmployeeMobileApp: React.FC<EmployeeMobileAppProps> = ({
  slots = [],
  onRefreshAll,
}) => {
  // Mobile app active tab
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MY_VEHICLE' | 'REGISTER' | 'REQUESTS' | 'NOTIFICATIONS'>('DASHBOARD');

  // Domain Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authEmployee, setAuthEmployee] = useState<AuthEmployee | null>(null);

  // Login form state
  const [emailInput, setEmailInput] = useState<string>('siddharth@company.com');
  const [passcode, setPasscode] = useState<string>('8092');
  const [passcodeSent, setPasscodeSent] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Whitelisted domains fetched from backend
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);

  // Live Slots State
  const [liveSlots, setLiveSlots] = useState<ParkingSlot[]>(slots);
  const [selectedBasement, setSelectedBasement] = useState<string>('B1');
  const [selectedSlotType, setSelectedSlotType] = useState<string>('ALL');
  const [slotSearch, setSlotSearch] = useState<string>('');

  // Active Registered Vehicle & Update Vehicle State
  const [myVehicle, setMyVehicle] = useState<RegisteredVehicleInfo | null>({
    vehicleNumber: 'KA-01-EX-8092',
    vehicleType: 'SEDAN',
    vehicleBrand: 'Honda City ZX',
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  });
  const [showUpdateVehicleModal, setShowUpdateVehicleModal] = useState<boolean>(false);
  const [updateVehicleForm, setUpdateVehicleForm] = useState({
    vehicleNumber: 'KA-01-EX-8092',
    vehicleType: 'SEDAN' as VehicleType,
    vehicleBrand: 'Honda City ZX',
    reason: 'Upgraded to new vehicle',
  });
  const [isUpdatingVehicle, setIsUpdatingVehicle] = useState<boolean>(false);
  const [updateVehicleMsg, setUpdateVehicleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [vehicleUpdateHistory, setVehicleUpdateHistory] = useState<VehicleUpdateLog[]>([
    {
      id: 'log-v1',
      previousPlate: 'KA-05-MM-1200',
      newPlate: 'KA-01-EX-8092',
      vehicleType: 'SEDAN',
      vehicleBrand: 'Honda City ZX',
      reason: 'Company Lease Upgrade',
      timestamp: '2 weeks ago',
    },
  ]);

  // My Registration Requests State
  const [myRequests, setMyRequests] = useState<RegistrationRequest[]>([]);
  const [reqLoading, setReqLoading] = useState<boolean>(false);

  // New Registration Form State
  const [regMode, setRegMode] = useState<'NEW_REQUEST' | 'UPDATE_VEHICLE'>('UPDATE_VEHICLE');
  const [regForm, setRegForm] = useState({
    vehicleNumber: '',
    vehicleType: 'SEDAN' as VehicleType,
    vehicleBrand: '',
  });
  const [submittingReg, setSubmittingReg] = useState<boolean>(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Push Notification State
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);
  const [activePushBanner, setActivePushBanner] = useState<{
    id: string;
    title: string;
    body: string;
    time: string;
    type: 'PARKING_FULL' | 'REGISTRATION_UPDATE' | 'INFO';
  } | null>(null);

  const [notificationHistory, setNotificationHistory] = useState<
    {
      id: string;
      title: string;
      body: string;
      time: string;
      type: 'PARKING_FULL' | 'REGISTRATION_UPDATE' | 'INFO';
      read: boolean;
    }[]
  >([
    {
      id: 'notif-1',
      title: 'Welcome to ParkOrbit Employee Mobile',
      body: 'Your corporate domain company.com is verified. Track real-time parking & manage your vehicle pass.',
      time: 'Just now',
      type: 'INFO',
      read: false,
    },
  ]);

  // Simulated device view mode (Phone Frame vs Wide Container)
  const [viewMode, setViewMode] = useState<'PHONE_FRAME' | 'FULL_CONTAINER'>('PHONE_FRAME');

  // Fetch Domains from backend
  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/v1/domains');
      const data = await res.json();
      if (data.domains) {
        setDomains(data.domains);
      }
    } catch (err) {
      console.error('Failed to fetch whitelisted domains:', err);
    }
  };

  // Fetch Live Slots from backend
  const fetchSlots = async () => {
    try {
      const res = await fetch('/api/v1/slots');
      const data = await res.json();
      if (data.slots) {
        setLiveSlots(data.slots);
      }
    } catch (err) {
      console.error('Failed to fetch slots:', err);
    }
  };

  // Fetch Employee Profile & Registered Vehicle
  const fetchEmployeeProfile = async () => {
    if (!authEmployee) return;
    try {
      const res = await fetch(`/api/v1/employees/profile?email=${encodeURIComponent(authEmployee.email)}`, {
        headers: {
          'x-user-email': authEmployee.email,
          'x-employee-id': authEmployee.employeeId,
          'x-user-role': 'EMPLOYEE',
        },
      });
      const data = await res.json();
      if (data.success && data.employee) {
        const emp = data.employee;
        const vehicleInfo: RegisteredVehicleInfo = {
          id: emp.id,
          employeeId: emp.employeeId,
          vehicleNumber: emp.vehicleNumber,
          vehicleType: emp.vehicleType || 'SEDAN',
          vehicleBrand: emp.vehicleBrand || 'Personal Vehicle',
          status: emp.status || 'ACTIVE',
          isParked: !!data.currentSlot,
          parkedSlotNumber: data.currentSlot?.slotNumber,
          parkedBasement: data.currentSlot?.basement,
          updatedAt: emp.updatedAt || emp.createdAt,
        };
        setMyVehicle(vehicleInfo);
        setUpdateVehicleForm({
          vehicleNumber: emp.vehicleNumber,
          vehicleType: emp.vehicleType || 'SEDAN',
          vehicleBrand: emp.vehicleBrand || '',
          reason: 'Vehicle Details Update',
        });
      } else {
        // Fallback default vehicle for demo
        const fallbackPlate = authEmployee.domain.includes('techcorp') ? 'TS-09-EV-4422' : 'KA-01-EX-8092';
        const fallbackType = authEmployee.domain.includes('techcorp') ? 'EV' : 'SEDAN';
        const fallbackBrand = authEmployee.domain.includes('techcorp') ? 'Tata Nexon EV Max' : 'Honda City ZX';
        const vehicleInfo: RegisteredVehicleInfo = {
          vehicleNumber: fallbackPlate,
          vehicleType: fallbackType,
          vehicleBrand: fallbackBrand,
          status: 'ACTIVE',
          updatedAt: new Date().toISOString(),
        };
        setMyVehicle(vehicleInfo);
        setUpdateVehicleForm({
          vehicleNumber: fallbackPlate,
          vehicleType: fallbackType,
          vehicleBrand: fallbackBrand,
          reason: 'Vehicle Details Update',
        });
      }
    } catch (err) {
      console.error('Failed to fetch employee profile:', err);
    }
  };

  // Fetch Registration Requests
  const fetchMyRequests = async () => {
    if (!authEmployee) return;
    setReqLoading(true);
    try {
      const res = await fetch('/api/v1/registrations');
      const data = await res.json();
      if (data.requests) {
        // Filter requests belonging to this employee's email or employee ID
        const filtered = data.requests.filter(
          (r: RegistrationRequest) =>
            r.email.toLowerCase() === authEmployee.email.toLowerCase() ||
            r.employeeId === authEmployee.employeeId
        );
        setMyRequests(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch registration requests:', err);
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
    fetchSlots();
    const interval = setInterval(() => {
      fetchSlots();
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authEmployee) {
      fetchMyRequests();
      fetchEmployeeProfile();
    }
  }, [authEmployee]);

  // Open Update Vehicle Modal pre-populated with current registered data
  const openUpdateVehicleModal = () => {
    if (myVehicle) {
      setUpdateVehicleForm({
        vehicleNumber: myVehicle.vehicleNumber,
        vehicleType: myVehicle.vehicleType,
        vehicleBrand: myVehicle.vehicleBrand,
        reason: 'Vehicle Update / Upgrade',
      });
    }
    setUpdateVehicleMsg(null);
    setShowUpdateVehicleModal(true);
  };

  // Submit Vehicle Update Request / Direct Sync
  const handleUpdateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmployee) {
      setUpdateVehicleMsg({ type: 'error', text: 'You must be authenticated with a corporate domain.' });
      return;
    }

    if (!updateVehicleForm.vehicleNumber.trim()) {
      setUpdateVehicleMsg({ type: 'error', text: 'Please enter a valid Vehicle License Plate Number.' });
      return;
    }

    try {
      setIsUpdatingVehicle(true);
      setUpdateVehicleMsg(null);

      const cleanPlate = updateVehicleForm.vehicleNumber.trim().toUpperCase();

      const res = await fetch('/api/v1/employees/update-vehicle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': authEmployee.email,
          'x-employee-id': authEmployee.employeeId,
          'x-user-role': 'EMPLOYEE',
        },
        body: JSON.stringify({
          employeeId: authEmployee.employeeId,
          email: authEmployee.email,
          vehicleNumber: cleanPlate,
          vehicleType: updateVehicleForm.vehicleType,
          vehicleBrand: updateVehicleForm.vehicleBrand || 'Personal Vehicle',
          updateReason: updateVehicleForm.reason || 'Employee Mobile App Update',
        }),
      });

      const data = await res.json();

      if (data.success) {
        const previousPlate = myVehicle?.vehicleNumber || 'N/A';
        const updatedVehicleInfo: RegisteredVehicleInfo = {
          id: data.employee?.id,
          employeeId: authEmployee.employeeId,
          vehicleNumber: cleanPlate,
          vehicleType: updateVehicleForm.vehicleType,
          vehicleBrand: updateVehicleForm.vehicleBrand || 'Personal Vehicle',
          status: 'ACTIVE',
          isParked: myVehicle?.isParked,
          parkedSlotNumber: myVehicle?.parkedSlotNumber,
          parkedBasement: myVehicle?.parkedBasement,
          updatedAt: new Date().toISOString(),
        };

        setMyVehicle(updatedVehicleInfo);

        // Add to history log
        setVehicleUpdateHistory((prev) => [
          {
            id: `log-${Date.now()}`,
            previousPlate,
            newPlate: cleanPlate,
            vehicleType: updateVehicleForm.vehicleType,
            vehicleBrand: updateVehicleForm.vehicleBrand || 'Personal Vehicle',
            reason: updateVehicleForm.reason || 'Profile update',
            timestamp: 'Just now',
          },
          ...prev,
        ]);

        setUpdateVehicleMsg({
          type: 'success',
          text: `Vehicle successfully updated to ${cleanPlate}! Gate ANPR passes updated.`,
        });

        // Trigger notification banner
        triggerPushAlert(
          'REGISTRATION_UPDATE',
          '🚗 Vehicle Updated & Whitelisted!',
          `License Plate ${cleanPlate} (${updateVehicleForm.vehicleType}) is now verified for automated gate entry.`
        );

        if (onRefreshAll) onRefreshAll();
        fetchMyRequests();

        setTimeout(() => {
          setShowUpdateVehicleModal(false);
          setUpdateVehicleMsg(null);
        }, 1400);
      } else {
        setUpdateVehicleMsg({
          type: 'error',
          text: data.message || 'Failed to update vehicle record.',
        });
      }
    } catch (err: any) {
      setUpdateVehicleMsg({
        type: 'error',
        text: err.message || 'Network error updating vehicle.',
      });
    } finally {
      setIsUpdatingVehicle(false);
    }
  };

  // Compute domain list
  const activeDomainList = domains.filter((d) => d.isActive).map((d) => d.domain.toLowerCase());
  // Fallback defaults if backend domains empty
  const defaultDomains = ['company.com', 'techcorp.com', 'globalnet.io', 'parkos.ai'];
  const validDomainsList = activeDomainList.length > 0 ? activeDomainList : defaultDomains;

  // Extract domain from input
  const getEnteredDomain = (email: string) => {
    if (!email || !email.includes('@')) return '';
    return email.split('@')[1].trim().toLowerCase();
  };

  const currentEnteredDomain = getEnteredDomain(emailInput);
  const isDomainWhitelisted = validDomainsList.includes(currentEnteredDomain);

  // Trigger Parking Full Push Notification check whenever slots update
  const totalSlotsCount = liveSlots.length > 0 ? liveSlots.length : 1080;
  const occupiedSlotsCount = liveSlots.filter((s) => s.status === 'OCCUPIED').length;
  const isParking100PercentFull = occupiedSlotsCount >= totalSlotsCount && totalSlotsCount > 0;

  // Handle Domain Authentication Submission
  const handleRequestPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!emailInput.trim() || !emailInput.includes('@')) {
      setAuthError('Please enter a valid corporate email address.');
      return;
    }

    if (!isDomainWhitelisted) {
      setAuthError(
        `Domain @${currentEnteredDomain || 'unknown'} is NOT an authorized corporate domain for this facility.`
      );
      return;
    }

    setAuthLoading(true);
    setTimeout(() => {
      setAuthLoading(false);
      setPasscodeSent(true);
    }, 600);
  };

  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (passcode.length < 4) {
      setAuthError('Please enter the 4-digit security code sent to your email.');
      return;
    }

    // Authenticate employee session
    const domain = getEnteredDomain(emailInput);
    const empName = emailInput?.includes('@') ? (emailInput.split('@')[0] || '').replace('.', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Corporate Employee';

    const employeeObj: AuthEmployee = {
      employeeId: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: empName || 'Corporate Employee',
      email: emailInput,
      department: 'Engineering & Technology',
      mobile: '+91 98765 43210',
      domain: domain,
    };

    setAuthEmployee(employeeObj);
    setIsAuthenticated(true);
    setActiveTab('DASHBOARD');

    // Trigger welcome push notification
    triggerPushAlert(
      'PARKING_FULL',
      `Welcome ${employeeObj.name}!`,
      `Logged in via domain @${domain}. Live parking matrix ready.`
    );
  };

  const handleDemoQuickLogin = (demoEmail: string, demoName: string, demoDept: string) => {
    const domain = getEnteredDomain(demoEmail);
    const employeeObj: AuthEmployee = {
      employeeId: `EMP-4092`,
      name: demoName,
      email: demoEmail,
      department: demoDept,
      mobile: '+91 98112 33445',
      domain: domain,
    };
    setEmailInput(demoEmail);
    setAuthEmployee(employeeObj);
    setIsAuthenticated(true);
    setActiveTab('DASHBOARD');
  };

  // Submit New Vehicle Registration Request from Mobile App
  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!authEmployee) {
      setFormMsg({ type: 'error', text: 'You must be logged in with a corporate domain.' });
      return;
    }

    if (!regForm.vehicleNumber.trim()) {
      setFormMsg({ type: 'error', text: 'Please enter a valid Vehicle License Plate Number.' });
      return;
    }

    try {
      setSubmittingReg(true);

      const payload = {
        employeeId: authEmployee.employeeId,
        name: authEmployee.name,
        email: authEmployee.email,
        mobile: authEmployee.mobile,
        department: authEmployee.department,
        designation: 'Employee Staff',
        vehicleNumber: regForm.vehicleNumber.trim().toUpperCase(),
        vehicleType: regForm.vehicleType,
        vehicleBrand: regForm.vehicleBrand || 'Standard Vehicle',
        registrationType: 'EMPLOYEE_SELF' as const,
      };

      const res = await fetch('/api/v1/registrations/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setFormMsg({
          type: 'success',
          text: `Request submitted! Pending admin review for ${payload.vehicleNumber}.`,
        });
        setRegForm({
          vehicleNumber: '',
          vehicleType: 'SEDAN',
          vehicleBrand: '',
        });
        fetchMyRequests();
        if (onRefreshAll) onRefreshAll();

        // Push notification for submitted request
        triggerPushAlert(
          'REGISTRATION_UPDATE',
          'Vehicle Request Submitted',
          `Your registration request for ${payload.vehicleNumber} has been sent to Admin for review.`
        );
      } else {
        setFormMsg({ type: 'error', text: data.message || 'Failed to submit registration request.' });
      }
    } catch (err: any) {
      setFormMsg({ type: 'error', text: err.message || 'Network error submitting request.' });
    } finally {
      setSubmittingReg(false);
    }
  };

  // Trigger Push Alert
  const triggerPushAlert = (
    type: 'PARKING_FULL' | 'REGISTRATION_UPDATE' | 'INFO',
    title: string,
    body: string
  ) => {
    if (!pushEnabled) return;

    const notifItem = {
      id: `push-${Date.now()}`,
      title,
      body,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      read: false,
    };

    setActivePushBanner(notifItem);
    setNotificationHistory((prev) => [notifItem, ...prev]);

    // Auto dismiss top banner after 6 seconds
    setTimeout(() => {
      setActivePushBanner(null);
    }, 6000);
  };

  // Trigger Manual Simulation of Parking Full Push Notification
  const simulateParkingFullEvent = () => {
    triggerPushAlert(
      'PARKING_FULL',
      '🚨 ALERT: Parking Lot Full!',
      `All ${totalSlotsCount} parking slots at Tech Park HQ are currently 100% occupied. Valet overflow redirection active.`
    );
  };

  // Filter slots for live matrix display
  const filteredSlots = liveSlots.filter((slot) => {
    const matchesBasement = selectedBasement === 'ALL' || slot.basement === selectedBasement;
    const matchesType = selectedSlotType === 'ALL' || slot.slotType === selectedSlotType;
    const matchesSearch =
      !slotSearch ||
      slot.slotNumber.toLowerCase().includes(slotSearch.toLowerCase()) ||
      (slot.currentVehicle && slot.currentVehicle.toLowerCase().includes(slotSearch.toLowerCase()));
    return matchesBasement && matchesType && matchesSearch;
  });

  // Calculate parking metrics
  const totalSlots = liveSlots.length > 0 ? liveSlots.length : 1080;
  const occupiedCount = liveSlots.filter((s) => s.status === 'OCCUPIED').length;
  const vacantCount = totalSlots - occupiedCount;
  const occupancyPct = Math.round((occupiedCount / totalSlots) * 100);
  const evSlotsAvailable = liveSlots.filter((s) => s.slotType === 'EV' && s.status === 'VACANT').length;

  // Check if current user has a vehicle currently parked
  const myParkedSlot = authEmployee
    ? liveSlots.find((s) => s.currentVehicle && s.currentVehicle.includes('MH') || s.currentVehicle === 'KA-01-EX-1234')
    : null;

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
              <h2 className="text-lg font-black text-white">ParkOrbit Employee Mobile App</h2>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Live Companion
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Domain-authenticated employee vehicle registration portal with real-time parking slot matrix & push alerts.
            </p>
          </div>
        </div>

        {/* Control Switches */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch md:self-auto shrink-0">
          <button
            onClick={() => setPushEnabled(!pushEnabled)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all border ${
              pushEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Push Notifications: {pushEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={simulateParkingFullEvent}
            className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Simulate Parking Full Push Alert</span>
          </button>

          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setViewMode('PHONE_FRAME')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'PHONE_FRAME' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mobile Device Frame
            </button>
            <button
              onClick={() => setViewMode('FULL_CONTAINER')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'FULL_CONTAINER' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Expanded View
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: SMARTPHONE FRAME OR EXPANDED VIEW */}
      <div
        className={`mx-auto transition-all ${
          viewMode === 'PHONE_FRAME' ? 'max-w-md' : 'max-w-4xl'
        }`}
      >
        {/* MOBILE SMARTPHONE SHELL */}
        <div className="bg-slate-900 rounded-[3rem] p-3 sm:p-4 shadow-2xl border-4 border-slate-800 relative overflow-hidden">
          {/* Smartphone Top Notch & Camera Bar */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-5 bg-slate-950 rounded-b-xl z-50 flex items-center justify-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700"></div>
            <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
          </div>

          {/* INNER SCREEN */}
          <div className="bg-slate-50 text-slate-900 rounded-[2.2rem] overflow-hidden min-h-[680px] flex flex-col relative border border-slate-200">
            {/* Top Device Status Bar */}
            <div className="bg-slate-900 text-white px-6 pt-3 pb-2.5 flex items-center justify-between text-[11px] font-mono tracking-tight shrink-0 border-b border-slate-800">
              <span className="font-bold">09:41 AM</span>
              <div className="flex items-center space-x-2 text-slate-400">
                <Wifi className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">5G</span>
                <Battery className="w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* PUSH NOTIFICATION POPUP BANNER */}
            {activePushBanner && (
              <div className="absolute top-10 left-3 right-3 z-50 bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700 animate-bounce space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1 bg-rose-500/20 text-rose-400 rounded-lg">
                      <Bell className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-white">{activePushBanner.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{activePushBanner.time}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">{activePushBanner.body}</p>
              </div>
            )}

            {/* SCREEN CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* UNAUTHENTICATED: DOMAIN BASED LOGIN SCREEN */}
              {!isAuthenticated ? (
                <div className="space-y-5 pt-4">
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/30">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900">ParkOrbit Corporate</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Employee Vehicle Registration & Live Parking Terminal
                    </p>
                  </div>

                  {/* Domain Validation Info Box */}
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center space-x-2 text-blue-900 font-bold">
                      <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Domain-Based Authentication</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Only employees with pre-whitelisted corporate email domains can access this terminal.
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {validDomainsList.map((d, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-white border border-blue-200 rounded-md text-[10px] font-mono font-bold text-blue-800"
                        >
                          @{d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Auth Form */}
                  {!passcodeSent ? (
                    <form onSubmit={handleRequestPasscode} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Corporate Email Address
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            required
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="employee@company.com"
                            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm"
                          />
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        </div>
                        {currentEnteredDomain && (
                          <div className="mt-1.5 flex items-center space-x-1.5 text-[11px] font-bold">
                            {isDomainWhitelisted ? (
                              <span className="text-emerald-600 flex items-center space-x-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>Domain @{currentEnteredDomain} is Whitelisted ✓</span>
                              </span>
                            ) : (
                              <span className="text-rose-600 flex items-center space-x-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Domain @{currentEnteredDomain} is NOT Whitelisted</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {authError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{authError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 flex items-center justify-center space-x-2 transition-all"
                      >
                        {authLoading ? (
                          <span>Verifying Domain...</span>
                        ) : (
                          <>
                            <span>Verify Domain & Request Passcode</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    /* Passcode Verification Screen */
                    <form onSubmit={handleVerifyPasscode} className="space-y-4">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Passcode Sent to {emailInput}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPasscodeSent(false)}
                          className="text-[10px] text-emerald-700 underline"
                        >
                          Change
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Enter 4-Digit One Time Passcode (OTP)
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          value={passcode}
                          onChange={(e) => setPasscode(e.target.value)}
                          placeholder="8092"
                          className="w-full tracking-widest text-center py-3 bg-white border border-slate-200 rounded-xl text-base font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm"
                        />
                      </div>

                      {authError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                          {authError}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Authenticate & Open Mobile Hub</span>
                      </button>
                    </form>
                  )}

                  {/* Demo Quick Logins */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                      Quick Demo Auth Presets
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDemoQuickLogin(
                            'siddharth@company.com',
                            'Siddharth Rao',
                            'Engineering Staff'
                          )
                        }
                        className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left text-[11px]"
                      >
                        <div className="font-bold text-slate-800">Siddharth R.</div>
                        <div className="text-[9px] text-slate-500">@company.com</div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDemoQuickLogin(
                            'ananya@techcorp.com',
                            'Ananya Sharma',
                            'Product & Design'
                          )
                        }
                        className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left text-[11px]"
                      >
                        <div className="font-bold text-slate-800">Ananya S.</div>
                        <div className="text-[9px] text-slate-500">@techcorp.com</div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* AUTHENTICATED EMPLOYEE MOBILE HUB */
                <div className="space-y-4">
                  {/* Employee Profile Header Card */}
                  <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                        {authEmployee?.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <h4 className="text-xs font-bold text-white">{authEmployee?.name}</h4>
                          <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-bold">
                            Verified
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {authEmployee?.department} • @{authEmployee?.domain}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsAuthenticated(false)}
                      className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800 rounded-xl transition-all"
                      title="Log Out Mobile Session"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  {/* PARKING CAPACITY LIVE METRICS CARD */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Activity className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-900">Live Parking Dashboard</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isParking100PercentFull
                            ? 'bg-rose-100 text-rose-700 animate-pulse'
                            : occupancyPct >= 80
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isParking100PercentFull ? '🚨 LOT FULL 100%' : `${occupancyPct}% Occupied`}
                      </span>
                    </div>

                    {/* Capacity Bar */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${occupancyPct}%` }}
                        className={`h-full transition-all ${
                          isParking100PercentFull ? 'bg-rose-600' : 'bg-blue-600'
                        }`}
                      ></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                        <span className="block text-[10px] text-slate-500 font-bold">Total</span>
                        <span className="text-xs font-black text-slate-900">{totalSlots}</span>
                      </div>
                      <div className="p-2 bg-rose-50 border border-rose-100 rounded-xl">
                        <span className="block text-[10px] text-rose-700 font-bold">Occupied</span>
                        <span className="text-xs font-black text-rose-800">{occupiedCount}</span>
                      </div>
                      <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <span className="block text-[10px] text-emerald-700 font-bold">Vacant</span>
                        <span className="text-xs font-black text-emerald-800">{vacantCount}</span>
                      </div>
                    </div>

                    {/* EV Charging Alert */}
                    <div className="p-2.5 bg-cyan-50 border border-cyan-200 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 text-cyan-900 font-bold">
                        <Zap className="w-4 h-4 text-cyan-600" />
                        <span>EV Fast Chargers Available</span>
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-600 text-white font-mono font-bold text-[11px] rounded-lg">
                        {evSlotsAvailable} Free
                      </span>
                    </div>
                  </div>

                  {/* ACTIVE REGISTERED VEHICLE CARD WITH DIRECT "UPDATE VEHICLE" ACTION */}
                  {myVehicle && (
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-3.5 shadow-md border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="p-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg text-blue-400">
                            <Car className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                              My Registered Vehicle
                            </div>
                            <div className="font-mono font-black text-sm tracking-wide text-white flex items-center space-x-1.5">
                              <span>{myVehicle.vehicleNumber}</span>
                              <span className="px-1.5 py-0.2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[9px] rounded font-sans">
                                ANPR Pass
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Update Vehicle Button */}
                        <button
                          onClick={openUpdateVehicleModal}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[11px] font-bold flex items-center space-x-1 shadow transition-all"
                          title="Update Registered Vehicle Plate or Type"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Update Vehicle</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80 text-slate-300">
                        <span>
                          {myVehicle.vehicleBrand || 'Standard'} •{' '}
                          <span className="font-bold text-blue-400">{myVehicle.vehicleType}</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {myVehicle.isParked ? (
                            <span className="text-emerald-400 font-bold">
                              📍 Parked in {myVehicle.parkedSlotNumber} ({myVehicle.parkedBasement})
                            </span>
                          ) : (
                            'Ready for Gate-In'
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TAB NAVIGATION BUTTONS */}
                  <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-bold">
                    <button
                      onClick={() => setActiveTab('DASHBOARD')}
                      className={`py-2 rounded-lg transition-all text-center ${
                        activeTab === 'DASHBOARD'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Live Grid
                    </button>
                    <button
                      onClick={() => setActiveTab('MY_VEHICLE')}
                      className={`py-2 rounded-lg transition-all text-center ${
                        activeTab === 'MY_VEHICLE'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      My Vehicle
                    </button>
                    <button
                      onClick={() => setActiveTab('REGISTER')}
                      className={`py-2 rounded-lg transition-all text-center ${
                        activeTab === 'REGISTER'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Update / Add
                    </button>
                    <button
                      onClick={() => setActiveTab('REQUESTS')}
                      className={`py-2 rounded-lg transition-all text-center relative ${
                        activeTab === 'REQUESTS'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      History
                      {myRequests.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 bg-blue-600 text-white text-[9px] rounded-full">
                          {myRequests.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* VIEW 1: LIVE PARKING GRID TAB */}
                  {activeTab === 'DASHBOARD' && (
                    <div className="space-y-3">
                      {/* Basement Filter */}
                      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
                        {['ALL', 'B1', 'B2', 'B3', 'Ground'].map((b) => (
                          <button
                            key={b}
                            onClick={() => setSelectedBasement(b)}
                            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all border ${
                              selectedBasement === b
                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {b === 'ALL' ? 'All Floors' : b}
                          </button>
                        ))}
                      </div>

                      {/* Slots Matrix Display */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span>
                            Parking Matrix ({filteredSlots.length} Slots)
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            Auto-Sync 3.5s
                          </span>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                          <input
                            type="text"
                            value={slotSearch}
                            onChange={(e) => setSlotSearch(e.target.value)}
                            placeholder="Search slot (e.g. B1-P01, KA-01)..."
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none"
                          />
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>

                        {/* Slot Grid Pills */}
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto p-1">
                          {filteredSlots.slice(0, 40).map((slot) => {
                            const isVacant = slot.status === 'VACANT';
                            const isEv = slot.slotType === 'EV';

                            return (
                              <div
                                key={slot.id}
                                className={`p-2 rounded-xl border text-center font-mono text-[10px] space-y-0.5 transition-all ${
                                  isVacant
                                    ? isEv
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
                                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                    : 'bg-slate-800 text-white border-slate-700'
                                }`}
                              >
                                <div className="font-black flex items-center justify-center space-x-1">
                                  {isEv && <Zap className="w-3 h-3 text-cyan-400 shrink-0" />}
                                  <span>{slot.slotNumber ? (slot.slotNumber.split('-').pop() || slot.slotNumber) : (slot.id || 'SLOT')}</span>
                                </div>
                                <div className="text-[8px] opacity-80 truncate">
                                  {isVacant ? 'FREE' : slot.currentVehicle || 'OCCUPIED'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VIEW 2: MY VEHICLE & SMART PASS TAB */}
                  {activeTab === 'MY_VEHICLE' && (
                    <div className="space-y-3">
                      {myVehicle ? (
                        <div className="space-y-3">
                          {/* Digital Fast-Pass Hologram Card */}
                          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 shadow-xl border border-indigo-500/30 relative overflow-hidden space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                                <span className="text-xs font-black tracking-wider uppercase text-indigo-300">
                                  ParkOrbit ANPR Smart Pass
                                </span>
                              </div>
                              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold rounded-full">
                                ACTIVE
                              </span>
                            </div>

                            {/* License Plate Display */}
                            <div className="bg-black/50 border border-white/10 rounded-2xl p-3 text-center space-y-1">
                              <div className="text-[10px] text-slate-400 uppercase font-mono tracking-widest">
                                Registered License Plate
                              </div>
                              <div className="font-mono text-xl font-black text-white tracking-widest">
                                {myVehicle.vehicleNumber}
                              </div>
                              <div className="text-[11px] text-indigo-300 font-bold">
                                {myVehicle.vehicleBrand || 'Personal'} ({myVehicle.vehicleType})
                              </div>
                            </div>

                            {/* Pass Specs & Details */}
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                                <span className="block text-[9px] text-slate-400">Employee ID:</span>
                                <span className="font-bold text-white">{authEmployee.employeeId}</span>
                              </div>
                              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                                <span className="block text-[9px] text-slate-400">Corporate Domain:</span>
                                <span className="font-bold text-white">@{authEmployee.domain}</span>
                              </div>
                              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                                <span className="block text-[9px] text-slate-400">Gate Pass Mode:</span>
                                <span className="font-bold text-emerald-400">ANPR Auto-Lift</span>
                              </div>
                              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                                <span className="block text-[9px] text-slate-400">EV Stacker Access:</span>
                                <span className="font-bold text-cyan-400">
                                  {myVehicle.vehicleType === 'EV' ? 'Yes (Full Power)' : 'Standard Bay'}
                                </span>
                              </div>
                            </div>

                            {/* Update Vehicle Action Button */}
                            <button
                              onClick={openUpdateVehicleModal}
                              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span>Update Vehicle Details</span>
                            </button>
                          </div>

                          {/* Vehicle Update History / Audit Trail */}
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <History className="w-4 h-4 text-slate-700" />
                                <h4 className="text-xs font-bold text-slate-900">Vehicle Update Log</h4>
                              </div>
                              <span className="text-[10px] text-slate-400">Auto-Synced</span>
                            </div>

                            <div className="space-y-2">
                              {vehicleUpdateHistory.map((log) => (
                                <div
                                  key={log.id}
                                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                                      <span className="line-through text-slate-400 text-[11px]">{log.previousPlate}</span>
                                      <ArrowRight className="w-3 h-3 text-blue-600" />
                                      <span className="text-blue-700 font-black">{log.newPlate}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">{log.timestamp}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {log.vehicleType} • {log.vehicleBrand} • Reason: {log.reason}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                          <Car className="w-10 h-10 text-slate-300 mx-auto" />
                          <div className="text-xs font-bold text-slate-700">No Vehicle Linked to Profile</div>
                          <button
                            onClick={openUpdateVehicleModal}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow"
                          >
                            Add / Update Vehicle
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VIEW 3: UPDATE / REGISTER VEHICLE TAB */}
                  {activeTab === 'REGISTER' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
                      {/* Segmented Mode Selector */}
                      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setRegMode('UPDATE_VEHICLE')}
                          className={`py-2 rounded-lg transition-all ${
                            regMode === 'UPDATE_VEHICLE'
                              ? 'bg-white text-blue-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Update Whitelisted Vehicle
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegMode('NEW_REQUEST')}
                          className={`py-2 rounded-lg transition-all ${
                            regMode === 'NEW_REQUEST'
                              ? 'bg-white text-blue-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          New Approval Request
                        </button>
                      </div>

                      {regMode === 'UPDATE_VEHICLE' ? (
                        /* Direct Vehicle Update Form */
                        <form onSubmit={handleUpdateVehicle} className="space-y-3 text-xs">
                          <div className="border-b border-slate-100 pb-2">
                            <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Update Vehicle for ANPR Gate Access</span>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Directly updates your registered vehicle plate number and updates ANPR fast passes.
                            </p>
                          </div>

                          {/* Current vs New Plate Preview */}
                          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1 text-[11px]">
                            <div className="text-slate-600 font-bold">Current Registered Plate:</div>
                            <div className="font-mono font-black text-blue-800 text-sm">
                              {myVehicle?.vehicleNumber || 'None'} ({myVehicle?.vehicleType || 'SEDAN'})
                            </div>
                          </div>

                          {/* New Vehicle License Plate */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">
                              New License Plate Number *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. KA-05-MM-4422"
                              value={updateVehicleForm.vehicleNumber}
                              onChange={(e) =>
                                setUpdateVehicleForm({
                                  ...updateVehicleForm,
                                  vehicleNumber: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          {/* Vehicle Type */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Vehicle Type *</label>
                            <select
                              value={updateVehicleForm.vehicleType}
                              onChange={(e) =>
                                setUpdateVehicleForm({
                                  ...updateVehicleForm,
                                  vehicleType: e.target.value as VehicleType,
                                })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="SEDAN">Sedan</option>
                              <option value="SUV">SUV</option>
                              <option value="CSUV">Compact SUV</option>
                              <option value="HATCHBACK">Hatchback</option>
                              <option value="TWO_WHEELER">Two-Wheeler / Bike</option>
                              <option value="EV">Electric Vehicle (EV)</option>
                            </select>
                          </div>

                          {/* Vehicle Brand & Model */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Brand & Model</label>
                            <input
                              type="text"
                              placeholder="e.g. Tata Nexon EV / Tesla Model 3 / Honda City"
                              value={updateVehicleForm.vehicleBrand}
                              onChange={(e) =>
                                setUpdateVehicleForm({
                                  ...updateVehicleForm,
                                  vehicleBrand: e.target.value,
                                })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          {/* Update Reason */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Reason for Update</label>
                            <select
                              value={updateVehicleForm.reason}
                              onChange={(e) =>
                                setUpdateVehicleForm({
                                  ...updateVehicleForm,
                                  reason: e.target.value,
                                })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="Upgraded to New Car / EV">Upgraded to New Car / EV</option>
                              <option value="Temporary Replacement / Loaner">Temporary Replacement / Loaner</option>
                              <option value="License Plate Re-registration">License Plate Re-registration</option>
                              <option value="Corporate Fleet Swap">Corporate Fleet Swap</option>
                              <option value="Corrected Plate Typos">Corrected Plate Typos</option>
                            </select>
                          </div>

                          {updateVehicleMsg && (
                            <div
                              className={`p-3 rounded-xl text-xs font-bold ${
                                updateVehicleMsg.type === 'success'
                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                  : 'bg-rose-50 border border-rose-200 text-rose-800'
                              }`}
                            >
                              {updateVehicleMsg.text}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={isUpdatingVehicle}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>{isUpdatingVehicle ? 'Saving & Syncing...' : 'Save & Update Vehicle'}</span>
                          </button>
                        </form>
                      ) : (
                        /* New Request Form */
                        <form onSubmit={handleSubmitRegistration} className="space-y-3 text-xs">
                          <div className="border-b border-slate-100 pb-2">
                            <h4 className="text-xs font-bold text-slate-900">Raise Vehicle Registration Request</h4>
                            <p className="text-[11px] text-slate-500">
                              Submit vehicle details to be passed through the central corporate approval queue.
                            </p>
                          </div>

                          {/* Auto-filled details */}
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-slate-600">
                              <span>Employee ID:</span>
                              <span className="font-bold text-slate-900">{authEmployee.employeeId}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Email:</span>
                              <span className="font-bold text-slate-900">{authEmployee.email}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Department:</span>
                              <span className="font-bold text-slate-900">{authEmployee.department}</span>
                            </div>
                          </div>

                          {/* Vehicle License Plate Number */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">
                              Vehicle License Plate Number *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. KA-01-EX-9900"
                              value={regForm.vehicleNumber}
                              onChange={(e) =>
                                setRegForm({ ...regForm, vehicleNumber: e.target.value })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          {/* Vehicle Type */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Vehicle Type *</label>
                            <select
                              value={regForm.vehicleType}
                              onChange={(e) =>
                                setRegForm({ ...regForm, vehicleType: e.target.value as VehicleType })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="SEDAN">Sedan</option>
                              <option value="SUV">SUV</option>
                              <option value="CSUV">Compact SUV</option>
                              <option value="HATCHBACK">Hatchback</option>
                              <option value="TWO_WHEELER">Two-Wheeler / Bike</option>
                              <option value="EV">Electric Vehicle (EV)</option>
                            </select>
                          </div>

                          {/* Vehicle Brand & Model */}
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Brand & Model</label>
                            <input
                              type="text"
                              placeholder="e.g. Honda City / Tata Nexon EV"
                              value={regForm.vehicleBrand}
                              onChange={(e) =>
                                setRegForm({ ...regForm, vehicleBrand: e.target.value })
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          {formMsg && (
                            <div
                              className={`p-3 rounded-xl text-xs font-bold ${
                                formMsg.type === 'success'
                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                  : 'bg-rose-50 border border-rose-200 text-rose-800'
                              }`}
                            >
                              {formMsg.text}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={submittingReg}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 flex items-center justify-center space-x-2 transition-all"
                          >
                            <Send className="w-4 h-4" />
                            <span>{submittingReg ? 'Submitting...' : 'Submit Vehicle Request'}</span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* VIEW 4: MY REQUESTS & APPROVAL STATUS TAB */}
                  {activeTab === 'REQUESTS' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>Submitted Registration Requests</span>
                        <button
                          onClick={fetchMyRequests}
                          className="text-[11px] text-blue-600 hover:underline flex items-center space-x-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Refresh Status</span>
                        </button>
                      </div>

                      {reqLoading ? (
                        <div className="p-8 text-center text-xs text-slate-400 font-mono">
                          Loading status from Approval Queue...
                        </div>
                      ) : myRequests.length === 0 ? (
                        <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
                          <Car className="w-8 h-8 text-slate-300 mx-auto" />
                          <p className="text-xs font-bold text-slate-600">No pending vehicle requests</p>
                          <button
                            onClick={() => setActiveTab('REGISTER')}
                            className="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold"
                          >
                            Update or Add Vehicle
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {myRequests.map((req) => {
                            const isPending = req.status === 'PENDING';
                            const isApproved = req.status === 'APPROVED';
                            const isRejected = req.status === 'REJECTED';

                            return (
                              <div
                                key={req.id}
                                className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-mono font-black text-blue-700">
                                    {req.vehicleNumber}
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isApproved
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : isRejected
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800 animate-pulse'
                                    }`}
                                  >
                                    {req.status}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
                                  <div>
                                    Type: <span className="font-bold text-slate-800">{req.vehicleType}</span> ({req.vehicleBrand})
                                  </div>
                                  <div>
                                    Submitted:{' '}
                                    <span className="text-slate-500">
                                      {new Date(req.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  {isApproved && (
                                    <div className="text-emerald-700 font-bold flex items-center space-x-1 pt-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Whitelisted & ANPR Gate Pass Active</span>
                                    </div>
                                  )}
                                  {isRejected && (
                                    <div className="text-rose-700 font-bold pt-1">
                                      Reason: {req.rejectionReason || 'Domain criteria unmet'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Smartphone Bottom Home Indicator Bar */}
            <div className="bg-slate-900 py-2 flex items-center justify-center shrink-0">
              <div className="w-28 h-1 bg-slate-600 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* DEDICATED UPDATE VEHICLE MODAL / POPUP OVERLAY */}
      {showUpdateVehicleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Update Registered Vehicle</h3>
                  <p className="text-[10px] text-slate-500">Fast ANPR Whitelist Synchronization</p>
                </div>
              </div>
              <button
                onClick={() => setShowUpdateVehicleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateVehicle} className="space-y-3 text-xs">
              {/* License Plate Input with Instant Badge Visualizer */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  License Plate Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KA-01-EX-8092"
                  value={updateVehicleForm.vehicleNumber}
                  onChange={(e) =>
                    setUpdateVehicleForm({
                      ...updateVehicleForm,
                      vehicleNumber: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-black text-sm tracking-wider uppercase text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Classification *</label>
                <select
                  value={updateVehicleForm.vehicleType}
                  onChange={(e) =>
                    setUpdateVehicleForm({
                      ...updateVehicleForm,
                      vehicleType: e.target.value as VehicleType,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="SEDAN">Sedan</option>
                  <option value="SUV">SUV (High Clearance)</option>
                  <option value="CSUV">Compact SUV</option>
                  <option value="HATCHBACK">Hatchback</option>
                  <option value="TWO_WHEELER">Two-Wheeler / Bike</option>
                  <option value="EV">Electric Vehicle (EV Stacker Enabled)</option>
                </select>
              </div>

              {/* Vehicle Brand & Model */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Brand & Model</label>
                <input
                  type="text"
                  placeholder="e.g. Honda City ZX / Tata Nexon EV / Tesla Model 3"
                  value={updateVehicleForm.vehicleBrand}
                  onChange={(e) =>
                    setUpdateVehicleForm({
                      ...updateVehicleForm,
                      vehicleBrand: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Reason for Update */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Update</label>
                <select
                  value={updateVehicleForm.reason}
                  onChange={(e) =>
                    setUpdateVehicleForm({
                      ...updateVehicleForm,
                      reason: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Upgraded to New Car / EV">Upgraded to New Car / EV</option>
                  <option value="Temporary Replacement / Loaner">Temporary Replacement / Loaner</option>
                  <option value="License Plate Renewal">License Plate Renewal</option>
                  <option value="Company Lease Swap">Company Lease Swap</option>
                  <option value="Corrected Plate Typos">Corrected Plate Typos</option>
                </select>
              </div>

              {updateVehicleMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    updateVehicleMsg.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {updateVehicleMsg.text}
                </div>
              )}

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUpdateVehicleModal(false)}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingVehicle}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-600/20 flex items-center justify-center space-x-1.5 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>{isUpdatingVehicle ? 'Updating...' : 'Save & Sync'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
