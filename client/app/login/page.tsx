'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import '../auth.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Already logged in → skip to dashboard
  useEffect(() => {
    const stored = localStorage.getItem('carbon_user');
    if (stored) router.replace('/dashboard');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/users/login`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',                              // ✅ Receive the cookie
        body:        JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        // ✅ Only store non-sensitive UI state — auth is handled by the cookie
        localStorage.setItem('carbon_user', JSON.stringify(data.user));
        router.replace('/dashboard');
      } else {
        setError(data.error || 'Login failed. Please check your credentials.');
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
        <div className="auth-leaf">🌿</div>
        <div>
          <div className="auth-brand-name">Carbon Ledger</div>
          <div className="auth-brand-sub">Personal emission tracker</div>
        </div>
      </div>

      <div className="auth-card">
        <h1 className="auth-card-title">Welcome back</h1>
        <p className="auth-card-subtitle">Sign in to view your carbon dashboard</p>

        {error && (
          <div className="auth-alert error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email address</label>
            <input id="email" type="email" className="auth-input"
              placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" />
          </div>
          <div className="auth-field">
            <label htmlFor="password" className="auth-label">Password</label>
            <input id="password" type="password" className="auth-input"
              placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading && <span className="auth-spinner" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-divider" />
        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="auth-link">Create one free</Link>
        </p>
      </div>

      <div className="auth-trust">
        <span className="auth-trust-item">🔒 Secure login</span>
        <span className="auth-trust-item">📊 IPCC AR6 factors</span>
        <span className="auth-trust-item">🌍 Track your impact</span>
      </div>
    </div>
  );
}