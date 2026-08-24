import React, { useState, useEffect } from 'react';
import { ValetTicket, VehicleType, ValetTicketType, ValetStatus } from '../types';
import {
  KeyRound,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  ShieldAlert,
  Send,
  Zap,
  DollarSign,
  QrCode,
  Sparkles,
  MapPin,
  ChevronRight,
  ArrowRight,
  Sliders,
  Check,
  X,
  Smartphone
} from 'lucide-react';

export const ValetXModule: React.FC = () => {
  const [tickets, setTickets] = useState<ValetTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'BOARD' | 'CHECKIN' | 'GUEST_PORTAL' | 'LOCKER'>('BOARD');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Checkin Form State
  const [checkinForm, setCheckinForm] = useState({
    vehicleNumber: '',
    vehicleType: 'SEDAN' as VehicleType,
    vehicleBrand: '',
    guestName: '',
    guestPhone: '',
    keyTagNumber: `K-${Math.floor(100 + Math.random() * 899)}`,
    ticketType: 'VIP_EXECUTIVE' as ValetTicketType,
    assignedValetDriver: 'Suresh Kumar',
    assignedSlotNumber: 'B1-VIP-02',
    parkingNotes: 'VIP Executive Valet Check-In',
    feeAmount: 200,
  });

  // Guest Retrieval Portal Simulator State
  const [guestSearchQuery, setGuestSearchQuery] = useState<string>('');
  const [retrievedTicket, setRetrievedTicket] = useState<ValetTicket | null>(null);
  const [portalMessage, setPortalMessage] = useState<string>('');

  // Modal States
  const [showStatusModal, setShowStatusModal] = useState<ValetTicket | null>(null);
  const [statusNote, setStatusNote] = useState<string>('');
  const [tipInput, setTipInput] = useState<number>(50);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchValetTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/valet/tickets');
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch ValetX tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValetTickets();
  }, []);

  // Handle New Check-In
  const handleCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/valet/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkinForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setCheckinForm({
          vehicleNumber: '',
          vehicleType: 'SEDAN',
          vehicleBrand: '',
          guestName: '',
          guestPhone: '',
          keyTagNumber: `K-${Math.floor(100 + Math.random() * 899)}`,
          ticketType: 'VIP_EXECUTIVE',
          assignedValetDriver: 'Suresh Kumar',
          assignedSlotNumber: 'B1-VIP-02',
          parkingNotes: 'VIP Executive Valet Check-In',
          feeAmount: 200,
        });
        fetchValetTickets();
        setActiveTab('BOARD');
      } else {
        showToast('error', data.message || 'Check-in failed.');
      }
    } catch (err) {
      console.error('Checkin submit error:', err);
      showToast('error', 'Checkin submission failed.');
    }
  };

  // Handle Status Update
  const handleStatusUpdate = async (ticketId: string, newStatus: ValetStatus) => {
    try {
      const res = await fetch('/api/v1/valet/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          status: newStatus,
          tipAmount: tipInput,
          notes: statusNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message || 'Ticket updated.');
        setShowStatusModal(null);
        fetchValetTickets();
      } else {
        showToast('error', data.message || 'Failed to update ticket status.');
      }
    } catch (err) {
      console.error('Update status error:', err);
      showToast('error', 'Update status request failed.');
    }
  };

  // Handle Guest Self-Service Retrieval Request
  const handleGuestRetrievalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestSearchQuery) return;
    try {
      const res = await fetch('/api/v1/valet/request-retrieval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: guestSearchQuery }),
      });
      const data = await res.json();
      if (data.success && data.ticket) {
        setRetrievedTicket(data.ticket);
        setPortalMessage(data.message);
        fetchValetTickets();
      } else {
        setRetrievedTicket(null);
        setPortalMessage(data.message || 'No active valet ticket found.');
      }
    } catch (err) {
      console.error('Guest retrieval error:', err);
      setPortalMessage('Error connecting to ValetX server.');
    }
  };

  // Filtered Tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesQuery =
      t.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.keyTagNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.guestPhone.includes(searchQuery);

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || t.ticketType === typeFilter;

    return matchesQuery && matchesStatus && matchesType;
  });

  // Metrics
  const parkedCount = tickets.filter((t) => t.status === 'PARKED').length;
  const requestedCount = tickets.filter((t) => t.status === 'RETRIEVAL_REQUESTED').length;
  const deliveredCount = tickets.filter((t) => t.status === 'RETRIEVED_DELIVERED').length;
  const totalRevenue = tickets.reduce((acc, t) => acc + (t.feeAmount || 0) + (t.tipAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner - ValetX Branding */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 font-mono text-xs font-bold border border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                VALETX ENTERPRISE SUITE
              </span>
              <span className="text-slate-400 text-xs font-mono">ParkOrbit v4.8</span>
            </div>
            <h2 className="text-2xl font-black font-sans tracking-tight flex items-center gap-2">
              ValetX <span className="text-slate-400 font-light">|</span> Intelligent Valet Dispatch & Key Locker
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Automated key tag tracking, valet runner dispatching, guest 1-click SMS vehicle retrieval, and VIP executive drop-off spatial allocation.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchValetTickets}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700 text-xs font-semibold flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Board</span>
            </button>

            <button
              onClick={() => setActiveTab('CHECKIN')}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Valet Check-In</span>
            </button>
          </div>
        </div>

        {/* Valet Metrics Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Currently Parked</span>
            <span className="text-xl font-black text-white">{parkedCount} Vehicles</span>
          </div>

          <div className="bg-amber-950/50 border border-amber-800/60 rounded-xl p-3 relative overflow-hidden">
            {requestedCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            )}
            <span className="text-amber-400 text-[10px] block uppercase font-bold">Retrieval Requests</span>
            <span className="text-xl font-black text-amber-400">{requestedCount} Hot Queue</span>
          </div>

          <div className="bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-3">
            <span className="text-emerald-400 text-[10px] block uppercase font-bold">Delivered / Completed</span>
            <span className="text-xl font-black text-emerald-400">{deliveredCount} Guests</span>
          </div>

          <div className="bg-purple-950/50 border border-purple-800/60 rounded-xl p-3">
            <span className="text-purple-400 text-[10px] block uppercase font-bold">Valet Revenue & Tips</span>
            <span className="text-xl font-black text-purple-400">₹{totalRevenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200 font-sans text-xs font-bold gap-6">
        <button
          onClick={() => setActiveTab('BOARD')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'BOARD'
              ? 'border-purple-600 text-purple-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Active Valet Dispatch Board ({tickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('CHECKIN')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'CHECKIN'
              ? 'border-purple-600 text-purple-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>New Valet Check-In</span>
        </button>

        <button
          onClick={() => setActiveTab('GUEST_PORTAL')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'GUEST_PORTAL'
              ? 'border-purple-600 text-purple-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Smartphone className="w-4 h-4 text-purple-600" />
          <span>Guest 1-Click Retrieval Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab('LOCKER')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'LOCKER'
              ? 'border-purple-600 text-purple-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Key Tag Locker & Valet Drivers</span>
        </button>
      </div>

      {/* TAB 1: DISPATCH BOARD */}
      {activeTab === 'BOARD' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ticket #, key tag, vehicle number, guest name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600"
              />
            </div>

            <div className="flex items-center space-x-3 text-xs font-semibold text-slate-700">
              <div className="flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-600 bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PARKED">Parked</option>
                  <option value="RETRIEVAL_REQUESTED">Retrieval Requested</option>
                  <option value="RETRIEVED_DELIVERED">Delivered</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span>Tier:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-600 bg-white"
                >
                  <option value="ALL">All Tiers</option>
                  <option value="VIP_EXECUTIVE">VIP Executive</option>
                  <option value="HOTEL_GUEST">Hotel Guest</option>
                  <option value="MALL_VISITOR">Mall Visitor</option>
                  <option value="STANDARD">Standard</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tickets Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm space-y-3 relative transition-all ${
                  ticket.status === 'RETRIEVAL_REQUESTED'
                    ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/30'
                    : ticket.status === 'PARKED'
                    ? 'border-slate-200 hover:border-slate-300'
                    : 'border-emerald-200 bg-emerald-50/20'
                }`}
              >
                {/* Header: Key Tag & Ticket # */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 bg-purple-900 text-white font-mono text-xs font-black rounded-lg flex items-center gap-1 shadow-sm">
                      <KeyRound className="w-3.5 h-3.5 text-purple-300" />
                      {ticket.keyTagNumber}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-600">{ticket.ticketNumber}</span>
                  </div>

                  <span
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                      ticket.status === 'RETRIEVAL_REQUESTED'
                        ? 'bg-amber-100 text-amber-900 animate-pulse border border-amber-300'
                        : ticket.status === 'PARKED'
                        ? 'bg-purple-100 text-purple-900'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {ticket.status === 'RETRIEVAL_REQUESTED'
                      ? 'RETRIEVAL REQUESTED!'
                      : ticket.status === 'PARKED'
                      ? 'PARKED IN BAY'
                      : 'DELIVERED'}
                  </span>
                </div>

                {/* Vehicle & Guest Info */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-black text-slate-900 font-mono tracking-tight">
                      {ticket.vehicleNumber}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold font-mono rounded">
                      {ticket.vehicleType} {ticket.vehicleBrand ? `• ${ticket.vehicleBrand}` : ''}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{ticket.guestName}</span>
                    <span className="text-slate-400">({ticket.guestPhone})</span>
                  </p>
                </div>

                {/* Valet Driver & Slot Allocation */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Assigned Slot</span>
                    <span className="font-bold text-purple-900 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-purple-600" />
                      {ticket.assignedSlotNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Valet Runner</span>
                    <span className="font-bold text-slate-800">{ticket.assignedValetDriver}</span>
                  </div>
                </div>

                {/* Ticket Notes & Timestamps */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 font-sans">
                  <span className="truncate max-w-[180px]" title={ticket.parkingNotes}>
                    {ticket.parkingNotes}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Received: {new Date(ticket.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Actions Bar */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {ticket.status === 'PARKED' && (
                    <button
                      onClick={() => handleStatusUpdate(ticket.id, 'RETRIEVAL_REQUESTED')}
                      className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <BellRingIcon className="w-3.5 h-3.5" />
                      <span>Request Vehicle Retrieval</span>
                    </button>
                  )}

                  {ticket.status === 'RETRIEVAL_REQUESTED' && (
                    <button
                      onClick={() => {
                        setShowStatusModal(ticket);
                        setStatusNote('Keys delivered to guest at Gate Drop-Off point.');
                      }}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-colors flex items-center justify-center space-x-1.5 animate-bounce"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Vehicle Delivered to Guest</span>
                    </button>
                  )}

                  {ticket.status === 'RETRIEVED_DELIVERED' && (
                    <div className="w-full text-center text-xs font-mono font-bold text-emerald-700 bg-emerald-50 py-1 rounded-lg border border-emerald-200 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Handover Complete (Fee: ₹{ticket.feeAmount || 150})</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: CHECKIN FORM */}
      {activeTab === 'CHECKIN' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="border-b border-slate-200 pb-3 flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-purple-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">ValetX Rapid Guest Check-In & Key Tagging</h3>
              <p className="text-xs text-slate-500">Issue new valet ticket, generate digital SMS link, and dispatch runner.</p>
            </div>
          </div>

          <form onSubmit={handleCheckinSubmit} className="space-y-4 text-xs font-sans">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Vehicle Plate Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KA-01-AB-1234"
                  value={checkinForm.vehicleNumber}
                  onChange={(e) => setCheckinForm({ ...checkinForm, vehicleNumber: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-sm focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Vehicle Category *</label>
                <select
                  value={checkinForm.vehicleType}
                  onChange={(e) => setCheckinForm({ ...checkinForm, vehicleType: e.target.value as VehicleType })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-purple-600 bg-white"
                >
                  <option value="SEDAN">Sedan (Luxury / Standard)</option>
                  <option value="SUV">SUV (Full Size)</option>
                  <option value="CSUV">CSUV (Compact SUV)</option>
                  <option value="HATCHBACK">Hatchback</option>
                  <option value="EV">EV Electric Vehicle</option>
                  <option value="TWO_WHEELER">Two-Wheeler</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Make / Model Brand</label>
                <input
                  type="text"
                  placeholder="e.g. BMW 5-Series / Hyundai Creta"
                  value={checkinForm.vehicleBrand}
                  onChange={(e) => setCheckinForm({ ...checkinForm, vehicleBrand: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Key Tag Locker Identifier *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. K-104"
                  value={checkinForm.keyTagNumber}
                  onChange={(e) => setCheckinForm({ ...checkinForm, keyTagNumber: e.target.value.toUpperCase() })}
                  className="w-full border border-purple-300 bg-purple-50/50 rounded-xl px-3 py-2 font-mono font-black text-purple-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Guest Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Guest Full Name"
                  value={checkinForm.guestName}
                  onChange={(e) => setCheckinForm({ ...checkinForm, guestName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Guest Mobile Number (SMS Token) *</label>
                <input
                  type="text"
                  required
                  placeholder="+91 98000 00000"
                  value={checkinForm.guestPhone}
                  onChange={(e) => setCheckinForm({ ...checkinForm, guestPhone: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Valet Service Tier *</label>
                <select
                  value={checkinForm.ticketType}
                  onChange={(e) => setCheckinForm({ ...checkinForm, ticketType: e.target.value as ValetTicketType })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-purple-600 bg-white"
                >
                  <option value="VIP_EXECUTIVE">VIP Executive Drop-off (₹200)</option>
                  <option value="HOTEL_GUEST">Hotel Resident Guest (₹250)</option>
                  <option value="MALL_VISITOR">Mall Visitor Valet (₹150)</option>
                  <option value="STANDARD">Standard Valet (₹100)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Assigned Valet Runner *</label>
                <select
                  value={checkinForm.assignedValetDriver}
                  onChange={(e) => setCheckinForm({ ...checkinForm, assignedValetDriver: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-purple-600 bg-white"
                >
                  <option value="Suresh Kumar">Suresh Kumar (Bay 1 Lead)</option>
                  <option value="Ramesh Gowda">Ramesh Gowda (Stacker Runner)</option>
                  <option value="Mahesh Patil">Mahesh Patil (VIP Gate)</option>
                  <option value="Vikram Singh">Vikram Singh (Basement Runner)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Special Valet Notes</label>
              <input
                type="text"
                placeholder="e.g. Key tag placed in Locker Slot 04. Vehicle clean."
                value={checkinForm.parkingNotes}
                onChange={(e) => setCheckinForm({ ...checkinForm, parkingNotes: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-purple-600"
              />
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setActiveTab('BOARD')}
                className="px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>Issue ValetX Ticket & Send Guest SMS</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: GUEST RETRIEVAL PORTAL SIMULATOR */}
      {activeTab === 'GUEST_PORTAL' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white max-w-2xl mx-auto space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Smartphone className="w-48 h-48 text-purple-400" />
          </div>

          <div className="text-center space-y-1 relative z-10">
            <span className="px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold border border-purple-500/30">
              GUEST MOBILE WEB SIMULATOR
            </span>
            <h3 className="text-xl font-black font-sans">ValetX Guest 1-Click Vehicle Retrieval</h3>
            <p className="text-slate-400 text-xs">
              Simulate the mobile web screen that guests see when clicking their SMS token link.
            </p>
          </div>

          {/* Retrieval Search Form */}
          <form onSubmit={handleGuestRetrievalRequest} className="space-y-3 relative z-10">
            <div>
              <label className="block text-slate-300 text-xs font-bold mb-1">
                Enter Ticket #, Key Tag, or Mobile Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. VX-1001 or K-101 or 9845011223"
                  value={guestSearchQuery}
                  onChange={(e) => setGuestSearchQuery(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-colors"
                >
                  Request Vehicle
                </button>
              </div>
            </div>
          </form>

          {portalMessage && (
            <div className="p-3 bg-purple-950/60 border border-purple-800 rounded-xl text-xs font-mono text-purple-200">
              {portalMessage}
            </div>
          )}

          {/* Live Progress Bar for Guest */}
          {retrievedTicket && (
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4 font-mono text-xs relative z-10">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Vehicle</span>
                  <span className="text-base font-black text-white">{retrievedTicket.vehicleNumber}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Key Tag Locker</span>
                  <span className="text-base font-black text-purple-400">{retrievedTicket.keyTagNumber}</span>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/40">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">1. Retrieval Ping Sent</span>
                    <span className="text-[10px] text-slate-400 font-sans">Valet runner notified at central console.</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border ${
                      retrievedTicket.status === 'RETRIEVAL_REQUESTED'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}
                  >
                    2
                  </div>
                  <div>
                    <span className="font-bold text-white block">2. Fetching Key & Stacker Unlocking</span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      Runner {retrievedTicket.assignedValetDriver} dispatched to slot {retrievedTicket.assignedSlotNumber}.
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border ${
                      retrievedTicket.status === 'RETRIEVED_DELIVERED'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    3
                  </div>
                  <div>
                    <span className="font-bold text-white block">3. Vehicle Arriving at Gate Drop-Off</span>
                    <span className="text-[10px] text-slate-400 font-sans">Estimated arrival: 2 mins at Bay 1.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: KEY LOCKER & DRIVERS */}
      {activeTab === 'LOCKER' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Key Locker Grid */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-sans">Key Tag Locker Grid (Tags 101 - 120)</h3>
              <p className="text-xs text-slate-500">Real-time key locker slot occupancy.</p>
            </div>

            <div className="grid grid-cols-5 gap-2.5 font-mono text-xs">
              {Array.from({ length: 20 }, (_, i) => {
                const tagNum = `K-${101 + i}`;
                const matchedTicket = tickets.find((t) => t.keyTagNumber === tagNum && t.status !== 'RETRIEVED_DELIVERED');

                return (
                  <div
                    key={tagNum}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      matchedTicket
                        ? 'bg-purple-900 border-purple-950 text-white shadow-md'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <span className="block font-black text-xs">{tagNum}</span>
                    <span className="text-[9px] block uppercase tracking-wider font-sans mt-0.5">
                      {matchedTicket ? matchedTicket.vehicleNumber.slice(-4) : 'VACANT'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Valet Drivers Roster */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-sans">Valet Runners Roster</h3>
              <p className="text-xs text-slate-500">Active dispatch team & performance metrics.</p>
            </div>

            <div className="space-y-3 font-sans text-xs">
              {[
                { name: 'Suresh Kumar', role: 'Bay 1 Lead Runner', tasks: 14, rating: '4.9 ★', status: 'ON_TASK' },
                { name: 'Ramesh Gowda', role: 'Puzzle Stacker Specialist', tasks: 18, rating: '4.8 ★', status: 'ON_TASK' },
                { name: 'Mahesh Patil', role: 'VIP Gate Attendant', tasks: 11, rating: '5.0 ★', status: 'STANDBY' },
                { name: 'Vikram Singh', role: 'Basement Level 2 Runner', tasks: 9, rating: '4.7 ★', status: 'ON_TASK' },
              ].map((driver, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-xs border border-purple-200">
                      {driver.name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">{driver.name}</span>
                      <span className="text-[11px] text-slate-500 block">{driver.role}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs">
                    <span className="font-bold text-purple-900 block">{driver.tasks} Trips Today</span>
                    <span className="text-slate-500 text-[10px] block">{driver.rating} rating</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DELIVERED STATUS MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Confirm Handover to Guest</h3>
            </div>
            <p className="text-xs text-slate-600">
              Handover vehicle <strong className="font-mono text-slate-900">{showStatusModal.vehicleNumber}</strong> (Key Tag {showStatusModal.keyTagNumber}) to guest {showStatusModal.guestName}.
            </p>

            <div className="space-y-3 font-sans text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Tip Amount Collected (₹)</label>
                <input
                  type="number"
                  value={tipInput}
                  onChange={(e) => setTipInput(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl p-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Handover Notes</label>
                <textarea
                  rows={2}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs"
                ></textarea>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowStatusModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusUpdate(showStatusModal.id, 'RETRIEVED_DELIVERED')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm"
              >
                Complete Handover & Return Key Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in max-w-md">
          <div className={`p-4 rounded-xl border shadow-xl flex items-center space-x-3 ${
            toastMsg.type === 'success' 
              ? 'bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/30' 
              : 'bg-rose-900 text-white border-rose-500/50 shadow-rose-950/30'
          }`}>
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="ml-auto text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function BellRingIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="M4 2C2.8 3.7 2 5.7 2 8" />
      <path d="M22 8c0-2.3-.8-4.3-2-6" />
    </svg>
  );
}
