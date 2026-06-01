"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./dashboard.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredUser {
  _id: string;
  username: string;
  email: string;
}

interface EmissionEntry {
  _id: string;
  totalKgPerYear: number;
  percentileVsGlobal: number;
  globalAverageKg: number;
  createdAt: string;
  transportKg: number;
  energyKg: number;
  dietKg: number;
  shoppingKg: number;
}

interface Goal {
  _id: string;
  category: string;
  title: string;
  baselineKg: number;
  targetKg: number;
  targetReductionPct: number;
  latestPctAchieved: number;
  latestKg: number | null;
  deadline: string;
  status: string;
}

interface UserProfile {
  country: string;
  continent: string;
  householdSize: number;
  homeType: string;
  occupationType: string;
  onboardingStep: string;
  hasCompletedCalculator: boolean;
}

type ActiveTab = "overview" | "history" | "goals";

// ─── Constants ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CAT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  transport: { label: "Transport", color: "#3b82f6", bg: "#dbeafe", icon: "🚗" },
  energy:    { label: "Energy",    color: "#f59e0b", bg: "#fef3c7", icon: "⚡" },
  diet:      { label: "Diet",      color: "#22c55e", bg: "#dcfce7", icon: "🥗" },
  shopping:  { label: "Shopping",  color: "#f43f5e", bg: "#ffe4e6", icon: "🛍️" },
};

const TIPS: Record<string, string> = {
  transport: "Switch to an EV or public transit to cut your biggest emission source.",
  energy:    "A solar panel or green energy tariff could halve your energy footprint.",
  diet:      "Replacing meat 3× per week can save up to 0.5t CO₂e per year.",
  shopping:  "Buying second-hand and keeping devices longer slashes embodied carbon.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}
function fmtT(kg: number) { return (kg / 1000).toFixed(2) + "t"; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function pctVsAvg(total: number, avg: number) {
  return Math.round(((avg - total) / avg) * 100);
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ entry }: { entry: EmissionEntry }) {
  const cats = [
    { key: "transport", kg: entry.transportKg ?? 0 },
    { key: "energy",    kg: entry.energyKg    ?? 0 },
    { key: "diet",      kg: entry.dietKg      ?? 0 },
    { key: "shopping",  kg: entry.shoppingKg  ?? 0 },
  ];
  const total = cats.reduce((s, c) => s + c.kg, 0) || 1;
  const circumference = 2 * Math.PI * 38;
  let offset = 0;
  return (
    <svg width="120" height="120" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--dash-track)" strokeWidth="14" />
      {cats.map((c) => {
        const arc = (c.kg / total) * circumference;
        const el = (
          <circle key={c.key} cx="50" cy="50" r="38" fill="none"
            stroke={CAT_META[c.key].color} strokeWidth="14"
            strokeDasharray={`${arc} ${circumference - arc}`}
            strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
        );
        offset += arc;
        return el;
      })}
      <text x="50" y="45" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--dash-text-primary)">
        {(total / 1000).toFixed(1)}t
      </text>
      <text x="50" y="58" textAnchor="middle" fontSize="9" fill="var(--dash-text-muted)">CO₂e/yr</text>
    </svg>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ history }: { history: EmissionEntry[] }) {
  if (history.length < 2) {
    return <div style={{ height: 64, display: "flex", alignItems: "center", color: "var(--dash-text-muted)", fontSize: 12 }}>Submit more entries to see your trend.</div>;
  }
  const vals = [...history].reverse().map((e) => e.totalKgPerYear);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const w = 400, h = 60;
  const px = (i: number) => (i / (vals.length - 1)) * w;
  const py = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 8) - 4;
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join(" ");
  const trend = vals[vals.length - 1] < vals[0];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={d} fill="none" stroke={trend ? "#22c55e" : "#f43f5e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(vals.length - 1)} cy={py(vals[vals.length - 1])} r="4" fill={trend ? "#22c55e" : "#f43f5e"} />
    </svg>
  );
}

// ─── Welcome gate ─────────────────────────────────────────────────────────────

function WelcomeGate({ username, onStart }: { username: string; onStart: () => void }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 20, padding: "2rem 1rem" }}>
      <div style={{ fontSize: 48 }}>🌿</div>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--dash-text-primary)", margin: 0 }}>
        Welcome to Carbon Ledger, {username}
      </h2>
      <p style={{ fontSize: 14, color: "var(--dash-text-muted)", maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
        Your dashboard is waiting — but first, complete your carbon footprint assessment. It takes about 3 minutes and covers transport, energy, diet, and shopping.
      </p>
      <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
        {["🚗 Transport", "⚡ Energy", "🥗 Diet", "🛍 Shopping"].map((s) => (
          <span key={s} style={{ fontSize: 12, color: "var(--dash-text-muted)" }}>{s}</span>
        ))}
      </div>
      <button onClick={onStart} className="dash-btn-primary">Start your assessment →</button>
      <p style={{ fontSize: 11, color: "var(--dash-text-muted)", margin: 0 }}>Based on IPCC AR6 &amp; IEA 2024 emissions factors</p>
    </div>
  );
}

// ─── New Entry Modal ──────────────────────────────────────────────────────────

function NewEntryModal({ onClose, onSubmit, loading }: {
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dash-modal-header">
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--dash-text-primary)" }}>Log a new entry</div>
            <div style={{ fontSize: 12, color: "var(--dash-text-muted)", marginTop: 2 }}>Update your carbon footprint data</div>
          </div>
          <button className="dash-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "1rem 1.25rem", fontSize: 13, color: "var(--dash-text-muted)", lineHeight: 1.6 }}>
          Submit a new assessment to track changes in your footprint over time. Each submission is saved to your history so you can see progress.
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 1.25rem 1.25rem", justifyContent: "flex-end" }}>
          <button className="dash-btn" onClick={onClose}>Cancel</button>
          <button className="dash-btn-primary" onClick={onSubmit} disabled={loading} style={{ fontSize: 13, padding: "8px 18px" }}>
            {loading ? "…" : "Go to calculator →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser]           = useState<StoredUser | null>(null);
  const [latest, setLatest]       = useState<EmissionEntry | null>(null);
  const [history, setHistory]     = useState<EmissionEntry[]>([]);
  const [goals, setGoals]         = useState<Goal[]>([]);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [hasEntry, setHasEntry]   = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [barsIn, setBarsIn]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showNewEntry, setShowNewEntry] = useState(false);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("carbon_user");
    if (!stored) { router.push("/login"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (userId: string) => {
    try {
      setLoading(true);

      const [latestRes, histRes, goalRes, profileRes] = await Promise.all([
  fetch(`${API}/emissions/${userId}/latest`, { credentials: 'include' }), // ✅
  fetch(`${API}/emissions/${userId}`,        { credentials: 'include' }), // ✅
  fetch(`${API}/goals/${userId}`,            { credentials: 'include' }), // ✅
  fetch(`${API}/profile/${userId}`,          { credentials: 'include' }), // ✅
]);

      if (latestRes.status === 404) {
        setHasEntry(false);
        setLoading(false);
        return;
      }
      if (!latestRes.ok) throw new Error("Server error");

      setLatest(await latestRes.json());
      setHasEntry(true);
      if (histRes.ok)    setHistory(await histRes.json());
      if (goalRes.ok)    setGoals(await goalRes.json());
      if (profileRes.ok) setProfile(await profileRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchAll(user._id); }, [user, fetchAll]);
  useEffect(() => {
    if (!loading && hasEntry) {
      const t = setTimeout(() => setBarsIn(true), 200);
      return () => clearTimeout(t);
    }
  }, [loading, hasEntry]);

  async function handleLogout() {
  await fetch(`${API}/users/logout`, {
    method:      'POST',
    credentials: 'include',
  });
  localStorage.removeItem('carbon_user');
  router.push('/login');
}
  function handleNewEntry() { router.push("/calculator"); }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="dash-shell">
      <div className="dash-loading"><div className="dash-spinner" /><span>Loading Carbon Ledger…</span></div>
    </div>
  );

  // ── Derived ────────────────────────────────────────────────────────────────
  const total   = latest?.totalKgPerYear ?? 0;
  const avg     = latest?.globalAverageKg ?? 4800;
  const pct     = pctVsAvg(total, avg);
  const isGreen = pct >= 0;

  const cats = latest ? [
    { key: "transport", kg: latest.transportKg ?? 0 },
    { key: "energy",    kg: latest.energyKg    ?? 0 },
    { key: "diet",      kg: latest.dietKg      ?? 0 },
    { key: "shopping",  kg: latest.shoppingKg  ?? 0 },
  ] : [];

  const biggestCat = cats.length ? cats.reduce((a, b) => a.kg > b.kg ? a : b) : null;
  const maxKg = Math.max(...cats.map((c) => c.kg), 1);

  const prev  = history[1]?.totalKgPerYear ?? null;
  const delta = prev ? total - prev : null;

  const activeGoals  = goals.filter((g) => g.status === "active");
  const achievedGoals = goals.filter((g) => g.status === "achieved");

  return (
    <>
      {showNewEntry && (
        <NewEntryModal
          onClose={() => setShowNewEntry(false)}
          onSubmit={handleNewEntry}
          loading={false}
        />
      )}

      <div className="dash-shell">
        <div className="dash-inner">

          {/* ── Topbar ── */}
          <div className="dash-topbar">
            <div className="dash-brand">
              <div className="dash-leaf">🌿</div>
              <div>
                <h1>Carbon Ledger</h1>
                <p>Personal emission tracker — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <div className="dash-topright">
              {hasEntry && delta !== null && (
                <span className={delta < 0 ? "dash-badge-green" : "dash-badge-red"}>
                  {delta < 0 ? "↘" : "↗"} {delta < 0 ? "−" : "+"}{fmtT(Math.abs(delta))} vs last entry
                </span>
              )}
              {hasEntry && (
                <button className="dash-btn-accent" onClick={() => setShowNewEntry(true)}>
                  + New Entry
                </button>
              )}
              {user && (
                <button className="dash-avatar-wrap" onClick={() => router.push("/dashboard/profile")} title="View profile">
                  <div className="dash-avatar">{initials(user.username)}</div>
                  {user.username}
                </button>
              )}
              <button className="dash-btn" onClick={handleLogout}>Sign out</button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && <div className="dash-error">⚠️ {error} — check your Express server is running on port 8000.</div>}

          {/* ── Welcome gate ── */}
          {!hasEntry ? (
            <WelcomeGate username={user?.username ?? "there"} onStart={() => router.push("/calculator")} />
          ) : (
            <>
              {/* ── Metric cards ── */}
              <div className="dash-metric-grid">
                {[
                  { cls: "green", icon: "🌍", bg: "#dcfce7", label: "Total CO₂e",  value: fmtT(total), delta: delta !== null ? (delta < 0 ? `↘ −${fmtT(Math.abs(delta))} vs last` : `↗ +${fmtT(delta)} vs last`) : "First entry", deltaType: delta !== null ? (delta < 0 ? "down" : "up") : "flat" },
                  { cls: "blue",  icon: "🚗", bg: "#dbeafe", label: "Transport",   value: fmtT(latest?.transportKg ?? 0), delta: `${Math.round(((latest?.transportKg ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "amber", icon: "⚡", bg: "#fef3c7", label: "Energy",      value: fmtT(latest?.energyKg    ?? 0), delta: `${Math.round(((latest?.energyKg    ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "rose",  icon: "🥗", bg: "#ffe4e6", label: "Diet",        value: fmtT(latest?.dietKg      ?? 0), delta: `${Math.round(((latest?.dietKg      ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "cyan",  icon: "🛍️", bg: "#fdf4ff", label: "Shopping",   value: fmtT(latest?.shoppingKg  ?? 0), delta: `${Math.round(((latest?.shoppingKg  ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                ].map((m) => (
                  <div key={m.label} className={`dash-metric ${m.cls}`}>
                    <div className="dash-m-icon" style={{ background: m.bg }}>{m.icon}</div>
                    <div className="dash-m-label">{m.label}</div>
                    <div className="dash-m-value">{m.value.replace("t", "")}<span className="dash-m-unit">t</span></div>
                    <div className={`dash-m-delta ${m.deltaType}`}>{m.delta}</div>
                  </div>
                ))}
              </div>

              {/* ── Tabs ── */}
              <div className="dash-tabs">
                {(["overview", "history", "goals"] as ActiveTab[]).map((t) => (
                  <button key={t} className={`dash-tab${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)}>
                    {t === "goals" && activeGoals.length > 0
                      ? `Goals (${activeGoals.length})`
                      : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* ══ OVERVIEW TAB ══ */}
              {activeTab === "overview" && (
                <>
                  <div className="dash-main-row">
                    {/* Breakdown bars */}
                    <div className="dash-card">
                      <div className="dash-card-hd">
                        <span className="dash-card-title">Breakdown by category</span>
                        <span className="dash-card-hint">as of {fmtDate(latest?.createdAt ?? "")}</span>
                      </div>
                      {cats.map((c) => (
                        <div key={c.key} className="dash-bar-row">
                          <span className="dash-bar-label">{CAT_META[c.key].label}</span>
                          <div className="dash-bar-track">
                            <div className="dash-bar-fill" style={{ width: barsIn ? `${(c.kg / maxKg) * 100}%` : "0%", background: CAT_META[c.key].color }} />
                          </div>
                          <span className="dash-bar-val">{fmtT(c.kg)}</span>
                        </div>
                      ))}
                      {biggestCat && (
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-text-muted)" }}>
                          <strong style={{ color: "var(--dash-text-primary)" }}>Biggest source:</strong> {CAT_META[biggestCat.key].label} ({fmtT(biggestCat.kg)})
                        </div>
                      )}
                    </div>

                    {/* Donut + vs avg */}
                    <div className="dash-card">
                      <div className="dash-card-hd"><span className="dash-card-title">Share by category</span></div>
                      <div className="dash-donut-wrap">
                        <DonutChart entry={latest!} />
                        <div className="dash-legend">
                          {cats.map((c) => (
                            <div key={c.key} className="dash-legend-item">
                              <div className="dash-legend-dot" style={{ background: CAT_META[c.key].color }} />
                              {CAT_META[c.key].label} — {Math.round((c.kg / total) * 100)}%
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ paddingTop: ".8rem", borderTop: "1px solid var(--dash-border)" }}>
                        <div className="dash-vs-label">vs. global average ({fmtT(avg)})</div>
                        <div className="dash-vs-track">
                          <div className="dash-vs-fill" style={{ width: barsIn ? `${Math.min(Math.abs(pct), 100)}%` : "0%", background: isGreen ? "#22c55e" : "#f43f5e", transition: "width 1.2s ease" }} />
                        </div>
                        <div className="dash-vs-text" style={{ color: isGreen ? "#15803d" : "#dc2626" }}>
                          {isGreen ? `${pct}% below` : `${Math.abs(pct)}% above`} global average
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dash-bottom-row">
                    {/* Tips */}
                    <div className="dash-card">
                      <div className="dash-card-hd">
                        <span className="dash-card-title">Personalised tips</span>
                        <span className="dash-card-hint">based on your data</span>
                      </div>
                      {[...cats].sort((a, b) => b.kg - a.kg).slice(0, 3).map((c) => (
                        <div key={c.key} className="dash-tip">
                          <span style={{ fontSize: 16 }}>{CAT_META[c.key].icon}</span>
                          <span><strong>{CAT_META[c.key].label}:</strong> {TIPS[c.key]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Climate budget */}
                    <div className="dash-card">
                      <div className="dash-card-hd"><span className="dash-card-title">Climate budget context</span></div>
                      {[
                        { label: "Your footprint",      kg: total, color: isGreen ? "#22c55e" : "#f43f5e" },
                        { label: "Global average",      kg: avg,   color: "#9ca3af" },
                        { label: "1.5°C target (2030)", kg: 2300,  color: "#3b82f6" },
                      ].map((r) => (
                        <div key={r.label} className="dash-bar-row">
                          <span className="dash-bar-label" style={{ width: 120 }}>{r.label}</span>
                          <div className="dash-bar-track">
                            <div className="dash-bar-fill" style={{ width: barsIn ? `${Math.min((r.kg / 8000) * 100, 100)}%` : "0%", background: r.color }} />
                          </div>
                          <span className="dash-bar-val">{fmtT(r.kg)}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: "1rem", fontSize: 11, color: "var(--dash-text-muted)", lineHeight: 1.5 }}>
                        The IPCC 1.5°C-compatible budget is ~2.3t CO₂e/person/year by 2030.{" "}
                        {total <= 2300
                          ? "You are already within budget — great work!"
                          : `You need to reduce by ${fmtT(total - 2300)} to reach the target.`}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ══ HISTORY TAB ══ */}
              {activeTab === "history" && (
                <div className="dash-card">
                  <div className="dash-card-hd">
                    <span className="dash-card-title">Emission trend</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="dash-card-hint">{history.length} submission{history.length !== 1 ? "s" : ""}</span>
                      <button className="dash-btn-accent" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => router.push("/calculator")}>
                        + New entry
                      </button>
                    </div>
                  </div>
                  <div style={{ marginBottom: "1.2rem" }}>
                    <Sparkline history={history} />
                  </div>
                  {history.length === 0 ? (
                    <p className="dash-empty">No history yet.</p>
                  ) : (
                    history.map((e, i) => {
                      const prevKg = history[i + 1]?.totalKgPerYear ?? null;
                      const d = prevKg !== null ? e.totalKgPerYear - prevKg : null;
                      return (
                        <div key={e._id} className="dash-hist-row">
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--dash-text-primary)" }}>{fmtDate(e.createdAt)}</div>
                            <div style={{ fontSize: 11, color: "var(--dash-text-muted)", marginTop: 2 }}>
                              {i === 0 ? "Latest entry" : `Entry ${history.length - i}`}
                            </div>
                          </div>
                          {/* Mini breakdown */}
                          <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--dash-text-muted)" }}>
                            {[
                              { key: "transport", kg: e.transportKg },
                              { key: "energy",    kg: e.energyKg },
                              { key: "diet",      kg: e.dietKg },
                              { key: "shopping",  kg: e.shoppingKg },
                            ].map((c) => (
                              <span key={c.key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span>{CAT_META[c.key].icon}</span>
                                <span>{fmtT(c.kg ?? 0)}</span>
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--dash-text-primary)" }}>
                            {fmtT(e.totalKgPerYear)}
                          </div>
                          {d !== null && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: d < 0 ? "#16a34a" : "#dc2626" }}>
                              {d < 0 ? "↘" : "↗"} {d < 0 ? "−" : "+"}{fmtT(Math.abs(d))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ══ GOALS TAB ══ */}
              {activeTab === "goals" && (
                <div className="dash-bottom-row" style={{ alignItems: "start" }}>
                  <div className="dash-card">
                    <div className="dash-card-hd">
                      <span className="dash-card-title">Active goals</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="dash-card-hint">{activeGoals.length} active · {achievedGoals.length} achieved</span>
                        <button className="dash-btn-accent" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => router.push("/dashboard/goals")}>
                          Manage →
                        </button>
                      </div>
                    </div>
                    {goals.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                        <p style={{ fontSize: 13, color: "var(--dash-text-muted)", marginBottom: 12 }}>
                          No goals set yet. Create your first reduction goal to start tracking progress.
                        </p>
                        <button className="dash-btn-primary" style={{ fontSize: 13, padding: "9px 20px" }} onClick={() => router.push("/dashboard/goals")}>
                          Create a goal →
                        </button>
                      </div>
                    ) : (
                      goals.filter((g) => g.status !== "cancelled").map((g) => {
                        const meta = CAT_META[g.category] ?? CAT_META.transport;
                        const pctDone = Math.min(g.latestPctAchieved, 100);
                        const overdue = new Date(g.deadline) < new Date() && g.status === "active";
                        return (
                          <div key={g._id} className="dash-goal-row">
                            <div className="dash-goal-label-row">
                              <span className="dash-goal-name">
                                <span className="dash-cat-pill" style={{ background: meta.bg, color: meta.color, marginRight: 6 }}>
                                  {meta.icon} {meta.label}
                                </span>
                                {g.title}
                              </span>
                              <span className="dash-goal-meta">{pctDone}%</span>
                            </div>
                            <div className="dash-goal-track">
                              <div className="dash-goal-fill" style={{ width: barsIn ? `${pctDone}%` : "0%", background: pctDone >= 100 ? "#22c55e" : meta.color }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                              <span style={{ fontSize: 11, color: "var(--dash-text-muted)" }}>
                                Target: {fmtT(g.targetKg)} by {fmtDate(g.deadline)}
                              </span>
                              {overdue && <span style={{ fontSize: 11, color: "#dc2626" }}>Overdue</span>}
                              {g.status === "achieved" && <span style={{ fontSize: 11, color: "#16a34a" }}>✓ Achieved</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Suggested goals */}
                  <div className="dash-card">
                    <div className="dash-card-hd">
                      <span className="dash-card-title">Suggested goals</span>
                      <span className="dash-card-hint">based on your footprint</span>
                    </div>
                    {[...cats].sort((a, b) => b.kg - a.kg).slice(0, 3).map((c) => {
                      const meta = CAT_META[c.key];
                      return (
                        <div key={c.key} className="dash-tip" style={{ flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 15 }}>{meta.icon}</span>
                              <strong style={{ fontSize: 12, color: "var(--dash-text-primary)" }}>Cut {meta.label.toLowerCase()} by 20%</strong>
                            </div>
                            <button
                              className="dash-btn"
                              style={{ fontSize: 11, padding: "3px 10px" }}
                              onClick={() => router.push(`/dashboard/goals?suggest=${c.key}&kg=${c.kg}`)}
                            >
                              Set goal
                            </button>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--dash-text-muted)" }}>
                            Would save ~{fmtT(c.kg * 0.2)} — from {fmtT(c.kg)} → {fmtT(c.kg * 0.8)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}