import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  Building2,
  Car,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  UserPlus,
  RefreshCw,
  Info,
} from 'lucide-react';
import { AppUser } from '../types';

interface LoginScreenProps {
  allUsers: AppUser[];
  onLoginSuccess: (user: AppUser, redirectTab?: string) => void;
}

// OWASP Input Validation Constants
const EMAIL_ALLOWLIST_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const USERNAME_ALLOWLIST_REGEX = /^[a-zA-Z0-9._-]{3,50}$/;

// Absolute API base. Relative '/api/...' paths cannot work inside the Capacitor
// APK: the page origin is https://localhost, where no server runs. The web
// dashboard is unaffected — it is served by the same host as the API, so this
// resolves to the same URL it always used.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://parking-management-solution-v2-git-430896008903.asia-south1.run.app'
).replace(/\/$/, '');

export const LoginScreen: React.FC<LoginScreenProps> = ({
  allUsers,
  onLoginSuccess,
}) => {
  const [viewState, setViewState] = useState<'SIGN_IN' | 'SET_PASSWORD'>('SIGN_IN');
  const [loginMode, setLoginMode] = useState<'ADMIN_STAFF' | 'EMPLOYEE_PASS'>('ADMIN_STAFF');
  
  // Sign In inputs
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [employeeEmail, setEmployeeEmail] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // Set / Reset Password inputs
  const [resetIdentifier, setResetIdentifier] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Client-Side Input Sanitization
    const cleanIdentifier = identifier
      .replace(/[\x00-\x1F\x7F<>'"`;\\]/g, '')
      .trim()
      .slice(0, 254);

    const cleanPassword = password.replace(/^\x00+|\x00+$/g, '');

    if (!cleanIdentifier) {
      setErrorMessage('Please enter your corporate email or username.');
      return;
    }

    // 2. Syntactical validation & Character Limits
    const isEmail = cleanIdentifier.includes('@');
    if (isEmail) {
      if (!EMAIL_ALLOWLIST_REGEX.test(cleanIdentifier) || cleanIdentifier.length > 254) {
        setErrorMessage('Please enter a valid corporate email address (max 254 characters).');
        return;
      }
    } else {
      if (!USERNAME_ALLOWLIST_REGEX.test(cleanIdentifier) || cleanIdentifier.length > 50) {
        setErrorMessage('Username must be 3-50 alphanumeric characters.');
        return;
      }
    }

    if (cleanPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (cleanPassword.length > 64) {
      setErrorMessage('Password must not exceed 64 characters (OWASP CPU-DoS protection limit).');
      return;
    }

    setIsLoading(true);

    try {
      // Authenticate via PBKDF2/SHA256 Auth API
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        // Required: the server replies with the parkorbit_session cookie
        // (HttpOnly; Secure; SameSite=None). A cross-origin fetch without this
        // flag silently discards it, so every later API call would 401.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password: cleanPassword,
        }),
      });

      const data = await res.json();
      if (res.status === 429 || data.errorCode === 'ERR_RATE_LIMITED') {
        const retrySecs = data.retryAfter || 900;
        setErrorMessage(data.message || `Too many failed login attempts. Account temporarily locked for ${Math.ceil(retrySecs / 60)} minutes.`);
        return;
      }

      if (data.success && data.user) {
        onLoginSuccess(data.user);
      } else {
        // OWASP Generic Error Message to prevent account enumeration
        setErrorMessage(data.message || 'Invalid credentials.');
      }
    } catch (err) {
      setErrorMessage('Authentication server unreachable. Please check network connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmployeePassLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = employeeEmail
      .replace(/[\x00-\x1F\x7F<>'"`;\\]/g, '')
      .trim()
      .toLowerCase()
      .slice(0, 254);

    if (!cleanEmail) {
      setErrorMessage('Please enter your registered corporate email.');
      return;
    }

    if (!EMAIL_ALLOWLIST_REGEX.test(cleanEmail)) {
      setErrorMessage('Please enter a valid corporate email address (max 254 characters).');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/employees/profile?email=${encodeURIComponent(cleanEmail)}`, {
        credentials: 'include',
        headers: {
          'x-user-email': cleanEmail,
          'x-user-role': 'EMPLOYEE',
        },
      });
      const data = await res.json();
      if (data.success && data.employee) {
        const employeeUser: AppUser = {
          id: `emp-session-${data.employee.id || data.employee.employeeId}`,
          username: data.employee.employeeId,
          fullName: data.employee.name,
          email: data.employee.email,
          phone: data.employee.phone || '+91 98000 00000',
          designation: `${data.employee.department} Specialist`,
          roleId: 'role-employee-pass',
          roleName: 'Corporate Employee',
          siteScopeType: 'SPECIFIC_SITES',
          assignedSiteIds: ['site-1'],
          assignedSiteNames: ['Tech Park HQ Main Hub'],
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };

        onLoginSuccess(employeeUser, 'EMPLOYEE_MOBILE_APP');
      } else {
        setErrorMessage(
          'Invalid credentials or employee email not found in corporate whitelist. Please register your vehicle first.'
        );
      }
    } catch (err) {
      setErrorMessage('Could not verify employee whitelist. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanToken = resetIdentifier
      .replace(/[\x00-\x1F\x7F<>'"`;\\]/g, '')
      .trim()
      .slice(0, 128);

    const cleanNewPass = newPassword.replace(/^\x00+|\x00+$/g, '');
    const cleanConfirmPass = confirmPassword.replace(/^\x00+|\x00+$/g, '');

    if (!cleanToken) {
      setErrorMessage('Please enter the reset token your admin gave you.');
      return;
    }

    if (cleanNewPass.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (cleanNewPass.length > 64) {
      setErrorMessage('Password must not exceed 64 characters (OWASP limit).');
      return;
    }

    if (cleanNewPass !== cleanConfirmPass) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cleanToken,
          newPassword: cleanNewPass,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Password created successfully! Please sign in with your new credentials.');
        setIdentifier(data.user?.email || data.user?.username || '');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setViewState('SIGN_IN');
      } else {
        setErrorMessage(data.message || 'Failed to update password.');
      }
    } catch (err) {
      setErrorMessage('Server connection error. Failed to set password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center relative overflow-hidden selection:bg-indigo-500 selection:text-white font-sans">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row items-center justify-between gap-12">
        {/* Left Branding & Highlights Column */}
        <div className="w-full lg:w-1/2 text-white space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center space-x-2.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Enterprise Gateway • Cryptographic Auth</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center lg:justify-start space-x-3">
              <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 font-mono font-extrabold text-2xl text-white">
                PO
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-sans">
                ParkOrbit
              </h1>
            </div>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg">
              Centrally Managed Smart Parking & Mobility Infrastructure for Corporate Campuses, Valet Fleets, and Multi-Basement Facilities.
            </p>
          </div>

          {/* Core Feature Badges */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex items-start space-x-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-white">1,080 Multi-Basement</h4>
                <p className="text-[11px] text-slate-400">Live B1, B2 & B3 real-time state</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 flex items-start space-x-3">
              <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shrink-0">
                <Car className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-white">ANPR OCR & ValetX</h4>
                <p className="text-[11px] text-slate-400">Vision gate & key pegboard</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800/80 text-left">
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-300 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>PBKDF2 Salted Hashes & BOLA Protection</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Zero-Trust password authentication, HMAC tamper-evident audit logs, and rate limiters protect all endpoints against brute force attacks.
            </p>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="w-full lg:w-[460px] bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/80 relative">
          {viewState === 'SIGN_IN' ? (
            <>
              {/* Top Tabs: Admin / Operator vs Employee Pass */}
              <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('ADMIN_STAFF');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    loginMode === 'ADMIN_STAFF'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Operator & Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('EMPLOYEE_PASS');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    loginMode === 'EMPLOYEE_PASS'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Employee Smart Pass</span>
                </button>
              </div>

              {/* Form Header */}
              <div className="mb-5">
                <h2 className="text-xl font-extrabold text-slate-900">
                  {loginMode === 'ADMIN_STAFF' ? 'Sign in to ParkOrbit' : 'Employee Smart Parking Pass'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {loginMode === 'ADMIN_STAFF'
                    ? 'Enter your corporate email and password to access your role-specific dashboard.'
                    : 'Enter your registered corporate email to view your digital parking badge & live bay status.'}
                </p>
              </div>

              {/* Success Banner */}
              {successMessage && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Mode 1: Admin / Operator Login Form */}
              {loginMode === 'ADMIN_STAFF' ? (
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Corporate Email or Username
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        maxLength={254}
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. v.roy@parkos.ai"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Security Password (8-64 chars)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetIdentifier(identifier);
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          setViewState('SET_PASSWORD');
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                      >
                        Create / Reset Password
                      </button>
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        maxLength={64}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your security password"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Keep session active (30 Days)</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Verifying Credentials...</span>
                    ) : (
                      <>
                        <span>Sign In to Dashboard</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Mode 2: Employee Smart Pass Form */
                <form onSubmit={handleEmployeePassLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Registered Corporate Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={employeeEmail}
                        onChange={(e) => setEmployeeEmail(e.target.value)}
                        placeholder="e.g. priya.sharma@techcorp.com"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Pre-whitelisted domains: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">@techcorp.com</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">@prestige.com</code>
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Verifying Pass...</span>
                    ) : (
                      <>
                        <span>Open My Smart Pass</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Quick Fill Demo Credentials Bar — dev-only. This must
                  never render in production: real, guessable account
                  identifiers plus their passwords on an unauthenticated
                  page is a direct account-takeover vector. import.meta.env.DEV
                  is false in any production build (npm run build), so this
                  is structurally impossible to ship live, not just hidden
                  by convention. */}
              {loginMode === 'ADMIN_STAFF' && import.meta.env.DEV && (
                <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                    <span>⚠ Dev-only quick fill (not shown in production build):</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier('digisolutions.fm@gmail.com');
                        setPassword('Admin@1234');
                      }}
                      className="p-1.5 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg text-left transition"
                    >
                      <div className="font-bold text-indigo-900 truncate">Master Admin</div>
                      <div className="text-[10px] text-indigo-600 truncate">digisolutions.fm@gmail.com</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier('ananya.sharma@prestige.com');
                        setPassword('Site@1234');
                      }}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition"
                    >
                      <div className="font-bold text-slate-800 truncate">Site Manager</div>
                      <div className="text-[10px] text-slate-500 truncate">ananya.sharma@prestige.com</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier('suresh.k@valetx.in');
                        setPassword('Valet@1234');
                      }}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition"
                    >
                      <div className="font-bold text-slate-800 truncate">Valet Lead</div>
                      <div className="text-[10px] text-slate-500 truncate">suresh.k@valetx.in</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier('ramesh.g@security.com');
                        setPassword('Gate@1234');
                      }}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition"
                    >
                      <div className="font-bold text-slate-800 truncate">Gate Attendant</div>
                      <div className="text-[10px] text-slate-500 truncate">ramesh.g@security.com</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Password setup prompt banner */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>First time or need a password?</span>
                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(identifier);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setViewState('SET_PASSWORD');
                  }}
                  className="font-bold text-indigo-600 hover:text-indigo-800"
                >
                  Set Up Password ➔
                </button>
              </div>
            </>
          ) : (
            /* ViewState: SET / CREATE PASSWORD FLOW */
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-600 mb-1">
                <KeyRound className="w-5 h-5" />
                <h2 className="text-lg font-extrabold text-slate-900">Set Up / Reset Password</h2>
              </div>
              <p className="text-xs text-slate-500">
                Enter the reset token your administrator gave you, along with your new password.
                Don't have a token? Ask an admin to generate one for your account in User Management.
              </p>

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSetPassword} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Reset Token (from your admin)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      maxLength={128}
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="Paste the token you were given"
                      className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    New Password (8-64 chars)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={64}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 8 chars)"
                      className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={64}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewState('SIGN_IN');
                      setErrorMessage(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Save Password'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-xs text-slate-600 border-t border-slate-900">
        ParkOrbit Enterprise PMS v4.2 • Protected by End-to-End Encryption & OAuth SSO Gateway
      </div>
    </div>
  );
};
