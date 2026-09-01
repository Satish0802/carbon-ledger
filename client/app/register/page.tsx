'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import GoogleButton from '../components/GoogleButton';
import CarbonIcon from '../components/CarbonIcon';
import '../auth.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/users/google`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('carbon_user', JSON.stringify(data.user));
        router.replace('/dashboard');
      } else {
        setError(data.error || 'Google sign-in failed.');
      }
    } catch {
      setError('Cannot reach the server. Is it running on port 8000?');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/users/register`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',                              // ✅ Added
        body:        JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(data.error || 'Registration failed. Try a different username or email.');
      }
    } catch {
      setError('Cannot reach the server. Is it running on port 8000?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-leaf"><CarbonIcon name="leaf" size={22} /></div>
        <div>
          <div className="auth-brand-name">Carbon Ledger</div>
          <div className="auth-brand-sub">Personal emission tracker</div>
        </div>
      </div>

      <div className="auth-card">
        <h1 className="auth-card-title">Create your account</h1>
        <p className="auth-card-subtitle">Start tracking your carbon footprint for free</p>

        {error && <div className="auth-alert error"><CarbonIcon name="warning" size={15} /><span>{error}</span></div>}
        {success && <div className="auth-alert success"><span>✓</span><span>Account created! Redirecting to login…</span></div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="username" className="auth-label">Username</label>
            <input id="username" type="text" className="auth-input"
              placeholder="e.g. alex_green" value={username}
              onChange={(e) => setUsername(e.target.value)}
              required autoComplete="username" disabled={success} />
          </div>
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email address</label>
            <input id="email" type="email" className="auth-input"
              placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" disabled={success} />
          </div>
          <div className="auth-field">
            <label htmlFor="password" className="auth-label">Password</label>
            <input id="password" type="password" className="auth-input"
              placeholder="At least 6 characters" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete="new-password" disabled={success} />
          </div>
          <div className="auth-field">
            <label htmlFor="confirm" className="auth-label">Confirm password</label>
            <input id="confirm" type="password" className="auth-input"
              placeholder="Repeat your password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required autoComplete="new-password" disabled={success} />
          </div>
          <button type="submit" className="auth-submit" disabled={loading || success}>
            {loading && <span className="auth-spinner" />}
            {loading ? 'Creating account…' : success ? 'Account created ✓' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider" />
        <GoogleButton onCredential={handleGoogleCredential} />
        <div className="auth-divider" />
        <p className="auth-footer">
          Already have an account?{' '}
          <Link href="/login" className="auth-link">Sign in here</Link>
        </p>
      </div>

      <div className="auth-trust">
        <span className="auth-trust-item"><CarbonIcon name="lock" size={14} /> Secure &amp; private</span>
        <span className="auth-trust-item"><CarbonIcon name="chart" size={14} /> IPCC AR6 factors</span>
        <span className="auth-trust-item"><CarbonIcon name="globe" size={14} /> Track your impact</span>
      </div>
    </div>
  );
}