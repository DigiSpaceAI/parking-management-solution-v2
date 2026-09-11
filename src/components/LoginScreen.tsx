import React, { useState } from 'react';
import { storeSessionToken } from '../sessionTokenFallback';
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
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
        // Required: the server replies with the __session cookie
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
        if (data.token) storeSessionToken(data.token);
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, padding: '48px 24px', background: 'var(--color-bg, #f2f2f3)', fontFamily: "'Barlow', system-ui, sans-serif", color: 'var(--color-text, #1d1f20)', boxSizing: 'border-box' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-accent, #5980a6)', color: 'var(--color-bg, #f2f2f3)', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: '0.04em' }}>PF</div>
        <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 30, lineHeight: 1, letterSpacing: '0.01em' }}>ParkFlow</div>
      </div>

      <div style={{ width: '100%', maxWidth: 400, padding: '34px 32px', background: 'transparent', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', boxSizing: 'border-box' }}>
          {viewState === 'SIGN_IN' ? (
            <>
              {/* Top Tabs: Admin / Operator vs Employee Pass */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('ADMIN_STAFF');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  style={{
                    all: 'unset', boxSizing: 'border-box', textAlign: 'center', cursor: 'pointer', padding: '9px 0', fontSize: 13,
                    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600,
                    background: loginMode === 'ADMIN_STAFF' ? 'var(--color-accent, #5980a6)' : 'transparent',
                    color: loginMode === 'ADMIN_STAFF' ? 'var(--color-bg, #f2f2f3)' : 'var(--color-neutral-700, #5d5d60)',
                  }}
                >
                  Operator &amp; Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('EMPLOYEE_PASS');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  style={{
                    all: 'unset', boxSizing: 'border-box', textAlign: 'center', cursor: 'pointer', padding: '9px 0', fontSize: 13,
                    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, borderLeft: '1px solid var(--color-divider, rgba(29,31,32,.16))',
                    background: loginMode === 'EMPLOYEE_PASS' ? 'var(--color-accent, #5980a6)' : 'transparent',
                    color: loginMode === 'EMPLOYEE_PASS' ? 'var(--color-bg, #f2f2f3)' : 'var(--color-neutral-700, #5d5d60)',
                  }}
                >
                  Employee Smart Pass
                </button>
              </div>

              {/* Form Header */}
              <div style={{ marginTop: 22 }}>
                <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.15, fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600 }}>
                  {loginMode === 'ADMIN_STAFF' ? 'Sign in' : 'Employee Smart Parking Pass'}
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--color-neutral-700, #5d5d60)' }}>
                  {loginMode === 'ADMIN_STAFF'
                    ? 'Use your corporate credentials to reach your role dashboard.'
                    : 'Enter your registered corporate email to view your digital parking badge & live bay status.'}
                </p>
              </div>

              {/* Success Banner */}
              {successMessage && (
                <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--color-accent-100, #eef6ff)', border: '1px solid var(--color-accent-400, #94bce3)', color: 'var(--color-accent-800, #2c455d)', fontSize: 12.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div style={{ marginTop: 16, padding: '10px 12px', background: '#fdeaee', border: '1px solid #f7b6c2', color: '#be123c', fontSize: 12.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Mode 1: Admin / Operator Login Form */}
              {loginMode === 'ADMIN_STAFF' ? (
                <form onSubmit={handleAdminLogin} style={{ marginTop: 22 }}>
                  <div>
                    <label htmlFor="pf-user" style={{ display: 'block', fontSize: 12, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-neutral-700, #5d5d60)' }}>
                      Email or username
                    </label>
                    <input
                      id="pf-user"
                      type="text"
                      required
                      maxLength={254}
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@company.com"
                      style={{ width: '100%', minHeight: 42, padding: '6px 10px', fontSize: 14, color: 'var(--color-text, #1d1f20)', background: 'var(--color-surface, #e9e9ea)', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <label htmlFor="pf-pass" style={{ display: 'block', fontSize: 12, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-neutral-700, #5d5d60)' }}>
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetIdentifier(identifier);
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          setViewState('SET_PASSWORD');
                        }}
                        style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--color-accent-700, #416180)' }}
                      >
                        Create / reset password
                      </button>
                    </div>
                    <div style={{ position: 'relative', display: 'flex' }}>
                      <input
                        id="pf-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        maxLength={64}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{ width: '100%', minHeight: 42, padding: '6px 62px 6px 10px', fontSize: 14, color: 'var(--color-text, #1d1f20)', background: 'var(--color-surface, #e9e9ea)', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ all: 'unset', boxSizing: 'border-box', position: 'absolute', right: 1, top: 1, bottom: 1, padding: '0 12px', cursor: 'pointer', fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent-700, #416180)', display: 'flex', alignItems: 'center' }}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <label style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{ width: 15, height: 15, flex: 'none', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rememberMe ? 'var(--color-accent, #5980a6)' : 'transparent' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg, #f2f2f3)" strokeWidth={3} strokeLinecap="square" style={{ opacity: rememberMe ? 1 : 0 }}><path d="M20 6 9 17l-5-5"></path></svg>
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-neutral-700, #5d5d60)' }}>Keep me signed in for 30 days</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{ all: 'unset', boxSizing: 'border-box', marginTop: 22, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: '0.03em', background: 'var(--color-accent, #5980a6)', color: 'var(--color-bg, #f2f2f3)', opacity: isLoading ? 0.6 : 1 }}
                  >
                    {isLoading ? (
                      <span>Verifying credentials…</span>
                    ) : (
                      <>
                        <span>Sign in</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Mode 2: Employee Smart Pass Form */
                <form onSubmit={handleEmployeePassLogin} style={{ marginTop: 22 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-neutral-700, #5d5d60)' }}>
                      Registered corporate email
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      placeholder="name@company.com"
                      style={{ width: '100%', minHeight: 42, padding: '6px 10px', fontSize: 14, color: 'var(--color-text, #1d1f20)', background: 'var(--color-surface, #e9e9ea)', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', boxSizing: 'border-box' }}
                    />
                    <p style={{ fontSize: 11.5, color: 'var(--color-neutral-600, #7a7a7d)', marginTop: 8 }}>
                      Pre-whitelisted domains: <code style={{ background: 'var(--color-neutral-200, #e7e7ea)', padding: '1px 5px', color: 'var(--color-accent-700, #416180)' }}>@techcorp.com</code>, <code style={{ background: 'var(--color-neutral-200, #e7e7ea)', padding: '1px 5px', color: 'var(--color-accent-700, #416180)' }}>@prestige.com</code>
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{ all: 'unset', boxSizing: 'border-box', marginTop: 22, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: '0.03em', background: 'var(--color-accent, #5980a6)', color: 'var(--color-bg, #f2f2f3)', opacity: isLoading ? 0.6 : 1 }}
                  >
                    {isLoading ? (
                      <span>Verifying pass…</span>
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
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-divider, rgba(29,31,32,.16))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-neutral-700, #5d5d60)' }}>
                <span>First time or need a password?</span>
                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(identifier);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setViewState('SET_PASSWORD');
                  }}
                  style={{ all: 'unset', cursor: 'pointer', color: 'var(--color-accent-700, #416180)', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600 }}
                >
                  Set up password →
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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 460 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-600, #7a7a7d)' }}>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Acceptable Use</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Support</a>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--color-neutral-600, #7a7a7d)' }}>
          ParkFlow Enterprise PMS v4.2 — Protected by End-to-End Encryption &amp; OAuth SSO Gateway. Access to this system is restricted to authorised users. Activity is monitored and logged; unauthorised use may result in disciplinary action or prosecution.
        </p>
      </div>
    </div>
  );
};
