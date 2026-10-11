import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AppUser } from '../types';
import { storeSessionToken } from '../sessionTokenFallback';
import { API_BASE } from '../apiBase';
import { Banner, Button, TextField } from '../design-system/components';
import logoReversedUrl from '../design-system/brand/parkflows-logo-reversed.svg';

export interface LoginProps {
  onLoginSuccess: (user: AppUser) => void;
  /** Why the user is back at sign-in, e.g. "Your session ended. Sign in to continue." (001 AC-45). */
  notice?: string | null;
}

// Same input rules as 001's LoginScreen (OWASP allow-lists).
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
const clean = (v: string, max: number) => v.replace(/[\x00-\x1F\x7F<>'"`;\\]/g, '').trim().slice(0, max);

interface ApiBody {
  success?: boolean;
  message?: string;
  errorCode?: string;
  token?: string;
  user?: AppUser;
}

type Problem = { title?: string; text: string } | null;

/**
 * Sign in (002 UX S1, AC-19/AC-21). One logo, no demo presets, no version pill.
 * Errors show the server's own message (03 gap 6: the lockout rules live on the
 * server, so the page never states fixed numbers). "Forgot password?" opens the
 * reset-token form (an administrator gives the token; 001 behaviour).
 */
export const Login: React.FC<LoginProps> = ({ onLoginSuccess, notice }) => {
  const [view, setView] = useState<'sign-in' | 'reset'>('sign-in');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const post = async (path: string, body: unknown): Promise<{ status: number; data: ApiBody }> => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      // The server replies with the __session cookie; a cross-origin fetch without this drops it.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data: ApiBody = {};
    try {
      data = (await res.json()) as ApiBody;
    } catch {
      data = {};
    }
    return { status: res.status, data };
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setDone(null);
    const id = clean(identifier, 254);
    const pw = password.replace(/^\x00+|\x00+$/g, '');
    const errors: Record<string, string> = {};
    if (!id) errors.identifier = 'Enter your email or username.';
    else if (id.includes('@') ? !EMAIL_RE.test(id) : !USERNAME_RE.test(id)) errors.identifier = 'Enter a valid email address or username.';
    if (!pw) errors.password = 'Enter your password.';
    else if (pw.length > 64) errors.password = 'Passwords are at most 64 characters.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const { status, data } = await post('/api/v1/auth/login', { identifier: id, password: pw });
      if (data.success && data.user) {
        if (data.token) storeSessionToken(data.token);
        onLoginSuccess(data.user);
        return;
      }
      if (status === 401) {
        setProblem({ title: "That email and password don't match.", text: 'Check them and try again.' });
      } else {
        // Lockout, suspended account, rate limit…: the server's own words.
        setProblem({ text: data.message || 'Something went wrong. Try again.' });
      }
    } catch {
      setProblem({ title: "Couldn't reach ParkFlows.", text: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const setNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const t = clean(token, 128);
    const errors: Record<string, string> = {};
    if (!t) errors.token = 'Paste the reset token your administrator gave you.';
    if (newPassword.length < 8) errors.newPassword = 'Use at least 8 characters.';
    else if (newPassword.length > 64) errors.newPassword = 'Passwords are at most 64 characters.';
    if (!errors.newPassword && confirm !== newPassword) errors.confirm = "The passwords don't match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const { data } = await post('/api/v1/auth/set-password', { token: t, newPassword });
      if (data.success) {
        setIdentifier(data.user?.email || data.user?.username || identifier);
        setPassword('');
        setToken('');
        setNewPassword('');
        setConfirm('');
        setDone('Your new password is set. Sign in with it now.');
        setView('sign-in');
      } else {
        setProblem({ text: data.message || "Couldn't set the password. Try again." });
      }
    } catch {
      setProblem({ title: "Couldn't reach ParkFlows.", text: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const switchView = (next: 'sign-in' | 'reset') => {
    setProblem(null);
    setFieldErrors({});
    setDone(null);
    setView(next);
  };

  return (
    <div className="pf pf-login">
      <section className="pf-login-brand">
        <img className="pf-login-logo" src={logoReversedUrl} alt="ParkFlows" width={177} height={40} />
        <div className="pf-login-pitch">
          <p className="pf-login-headline">Every slot, every site, at a glance.</p>
          <p>Sign in to manage live parking, employee passes and gate entries for your site.</p>
        </div>
        <div className="pf-login-bays" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={i === 4 ? 'pf-login-bay pf-login-bay--free' : 'pf-login-bay'} />
          ))}
        </div>
      </section>

      <main className="pf-login-main">
        {view === 'sign-in' ? (
          <form className="pf-login-form" onSubmit={signIn} noValidate>
            <div className="pf-login-head">
              <h1>Sign in</h1>
              <p>Use the email your site administrator registered for you.</p>
            </div>
            {notice && !problem && (
              <Banner tone="info" role="status">
                {notice}
              </Banner>
            )}
            {done && !problem && <Banner tone="success">{done}</Banner>}
            {problem && (
              <Banner tone="danger" title={problem.title}>
                {problem.text}
              </Banner>
            )}
            <TextField
              label="Email"
              type="text"
              inputMode="email"
              autoComplete="username"
              size="lg"
              required
              value={identifier}
              error={fieldErrors.identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              size="lg"
              required
              value={password}
              error={fieldErrors.password}
              onChange={(e) => setPassword(e.target.value)}
              labelAside={
                <a
                  className="pf-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchView('reset');
                  }}
                >
                  Forgot password?
                </a>
              }
            />
            <Button type="submit" variant="primary" size="lg" block loading={busy} loadingLabel="Signing in…">
              Sign in
            </Button>
            <p className="pf-login-foot">
              Working at the gate?{' '}
              <a className="pf-link pf-link--inline" href="/attendant/">
                Open the gate screen
              </a>
            </p>
          </form>
        ) : (
          <form className="pf-login-form" onSubmit={setNew} noValidate>
            <div className="pf-login-head">
              <h1>Set a new password</h1>
              <p>Ask your administrator for a reset token, then choose a new password.</p>
            </div>
            {problem && (
              <Banner tone="danger" title={problem.title}>
                {problem.text}
              </Banner>
            )}
            <TextField label="Reset token" autoComplete="one-time-code" size="lg" required value={token} error={fieldErrors.token} onChange={(e) => setToken(e.target.value)} />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              size="lg"
              required
              help="8 to 64 characters."
              value={newPassword}
              error={fieldErrors.newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              label="Repeat the new password"
              type="password"
              autoComplete="new-password"
              size="lg"
              required
              value={confirm}
              error={fieldErrors.confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" variant="primary" size="lg" block loading={busy} loadingLabel="Saving…">
              Set password
            </Button>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => switchView('sign-in')}>
              Back to sign in
            </Button>
          </form>
        )}
      </main>
    </div>
  );
};
