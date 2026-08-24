import React, { useState, useEffect } from 'react';
import { SiteConfig, SitePricing, SiteInvoice, SiteStatus, SlotChangeNotification, WhitelistedDomain } from '../types';
import {
  Building2,
  Plus,
  Play,
  Pause,
  PowerOff,
  Trash2,
  DollarSign,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Send,
  Calendar,
  Layers,
  MapPin,
  Phone,
  Mail,
  Zap,
  ArrowRightLeft,
  Check,
  CreditCard,
  Sliders,
  Globe,
  Sparkles,
  Database,
  CloudCheck
} from 'lucide-react';

interface MasterConfigModuleProps {
  onRefresh?: () => void;
}

export const MasterConfigModule: React.FC<MasterConfigModuleProps> = ({ onRefresh }) => {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [invoices, setInvoices] = useState<SiteInvoice[]>([]);
  const [notifications, setNotifications] = useState<SlotChangeNotification[]>([]);
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);
  const [newDomain, setNewDomain] = useState<string>('');
  const [domainSearch, setDomainSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<'SITES' | 'WHITELISTED_DOMAINS' | 'INVOICES' | 'RELOCATION_LOGS'>('SITES');
  const [domainMsg, setDomainMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [siteToDelete, setSiteToDelete] = useState<SiteConfig | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Modal & Form States
  const [showOnboardModal, setShowOnboardModal] = useState<boolean>(false);
  const [showHoldModal, setShowHoldModal] = useState<SiteConfig | null>(null);
  const [holdReasonInput, setHoldReasonInput] = useState<string>('Scheduled Maintenance & Equipment Calibration');
  const [showPricingModal, setShowPricingModal] = useState<SiteConfig | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<SiteConfig | null>(null);

  // New Site Form Data
  const [onboardForm, setOnboardForm] = useState({
    siteName: '',
    siteCode: '',
    city: 'Bengaluru',
    address: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    totalSlots: 500,
    basementLevels: 2,
    hasPuzzleParking: true,
    hasEVCharging: true,
    hourlyRate: 50,
    dailyMaxRate: 400,
    monthlyPassRate: 3500,
    currency: 'INR',
    taxPercentage: 18,
  });

  // Edit Pricing Form Data
  const [pricingForm, setPricingForm] = useState<SitePricing>({
    hourlyRate: 50,
    dailyMaxRate: 400,
    monthlyPassRate: 3500,
    currency: 'INR',
    taxPercentage: 18,
  });

  // Raise Invoice Form Data
  const [invoiceForm, setInvoiceForm] = useState({
    billingPeriod: 'August 2026',
    baseAmount: 120000,
    notes: 'Monthly platform licensing, telemetry sync & ANPR stream software maintenance.',
  });

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const [sitesRes, invoicesRes, notifsRes, domainsRes] = await Promise.all([
        fetch('/api/v1/sites'),
        fetch('/api/v1/invoices'),
        fetch('/api/v1/slots/change-notifications'),
        fetch('/api/v1/domains'),
      ]);

      const sitesData = await sitesRes.json();
      const invoicesData = await invoicesRes.json();
      const notifsData = await notifsRes.json();
      const domainsData = await domainsRes.json();

      setSites(sitesData.sites || []);
      setInvoices(invoicesData.invoices || []);
      setNotifications(notifsData.notifications || []);
      setDomains(domainsData.domains || []);
    } catch (err) {
      console.error('Failed to fetch Master Configuration data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  const handleAddDomain = async (e?: React.FormEvent, customDomain?: string) => {
    if (e) e.preventDefault();
    const domToAdd = (customDomain || newDomain).trim().toLowerCase().replace(/^@/, '');
    if (!domToAdd) {
      setDomainMsg({ type: 'error', text: 'Please enter a valid corporate email domain (e.g., company.com).' });
      setTimeout(() => setDomainMsg(null), 4000);
      return;
    }

    try {
      const res = await fetch('/api/v1/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domToAdd, addedBy: 'Site Config Admin' }),
      });
      const data = await res.json();
      if (data.success) {
        setDomainMsg({ type: 'success', text: data.message || `Domain @${domToAdd} whitelisted successfully!` });
        setNewDomain('');
        fetchMasterData();
      } else {
        setDomainMsg({ type: 'error', text: data.message || 'Failed to add domain' });
      }
    } catch (err: any) {
      setDomainMsg({ type: 'error', text: err.message || 'Failed to add domain.' });
    }
    setTimeout(() => setDomainMsg(null), 4000);
  };

  const handleRemoveDomain = async (domainId: string) => {
    try {
      const res = await fetch('/api/v1/domains/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      if (data.success) {
        setDomainMsg({ type: 'success', text: data.message || 'Domain removed from whitelist' });
        fetchMasterData();
      } else {
        setDomainMsg({ type: 'error', text: data.message || 'Failed to remove domain' });
      }
    } catch (err: any) {
      setDomainMsg({ type: 'error', text: 'Failed to remove domain' });
    }
    setTimeout(() => setDomainMsg(null), 4000);
  };

  // Handler for Onboarding Site
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        siteName: onboardForm.siteName,
        siteCode: onboardForm.siteCode || `SITE-${Math.floor(100 + Math.random() * 900)}`,
        city: onboardForm.city,
        address: onboardForm.address,
        contactPerson: onboardForm.contactPerson,
        contactEmail: onboardForm.contactEmail,
        contactPhone: onboardForm.contactPhone,
        totalSlots: Number(onboardForm.totalSlots),
        basementLevels: Number(onboardForm.basementLevels),
        hasPuzzleParking: onboardForm.hasPuzzleParking,
        hasEVCharging: onboardForm.hasEVCharging,
        pricing: {
          hourlyRate: Number(onboardForm.hourlyRate),
          dailyMaxRate: Number(onboardForm.dailyMaxRate),
          monthlyPassRate: Number(onboardForm.monthlyPassRate),
          currency: onboardForm.currency,
          taxPercentage: Number(onboardForm.taxPercentage),
        },
      };

      const res = await fetch('/api/v1/sites/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowOnboardModal(false);
        setOnboardForm({
          siteName: '',
          siteCode: '',
          city: 'Bengaluru',
          address: '',
          contactPerson: '',
          contactEmail: '',
          contactPhone: '',
          totalSlots: 500,
          basementLevels: 2,
          hasPuzzleParking: true,
          hasEVCharging: true,
          hourlyRate: 50,
          dailyMaxRate: 400,
          monthlyPassRate: 3500,
          currency: 'INR',
          taxPercentage: 18,
        });
        fetchMasterData();
        if (onRefresh) onRefresh();
      } else {
        showToast('error', data.message || 'Failed to onboard site.');
      }
    } catch (err) {
      console.error('Error onboarding site:', err);
      showToast('error', 'Error connecting to server.');
    }
  };

  // Handler for Site Status Change (Hold, Resume, Deactivate)
  const handleSiteStatusChange = async (siteId: string, status: SiteStatus, holdReason?: string) => {
    try {
      const res = await fetch('/api/v1/sites/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, status, holdReason }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowHoldModal(null);
        fetchMasterData();
        if (onRefresh) onRefresh();
      } else {
        showToast('error', data.message || 'Status update failed.');
      }
    } catch (err) {
      console.error('Status change error:', err);
      showToast('error', 'Status update failed.');
    }
  };

  // Handler for Site Delete
  const handleDeleteSite = (site: SiteConfig) => {
    setSiteToDelete(site);
  };

  const confirmDeleteSite = async () => {
    if (!siteToDelete) return;
    const site = siteToDelete;
    try {
      const res = await fetch('/api/v1/sites/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setSiteToDelete(null);
        fetchMasterData();
        if (onRefresh) onRefresh();
      } else {
        showToast('error', data.message || 'Deletion failed.');
      }
    } catch (err) {
      console.error('Delete site error:', err);
      showToast('error', 'Deletion request failed.');
    }
  };

  // Handler for Updating Site Pricing
  const handlePricingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPricingModal) return;
    try {
      const res = await fetch('/api/v1/sites/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: showPricingModal.id,
          pricing: pricingForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowPricingModal(null);
        fetchMasterData();
        if (onRefresh) onRefresh();
      } else {
        showToast('error', data.message || 'Failed to update site pricing.');
      }
    } catch (err) {
      console.error('Pricing update error:', err);
      showToast('error', 'Failed to update site pricing.');
    }
  };

  // Handler for Raising Invoice
  const handleRaiseInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showInvoiceModal) return;
    try {
      const res = await fetch('/api/v1/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: showInvoiceModal.id,
          billingPeriod: invoiceForm.billingPeriod,
          baseAmount: Number(invoiceForm.baseAmount),
          notes: invoiceForm.notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowInvoiceModal(null);
        fetchMasterData();
      } else {
        showToast('error', data.message || 'Failed to generate invoice.');
      }
    } catch (err) {
      console.error('Invoice error:', err);
      showToast('error', 'Failed to generate invoice.');
    }
  };

  // Handler for Invoice Status Toggle
  const handleInvoiceStatusUpdate = async (invoiceId: string, status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED') => {
    try {
      const res = await fetch('/api/v1/invoices/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, status }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMasterData();
      }
    } catch (err) {
      console.error('Invoice status update error:', err);
    }
  };

  // Filtered Sites
  const filteredSites = sites.filter((s) => {
    const matchesSearch =
      s.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.siteCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const activeCount = sites.filter((s) => s.status === 'ACTIVE').length;
  const holdCount = sites.filter((s) => s.status === 'ON_HOLD').length;
  const deactivatedCount = sites.filter((s) => s.status === 'DEACTIVATED').length;
  const totalInvoicedRevenue = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs font-bold border border-blue-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                PLATFORM OWNER MASTER ACCESS
              </span>
              <span className="text-slate-400 text-xs font-mono">v4.8 Enterprise</span>
            </div>
            <h2 className="text-2xl font-black font-sans tracking-tight">
              Master Site Configuration & Multi-Tenancy Hub
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Centralized platform owner module to onboard new parking facilities, manage site operational states (Hold, Resume, Deactivate), configure site-level pricing structures, and raise platform SaaS invoices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchMasterData}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700 text-xs font-semibold flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Master</span>
            </button>

            <button
              onClick={() => setShowOnboardModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Onboard New Site</span>
            </button>
          </div>
        </div>

        {/* Master Metric Badges */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Total Sites</span>
            <span className="text-xl font-black text-white">{sites.length} Facilities</span>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3">
            <span className="text-emerald-400 text-[10px] block uppercase font-bold">Active Sites</span>
            <span className="text-xl font-black text-emerald-400">{activeCount} Operational</span>
          </div>

          <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3">
            <span className="text-amber-400 text-[10px] block uppercase font-bold">On Hold Service</span>
            <span className="text-xl font-black text-amber-400">{holdCount} Suspended</span>
          </div>

          <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3">
            <span className="text-rose-400 text-[10px] block uppercase font-bold">Deactivated</span>
            <span className="text-xl font-black text-rose-400">{deactivatedCount} Sites</span>
          </div>

          <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3 col-span-2 md:col-span-1">
            <span className="text-blue-400 text-[10px] block uppercase font-bold">Total Invoiced Revenue</span>
            <span className="text-xl font-black text-blue-400">₹{totalInvoicedRevenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200 font-sans text-xs font-bold gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('SITES')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap ${
            activeSubTab === 'SITES'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Site Directory & Configuration ({sites.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('WHITELISTED_DOMAINS')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap ${
            activeSubTab === 'WHITELISTED_DOMAINS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Corporate Domain Whitelist ({domains.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('INVOICES')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap ${
            activeSubTab === 'INVOICES'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>SaaS Invoices & Billing ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('RELOCATION_LOGS')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap ${
            activeSubTab === 'RELOCATION_LOGS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Attendant Relocation Audit Trail ({notifications.length})</span>
        </button>
      </div>

      {/* TAB 1: SITE DIRECTORY & CONFIGURATION */}
      {activeSubTab === 'SITES' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search site name, code, or city location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Status Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Sites Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSites.map((site) => (
              <div
                key={site.id}
                className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 relative transition-all ${
                  site.status === 'ACTIVE'
                    ? 'border-slate-200 hover:border-slate-300'
                    : site.status === 'ON_HOLD'
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-rose-300 bg-rose-50/20'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {site.siteCode}
                      </span>
                      <span
                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          site.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : site.status === 'ON_HOLD'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            site.status === 'ACTIVE'
                              ? 'bg-emerald-500'
                              : site.status === 'ON_HOLD'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        ></span>
                        {site.status === 'ACTIVE' ? 'ACTIVE & LIVE' : site.status === 'ON_HOLD' ? 'SERVICE ON HOLD' : 'DEACTIVATED'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1 font-sans">{site.siteName}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{site.address} ({site.city})</span>
                    </p>
                  </div>

                  {/* Actions Dropdown / Quick Buttons */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setShowPricingModal(site);
                        setPricingForm(site.pricing || { hourlyRate: 50, dailyMaxRate: 400, monthlyPassRate: 3500, currency: 'INR', taxPercentage: 18 });
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-200"
                      title="Edit Site Pricing Structure"
                    >
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pricing</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowInvoiceModal(site);
                        setInvoiceForm({
                          billingPeriod: 'August 2026',
                          baseAmount: 120000,
                          notes: 'Monthly platform software license & hardware telemetry sync fee.',
                        });
                      }}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-bold flex items-center gap-1 border border-blue-200"
                      title="Raise Invoice for Site"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>Raise Inv</span>
                    </button>
                  </div>
                </div>

                {/* Hold Reason Banner if On Hold */}
                {site.status === 'ON_HOLD' && site.holdReason && (
                  <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start space-x-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 block text-[11px]">Hold Reason:</span>
                      <span>{site.holdReason}</span>
                    </div>
                  </div>
                )}

                {/* Site Technical Details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Inventory</span>
                    <span className="font-bold text-slate-800">{site.totalSlots} Slots</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Levels</span>
                    <span className="font-bold text-slate-800">{site.basementLevels} Basements</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Puzzle Stacker</span>
                    <span className={`font-bold ${site.hasPuzzleParking ? 'text-blue-700' : 'text-slate-400'}`}>
                      {site.hasPuzzleParking ? 'Yes (P01-P20)' : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">EV Stations</span>
                    <span className={`font-bold ${site.hasEVCharging ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {site.hasEVCharging ? 'Active Hub' : 'None'}
                    </span>
                  </div>
                </div>

                {/* Pricing Structure Display */}
                <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">Hourly Tariff Rate</span>
                    <span className="font-bold text-emerald-950 text-sm">
                      ₹{site.pricing?.hourlyRate || 50} / hr
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">Daily Cap</span>
                    <span className="font-bold text-emerald-950">₹{site.pricing?.dailyMaxRate || 400}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">Monthly Pass</span>
                    <span className="font-bold text-emerald-950">₹{site.pricing?.monthlyPassRate || 3500}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">GST Tax</span>
                    <span className="font-bold text-emerald-950">{site.pricing?.taxPercentage || 18}%</span>
                  </div>
                </div>

                {/* Contact Person & Dates */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-sans">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-slate-700">{site.contactPerson}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{site.contactPhone}</span>
                  </div>
                  <span className="font-mono text-[10px]">
                    Onboarded: {new Date(site.onboardedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Action Controls Toolbar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {site.status === 'ACTIVE' ? (
                      <button
                        onClick={() => setShowHoldModal(site)}
                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Hold Service</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSiteStatusChange(site.id, 'ACTIVE')}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume Service</span>
                      </button>
                    )}

                    {site.status !== 'DEACTIVATED' ? (
                      <button
                        onClick={() => handleSiteStatusChange(site.id, 'DEACTIVATED')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <PowerOff className="w-3.5 h-3.5 text-slate-500" />
                        <span>Deactivate</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded">
                        Deactivated Facility
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteSite(site)}
                    className="p-1.5 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    title="Delete Site Permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CORPORATE EMAIL DOMAIN WHITELIST CONFIGURATION */}
      {activeSubTab === 'WHITELISTED_DOMAINS' && (
        <div className="space-y-5">
          {/* Domain Action Message */}
          {domainMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-bold font-mono flex items-center justify-between transition-all ${
                domainMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-center space-x-2">
                {domainMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{domainMsg.text}</span>
              </div>
              <button onClick={() => setDomainMsg(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Banner Info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-start space-x-3.5">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Authorized Corporate Email Domains
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-mono text-xs font-bold rounded-full">
                      {domains.length} Active Domains
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                    Configure authorized enterprise tenant email domains. When employees register their vehicles with an approved corporate domain, their registration is authenticated and prioritized for ANPR gate access.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={fetchMasterData}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Add New Domain Form */}
            <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Whitelist New Corporate Tenant Domain</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Format: company.com or enterprise.io</span>
              </div>

              <form onSubmit={handleAddDomain} className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="relative flex-1 w-full">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-mono font-bold text-xs">@</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. google.com, microsoft.com, infosys.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center space-x-1.5 shrink-0 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Authorize Domain</span>
                </button>
              </form>

              {/* Quick Preset Badges */}
              <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] text-slate-500 font-medium mr-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Quick Presets:
                </span>
                {['parkmatrix.com', 'google.com', 'microsoft.com', 'amazon.com', 'infosys.com', 'wipro.com', 'tcs.com', 'accenture.com'].map((preset) => {
                  const alreadyExists = domains.some((d) => d.domain.toLowerCase() === preset.toLowerCase());
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={alreadyExists}
                      onClick={() => handleAddDomain(undefined, preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                        alreadyExists
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                          : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 shadow-2xs'
                      }`}
                    >
                      +{preset} {alreadyExists && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Search & Domain Cards Grid */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search whitelisted domains..."
                  value={domainSearch}
                  onChange={(e) => setDomainSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <span className="text-xs font-mono text-slate-500">
                Showing {domains.filter((d) => domainSearch ? d.domain.toLowerCase().includes(domainSearch.toLowerCase()) || (d.addedBy || '').toLowerCase().includes(domainSearch.toLowerCase()) : true).length} of {domains.length} domains
              </span>
            </div>

            {/* Grid of Domain Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {domains
                .filter((d) => domainSearch ? d.domain.toLowerCase().includes(domainSearch.toLowerCase()) || (d.addedBy || '').toLowerCase().includes(domainSearch.toLowerCase()) : true)
                .map((dom) => (
                  <div
                    key={dom.id}
                    className="p-4 bg-slate-50/70 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                            <Globe className="w-4 h-4" />
                          </div>
                          <span className="font-mono font-black text-sm text-slate-900">@{dom.domain}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px] rounded-md">
                          ACTIVE
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono space-y-0.5 mt-2">
                        <div>Authorized By: <strong className="text-slate-700">{dom.addedBy || 'Master Admin'}</strong></div>
                        <div>Added: {new Date(dom.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between">
                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        ANPR Whitelist Enabled
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(dom.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Remove Whitelisted Domain"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {domains.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-mono text-xs border border-dashed border-slate-200 rounded-xl">
                No corporate domains whitelisted yet. Add your first domain above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SAAS INVOICES & BILLING */}
      {activeSubTab === 'INVOICES' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Platform Owner SaaS Billing & Revenue Ledgers</h3>
              <p className="text-xs text-slate-500">
                Track site licensing fees, setup invoices, and platform telemetry revenue.
              </p>
            </div>

            <div className="text-right font-mono text-xs">
              <span className="text-slate-500 block">Total Invoiced Balance</span>
              <span className="text-lg font-black text-slate-900">
                ₹{totalInvoicedRevenue.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px]">
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Facility Site</th>
                  <th className="p-3">Billing Cycle</th>
                  <th className="p-3">Base Fee</th>
                  <th className="p-3">GST Tax (18%)</th>
                  <th className="p-3">Total Payable</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-900">{inv.invoiceNumber}</td>
                    <td className="p-3 font-bold text-slate-900">{inv.siteName}</td>
                    <td className="p-3 text-slate-600 font-mono">{inv.billingPeriod}</td>
                    <td className="p-3 font-mono font-semibold">₹{inv.baseAmount.toLocaleString()}</td>
                    <td className="p-3 font-mono text-slate-500">₹{inv.taxAmount.toLocaleString()}</td>
                    <td className="p-3 font-mono font-black text-slate-900">₹{inv.totalAmount.toLocaleString()}</td>
                    <td className="p-3 font-mono text-slate-600">{inv.dueDate}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                          inv.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.status === 'UNPAID'
                            ? 'bg-amber-100 text-amber-900'
                            : inv.status === 'OVERDUE'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {inv.status !== 'PAID' ? (
                        <button
                          onClick={() => handleInvoiceStatusUpdate(inv.id, 'PAID')}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded transition-colors"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono text-emerald-700 font-bold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Cleared
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANT RELOCATION AUDIT TRAIL */}
      {activeSubTab === 'RELOCATION_LOGS' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900">Attendant Vehicle Slot Relocation Audit Trail</h3>
            <p className="text-xs text-slate-500">
              Live record of all slot relocation requests initiated by field attendants and SMS notifications sent to vehicle drivers.
            </p>
          </div>

          <div className="space-y-2">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-mono text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No slot relocation notifications recorded yet. Attendants can relocate vehicles from the Mobile Field App.
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-mono">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900">{notif.vehicleNumber}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-amber-700 font-bold">Slot Moved: {notif.oldSlotNumber} → {notif.newSlotNumber}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-sans">
                      SMS Sent To: <strong>{notif.employeeName || 'Driver'}</strong> ({notif.mobile})
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded block">
                      SMS Delivered
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {new Date(notif.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ONBOARD NEW SITE MODAL */}
      {showOnboardModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Onboard New Site Facility</h3>
              </div>
              <button onClick={() => setShowOnboardModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Site Facility Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prestige Tech Cloud Hub"
                    value={onboardForm.siteName}
                    onChange={(e) => setOnboardForm({ ...onboardForm, siteName: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Site Code Identifier *</label>
                  <input
                    type="text"
                    placeholder="e.g. SITE-BLR-09"
                    value={onboardForm.siteCode}
                    onChange={(e) => setOnboardForm({ ...onboardForm, siteCode: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">City Location *</label>
                  <input
                    type="text"
                    required
                    value={onboardForm.city}
                    onChange={(e) => setOnboardForm({ ...onboardForm, city: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Address / Landmark</label>
                  <input
                    type="text"
                    placeholder="e.g. Whitefield Main Road"
                    value={onboardForm.address}
                    onChange={(e) => setOnboardForm({ ...onboardForm, address: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Contact Person Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Facility Contact Person</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Name e.g. Rajesh Kumar"
                    value={onboardForm.contactPerson}
                    onChange={(e) => setOnboardForm({ ...onboardForm, contactPerson: e.target.value })}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={onboardForm.contactEmail}
                    onChange={(e) => setOnboardForm({ ...onboardForm, contactEmail: e.target.value })}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    placeholder="Mobile number"
                    value={onboardForm.contactPhone}
                    onChange={(e) => setOnboardForm({ ...onboardForm, contactPhone: e.target.value })}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Inventory Capacity Configuration */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-[11px]">Total Slots</label>
                  <input
                    type="number"
                    value={onboardForm.totalSlots}
                    onChange={(e) => setOnboardForm({ ...onboardForm, totalSlots: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-2.5 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-[11px]">Basement Levels</label>
                  <input
                    type="number"
                    value={onboardForm.basementLevels}
                    onChange={(e) => setOnboardForm({ ...onboardForm, basementLevels: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-2.5 py-2 font-bold"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-5">
                  <input
                    type="checkbox"
                    id="hasPuzzle"
                    checked={onboardForm.hasPuzzleParking}
                    onChange={(e) => setOnboardForm({ ...onboardForm, hasPuzzleParking: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <label htmlFor="hasPuzzle" className="font-bold text-slate-700 font-sans text-xs">Puzzle Stacker</label>
                </div>
                <div className="flex items-center space-x-2 pt-5">
                  <input
                    type="checkbox"
                    id="hasEV"
                    checked={onboardForm.hasEVCharging}
                    onChange={(e) => setOnboardForm({ ...onboardForm, hasEVCharging: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <label htmlFor="hasEV" className="font-bold text-slate-700 font-sans text-xs">EV Hub</label>
                </div>
              </div>

              {/* Initial Pricing Structure */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 font-mono">
                <span className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider font-sans">
                  Site Tariff Pricing & GST Setup
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-emerald-800 font-bold">Hourly Rate (₹)</label>
                    <input
                      type="number"
                      value={onboardForm.hourlyRate}
                      onChange={(e) => setOnboardForm({ ...onboardForm, hourlyRate: Number(e.target.value) })}
                      className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-emerald-800 font-bold">Daily Max Rate (₹)</label>
                    <input
                      type="number"
                      value={onboardForm.dailyMaxRate}
                      onChange={(e) => setOnboardForm({ ...onboardForm, dailyMaxRate: Number(e.target.value) })}
                      className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-emerald-800 font-bold">Monthly Pass (₹)</label>
                    <input
                      type="number"
                      value={onboardForm.monthlyPassRate}
                      onChange={(e) => setOnboardForm({ ...onboardForm, monthlyPassRate: Number(e.target.value) })}
                      className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-emerald-800 font-bold">GST (%)</label>
                    <input
                      type="number"
                      value={onboardForm.taxPercentage}
                      onChange={(e) => setOnboardForm({ ...onboardForm, taxPercentage: Number(e.target.value) })}
                      className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowOnboardModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-600/30 flex items-center space-x-2"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Execute Onboarding & Generate Initial Invoice</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HOLD SERVICE MODAL */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-2 text-amber-600">
              <Pause className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Hold Service for '{showHoldModal.siteName}'</h3>
            </div>
            <p className="text-xs text-slate-600">
              Placing a site service on hold temporarily suspends live ANPR gate streams and automated slot allocations while retaining all historical telemetry.
            </p>

            <div>
              <label className="block text-slate-700 font-bold text-xs mb-1">Reason for Service Hold *</label>
              <textarea
                rows={3}
                value={holdReasonInput}
                onChange={(e) => setHoldReasonInput(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-600"
                placeholder="Enter operational hold reason..."
              ></textarea>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowHoldModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSiteStatusChange(showHoldModal.id, 'ON_HOLD', holdReasonInput)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm"
              >
                Confirm Hold Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PRICING MODAL */}
      {showPricingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Update Tariff Pricing: {showPricingModal.siteName}</h3>
              <button onClick={() => setShowPricingModal(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePricingSubmit} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Hourly Parking Rate (₹)</label>
                <input
                  type="number"
                  value={pricingForm.hourlyRate}
                  onChange={(e) => setPricingForm({ ...pricingForm, hourlyRate: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Daily Cap Maximum (₹)</label>
                <input
                  type="number"
                  value={pricingForm.dailyMaxRate}
                  onChange={(e) => setPricingForm({ ...pricingForm, dailyMaxRate: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Monthly Employee Pass (₹)</label>
                <input
                  type="number"
                  value={pricingForm.monthlyPassRate}
                  onChange={(e) => setPricingForm({ ...pricingForm, monthlyPassRate: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">GST Tax Percentage (%)</label>
                <input
                  type="number"
                  value={pricingForm.taxPercentage}
                  onChange={(e) => setPricingForm({ ...pricingForm, taxPercentage: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPricingModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl font-sans"
                >
                  Save Pricing Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RAISE INVOICE MODAL */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Raise Invoice: {showInvoiceModal.siteName}</h3>
              <button onClick={() => setShowInvoiceModal(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRaiseInvoiceSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Billing Period Cycle *</label>
                <input
                  type="text"
                  required
                  value={invoiceForm.billingPeriod}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, billingPeriod: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-semibold"
                  placeholder="e.g. August 2026"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Base Platform Licensing Fee (₹) *</label>
                <input
                  type="number"
                  required
                  value={invoiceForm.baseAmount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, baseAmount: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono font-bold"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl font-mono text-[11px] space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Base Amount:</span>
                  <span>₹{invoiceForm.baseAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST ({showInvoiceModal.pricing?.taxPercentage || 18}%):</span>
                  <span>₹{Math.round(invoiceForm.baseAmount * ((showInvoiceModal.pricing?.taxPercentage || 18) / 100)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                  <span>Total Payable:</span>
                  <span>₹{(invoiceForm.baseAmount + Math.round(invoiceForm.baseAmount * ((showInvoiceModal.pricing?.taxPercentage || 18) / 100))).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Invoice Remarks & Notes</label>
                <textarea
                  rows={2}
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm"
                >
                  Raise Tax Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE SITE CONFIRMATION MODAL */}
      {siteToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Site Confirmation</h3>
                <p className="text-xs text-rose-600 font-semibold">Irreversible Action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete site <strong className="text-slate-900 font-mono">'{siteToDelete.siteName}' ({siteToDelete.siteCode})</strong>? All associated configuration records will be unlinked.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setSiteToDelete(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSite}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete Site</span>
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
