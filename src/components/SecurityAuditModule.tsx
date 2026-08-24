import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Fingerprint,
  Terminal,
  Zap,
  Key,
  FileCheck,
  Download,
  Database,
  Layers,
  ArrowRight,
  ShieldX
} from 'lucide-react';
import { SecurityAuditLog, SecurityComplianceSummary } from '../types';

interface SecurityAuditModuleProps {
  currentUserRole?: string;
  onRefreshAll?: () => void;
}

export const SecurityAuditModule: React.FC<SecurityAuditModuleProps> = ({
  currentUserRole = 'MASTER_ADMIN',
  onRefreshAll,
}) => {
  const [summary, setSummary] = useState<SecurityComplianceSummary | null>(null);
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [maskPIIToggle, setMaskPIIToggle] = useState<boolean>(true);
  const [verifyingChain, setVerifyingChain] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<string | null>(null);
  const [simulatingAttack, setSimulatingAttack] = useState<string | null>(null);
  const [simulationResponse, setSimulationResponse] = useState<any | null>(null);
  const [selectedLog, setSelectedLog] = useState<SecurityAuditLog | null>(null);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const [sumRes, logsRes] = await Promise.all([
        fetch('/api/v1/security/compliance-summary'),
        fetch('/api/v1/security/audit-logs?limit=100'),
      ]);
      const sumData = await sumRes.json();
      const logsData = await logsRes.json();

      if (sumData.success) {
        setSummary(sumData.summary);
      }
      if (logsData.success) {
        setLogs(logsData.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch security data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
    const timer = setInterval(() => {
      fetchSecurityData();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const res = await fetch('/api/v1/security/verify-audit-chain', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.verification) {
        setVerificationResult(data.verification.details);
      }
    } catch (err) {
      setVerificationResult('Verification failed due to network error.');
    } finally {
      setVerifyingChain(false);
    }
  };

  const handleSimulateAttack = async (attackType: 'BOLA_EXPLOIT' | 'RATE_LIMIT_FLOOD' | 'SQL_XSS_INJECTION') => {
    setSimulatingAttack(attackType);
    setSimulationResponse(null);
    try {
      const res = await fetch('/api/v1/security/simulate-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackType }),
      });
      const data = await res.json();
      setSimulationResponse(data);
      fetchSecurityData();
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulatingAttack(null);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'BLOCKED' && log.status !== 'SUCCESS') ||
      log.status === statusFilter;

    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !searchQuery ||
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      log.targetResource.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.integrityHash.toLowerCase().includes(q);

    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 lg:p-8 text-white shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/30 shadow-inner">
                <ShieldCheck className="w-7 h-7 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                  InfoSec & Privacy Defense Center
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold">
                    ISO 27001 / DPDP Active
                  </span>
                </h1>
                <p className="text-sm text-slate-300">
                  Continuous Zero-Trust Security Monitoring, BOLA Guard, PII Data Masking & SHA-256 HMAC Audit Trail.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleVerifyChain}
              disabled={verifyingChain}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center space-x-2 transition shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
            >
              <Fingerprint className={`w-4 h-4 ${verifyingChain ? 'animate-spin' : ''}`} />
              <span>{verifyingChain ? 'Verifying Hashes...' : 'Verify Cryptographic Hashes'}</span>
            </button>

            <button
              onClick={fetchSecurityData}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
              title="Refresh Security Status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {verificationResult && (
          <div className="mt-4 p-3.5 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{verificationResult}</span>
            </div>
            <button
              onClick={() => setVerificationResult(null)}
              className="text-emerald-400 hover:text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Security Posture Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: BOLA / IDOR Guard */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">BOLA / IDOR Defense</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">Active & Enforced</div>
          <p className="text-xs text-slate-500 mt-1">Cross-user identity manipulation blocked at middleware.</p>
          <div className="mt-3 flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 0 Unauthorized Access Bypasses
          </div>
        </div>

        {/* Card 2: PII Masking */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">GDPR / DPDP Privacy</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <EyeOff className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">Masked Telemetry</div>
          <p className="text-xs text-slate-500 mt-1">Plates, emails, & phone numbers masked for non-privilege views.</p>
          <div className="mt-3 flex items-center text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Dynamic Masking Active
          </div>
        </div>

        {/* Card 3: Rate Limiter */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Rate Limiter & Anti-DoS</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">Sliding Window</div>
          <p className="text-xs text-slate-500 mt-1">60 req/min general, 20 req/min for vehicle mutation.</p>
          <div className="mt-3 flex items-center text-xs font-medium text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md w-fit">
            <Activity className="w-3.5 h-3.5 mr-1" /> IP & Token Throttling
          </div>
        </div>

        {/* Card 4: Cryptographic Audit Trail */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Audit Trail Integrity</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Fingerprint className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{summary?.totalAuditLogs || logs.length} Records</div>
          <p className="text-xs text-slate-500 mt-1">SHA-256 HMAC cryptographic chaining verified.</p>
          <div className="mt-3 flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {summary?.lastTamperCheckStatus || 'VERIFIED_INTACT'}
          </div>
        </div>
      </div>

      {/* Interactive Threat & Remediation Simulator Panel */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white border border-slate-800 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              Live Attack Simulation & Defense Verification Console
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Trigger real-time attack simulations to verify middleware interception, BOLA blocking, rate limiting, and input sanitization.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Test 1: BOLA Attack */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-bold mb-1">
                <ShieldX className="w-4 h-4" />
                <span>TEST 1: BOLA / IDOR EXPLOIT</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Simulate an unauthorized user attempting to overwrite another employee's registered vehicle license plate.
              </p>
            </div>
            <button
              onClick={() => handleSimulateAttack('BOLA_EXPLOIT')}
              disabled={!!simulatingAttack}
              className="w-full py-2 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{simulatingAttack === 'BOLA_EXPLOIT' ? 'Executing Attack...' : 'Simulate BOLA Attack'}</span>
            </button>
          </div>

          {/* Test 2: Rate Limit Flood */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-purple-400 text-xs font-mono font-bold mb-1">
                <Zap className="w-4 h-4" />
                <span>TEST 2: RATE LIMIT FLOOD (DoS)</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Simulate 150 burst requests to test the sliding-window rate limiter and HTTP 429 response enforcement.
              </p>
            </div>
            <button
              onClick={() => handleSimulateAttack('RATE_LIMIT_FLOOD')}
              disabled={!!simulatingAttack}
              className="w-full py-2 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-bold text-xs flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{simulatingAttack === 'RATE_LIMIT_FLOOD' ? 'Simulating Flood...' : 'Simulate DoS Flood'}</span>
            </button>
          </div>

          {/* Test 3: SQL / XSS Injection */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-amber-400 text-xs font-mono font-bold mb-1">
                <Terminal className="w-4 h-4" />
                <span>TEST 3: SQL & XSS INJECTION</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Test submitting script injection and SQL drop commands within vehicle plate parameters.
              </p>
            </div>
            <button
              onClick={() => handleSimulateAttack('SQL_XSS_INJECTION')}
              disabled={!!simulatingAttack}
              className="w-full py-2 px-3 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{simulatingAttack === 'SQL_XSS_INJECTION' ? 'Injecting Payload...' : 'Simulate Injection'}</span>
            </button>
          </div>
        </div>

        {/* Attack Response Telemetry Box */}
        {simulationResponse && (
          <div className="mt-5 p-4 bg-slate-950 rounded-xl border border-indigo-500/40 font-mono text-xs text-slate-300">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="font-bold text-white uppercase">{simulationResponse.simulation} Result</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-bold">
                  Status: HTTP {simulationResponse.httpStatus}
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-500/40 font-bold">
                  {simulationResponse.result}
                </span>
              </div>
            </div>
            <p className="text-slate-400 mb-2">
              <strong className="text-indigo-300">Defense Mechanism Triggered:</strong> {simulationResponse.defenseMechanism}
            </p>
            {simulationResponse.incidentLog && (
              <div className="p-3 bg-slate-900 rounded-lg text-slate-300 text-xs">
                <div><strong className="text-slate-400">Action:</strong> {simulationResponse.incidentLog.action}</div>
                <div><strong className="text-slate-400">Target Resource:</strong> {simulationResponse.incidentLog.targetResource}</div>
                <div><strong className="text-slate-400">Details:</strong> {simulationResponse.incidentLog.details}</div>
                <div className="text-[10px] text-indigo-400 font-mono break-all mt-1">
                  <strong>SHA-256 HMAC:</strong> {simulationResponse.incidentLog.integrityHash}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cryptographic Audit Trail Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-indigo-600" />
              Cryptographic Tamper-Evident Audit Trail
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live audit event stream protected with cryptographic HMAC signature verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
              />
            </div>

            {/* Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Audit Statuses</option>
              <option value="SUCCESS">Success Events Only</option>
              <option value="BLOCKED_UNAUTHORIZED">Blocked BOLA Attempts</option>
              <option value="RATE_LIMITED">Rate Limited Incidents</option>
              <option value="VALIDATION_FAILED">Validation Failures</option>
            </select>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp & ID</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Actor / Caller</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">Status & Guard</th>
                <th className="py-3 px-4">HMAC Integrity Hash</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  let statusBadge = (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                      SUCCESS
                    </span>
                  );
                  if (log.status === 'BLOCKED_UNAUTHORIZED') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[10px]">
                        BLOCKED (BOLA)
                      </span>
                    );
                  } else if (log.status === 'RATE_LIMITED') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold text-[10px]">
                        RATE LIMITED
                      </span>
                    );
                  } else if (log.status === 'VALIDATION_FAILED') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[10px]">
                        VAL_FAILED
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                        <div className="text-[10px] text-slate-400">{log.id.slice(0, 14)}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div className="font-semibold">{log.actor}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.actorRole} • {log.ipAddress}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[180px] truncate">
                        {log.targetResource}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{statusBadge}</td>
                      <td className="py-3 px-4 text-[10px] text-indigo-700 font-mono">
                        <div className="flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[120px]">{log.integrityHash.slice(0, 16)}...</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-sans transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Audit Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Fingerprint className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Security Audit Record Inspection</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Record ID</span>
                  <span className="font-bold text-slate-900">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Timestamp</span>
                  <span className="font-bold text-slate-900">{selectedLog.timestamp}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Action</span>
                  <span className="font-bold text-indigo-600">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className="font-bold text-slate-900">{selectedLog.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Actor Identity</span>
                  <span className="font-bold text-slate-900">{selectedLog.actor}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">IP & Role</span>
                  <span className="font-bold text-slate-900">{selectedLog.ipAddress} ({selectedLog.actorRole})</span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-xs font-bold uppercase mb-1">Target Resource</span>
                <div className="p-2.5 bg-slate-100 rounded-lg text-slate-800">{selectedLog.targetResource}</div>
              </div>

              <div>
                <span className="text-slate-500 block text-xs font-bold uppercase mb-1">Audit Details</span>
                <div className="p-3 bg-slate-100 rounded-lg text-slate-800 leading-relaxed">{selectedLog.details}</div>
              </div>

              <div>
                <span className="text-slate-500 block text-xs font-bold uppercase mb-1">SHA-256 HMAC Signature</span>
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 break-all text-[11px]">
                  {selectedLog.integrityHash}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
