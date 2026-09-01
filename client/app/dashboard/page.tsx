"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./dashboard.css";
import { apiFetch, AuthExpiredError, avatarUrl } from "../lib/api";
import CarbonIcon from "../components/CarbonIcon";

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
  waterKg: number;
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
  avatar?: string;
}


type ActiveTab = "overview" | "history" | "goals";

// ─── Constants ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CAT_META: Record<string, { label: string; color: string; bg: string; icon: "transport" | "energy" | "diet" | "shopping" | "water" | "globe" }> = {
  transport: { label: "Transport", color: "var(--cat-transport)", bg: "var(--cat-transport-bg)", icon: "transport" },
  energy:    { label: "Energy",    color: "var(--cat-energy)", bg: "var(--cat-energy-bg)", icon: "energy" },
  diet:      { label: "Diet",      color: "var(--cat-diet)", bg: "var(--cat-diet-bg)", icon: "diet" },
  shopping:  { label: "Shopping",  color: "var(--cat-shopping)", bg: "var(--cat-shopping-bg)", icon: "shopping" },
  water:     { label: "Water",     color: "var(--cat-water)", bg: "var(--cat-water-bg)", icon: "water" },
};

const TIPS: Record<string, string> = {
  transport: "Switch to an EV or public transit to cut your biggest emission source.",
  energy:    "A solar panel or green energy tariff could halve your energy footprint.",
  diet:      "Replacing meat 3× per week can save up to 0.5t CO₂e per year.",
  shopping:  "Buying second-hand and keeping devices longer slashes embodied carbon.",
  water:     "Shorter showers and a solar or heat-pump water heater cut this footprint fast.",
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

function goalCurrentKg(goal: Goal, entry: EmissionEntry | null) {
  if (!entry) return goal.latestKg ?? null;
  const values: Record<string, number> = {
    transport: entry.transportKg,
    energy: entry.energyKg,
    diet: entry.dietKg,
    shopping: entry.shoppingKg,
    water: entry.waterKg,
    overall: entry.totalKgPerYear,
  };
  return values[goal.category] ?? goal.latestKg ?? null;
}

function goalProgress(goal: Goal, currentKg: number | null) {
  if (currentKg === null) return 0;
  const denom = goal.baselineKg - goal.targetKg;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((goal.baselineKg - currentKg) / denom) * 100)));
}

function goalIsRegression(goal: Goal, currentKg: number | null) {
  return currentKg !== null && currentKg > goal.baselineKg;
}


// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ entry }: { entry: EmissionEntry }) {
  const cats = [
    { key: "transport", kg: entry.transportKg ?? 0 },
    { key: "energy", kg: entry.energyKg ?? 0 },
    { key: "diet", kg: entry.dietKg ?? 0 },
    { key: "shopping", kg: entry.shoppingKg ?? 0 },
    { key: "water", kg: entry.waterKg ?? 0 },
  ];
  const total = cats.reduce((s, c) => s + c.kg, 0) || 1;
  let cursor = 0;
  const stops = cats.flatMap((c) => {
    const start = cursor;
    const end = cursor + (c.kg / total) * 360;
    cursor = end;
    const color = CAT_META[c.key].color;
    const gap = Math.min(1.4, Math.max(0.45, (end - start) * 0.035));
    return [`${color} ${start + gap}deg ${Math.max(start + gap, end - gap)}deg`, `transparent ${Math.max(start + gap, end - gap)}deg ${end}deg`];
  });
  return (
    <div className="dash-donut-orbit" aria-label={`Carbon share: ${(total / 1000).toFixed(1)} tonnes CO₂e per year`}>
      <div className="dash-donut-ring" style={{ background: `conic-gradient(from -90deg, ${stops.join(", ")})` }}>
        <div className="dash-donut-hole">
          <strong>{(total / 1000).toFixed(1)}t</strong>
          <span>CO₂e / yr</span>
        </div>
      </div>
      <div className="dash-donut-ticks" aria-hidden="true" />
    </div>
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
      <path d={d} fill="none" stroke={trend ? "var(--chart-good)" : "var(--chart-bad)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(vals.length - 1)} cy={py(vals[vals.length - 1])} r="4" fill={trend ? "var(--chart-good)" : "var(--chart-bad)"} />
    </svg>
  );
}

// ─── Welcome gate ─────────────────────────────────────────────────────────────

function WelcomeGate({ username, onStart }: { username: string; onStart: () => void }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 20, padding: "2rem 1rem" }}>
      <div className="dash-welcome-mark"><CarbonIcon name="leaf" size={34} /></div>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--dash-text-primary)", margin: 0 }}>
        Welcome to Carbon Ledger, {username}
      </h2>
      <p style={{ fontSize: 14, color: "var(--dash-text-muted)", maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
        Your dashboard is waiting — but first, complete your carbon footprint assessment. It takes about 3 minutes and covers transport, energy, diet, shopping, and water.
      </p>
      <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {["transport", "energy", "diet", "shopping", "water"].map((key) => (
          <span key={key} className="dash-welcome-tag"><CarbonIcon name={CAT_META[key].icon as any} size={14} /> {CAT_META[key].label}</span>
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
  const steps = [
    { icon: "transport", label: "Transport" },
    { icon: "energy", label: "Energy" },
    { icon: "diet", label: "Diet" },
    { icon: "shopping", label: "Shopping" },
    { icon: "water", label: "Water" },
  ];

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dash-modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="dash-modal-hero">
          <div className="dash-modal-hero-icon"><CarbonIcon name="chart" size={28} /></div>
        </div>

        <div className="dash-modal-body">
          <h3 className="dash-modal-title">Log a new entry</h3>
          <p className="dash-modal-sub">
            Takes about 3 minutes and updates your dashboard, history, and goal progress.
          </p>

          <div className="dash-modal-steps">
            {steps.map((s) => (
              <div key={s.label} className="dash-modal-step">
                <span className="dash-modal-step-icon"><CarbonIcon name={s.icon as any} size={17} /></span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <div className="dash-modal-actions">
            <button className="dash-btn" onClick={onClose}>Cancel</button>
            <button className="dash-btn-primary" onClick={onSubmit} disabled={loading} style={{ padding: "10px 22px" }}>
              {loading ? "…" : "Go to calculator →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Entry Modal ─────────────────────────────────────────────────────

function DeleteEntryModal({ isLatest, activeGoals, onClose, onConfirm, loading }: {
  isLatest: boolean;
  activeGoals: Goal[];
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const showGoalWarning = isLatest && activeGoals.length > 0;

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dash-modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="dash-modal-hero">
          <div className="dash-modal-hero-icon"><CarbonIcon name="trash" size={28} /></div>
        </div>

        <div className="dash-modal-body">
          <h3 className="dash-modal-title">Delete this entry?</h3>
          <p className="dash-modal-sub">
            This can't be undone. Your dashboard will fall back to your next most recent entry.
          </p>

          {showGoalWarning && (
            <div
              className="dash-delete-warning"
            >
              <CarbonIcon name="warning" size={15} /> This is your latest entry. Deleting it will recalculate progress for{" "}
              <strong>{activeGoals.length}</strong> active goal{activeGoals.length !== 1 ? "s" : ""} against
              whatever entry becomes the new latest.
            </div>
          )}

          <div className="dash-modal-actions">
            <button className="dash-btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className="dash-btn-primary"
              onClick={onConfirm}
              disabled={loading}
              style={{ padding: "10px 22px", background: "var(--chart-bad-text)" }}
            >
              {loading ? "Deleting…" : "Delete entry"}
            </button>
          </div>
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
  const [deleteTarget, setDeleteTarget] = useState<EmissionEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteEntry() {
    if (!deleteTarget || !user) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/emissions/${deleteTarget._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete entry");
      setDeleteTarget(null);
      await fetchAll(user._id); // refetch — dashboard/goals fall back to the new latest entry automatically
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete entry");
    } finally {
      setDeleting(false);
    }
  }

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
  apiFetch(`/emissions/${userId}/latest`),
  apiFetch(`/emissions/${userId}`),
  apiFetch(`/goals/${userId}`),
  apiFetch(`/profile/${userId}`),
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
      if (e instanceof AuthExpiredError) return; // apiFetch is already redirecting to /login
      setError(e instanceof Error ? e.message : "Failed to reach server");
    } finally {
      setLoading(false);
    }
  }, []);
  async function waitForServer(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}/health`, { credentials: 'include' });
      if (res.ok) return; // server is up
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error("Server took too long to respond");
}

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
    { key: "water",     kg: latest.waterKg     ?? 0 },
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
      {deleteTarget && (
  <DeleteEntryModal
    isLatest={history[0]?._id === deleteTarget._id}
    activeGoals={activeGoals}
    onClose={() => setDeleteTarget(null)}
    onConfirm={handleDeleteEntry}
    loading={deleting}
  />
)}

      <div className="dash-shell">
        <div className="dash-inner">

          {/* ── Topbar ── */}
          <div className="dash-topbar">
            <div className="dash-brand">
              <div className="dash-leaf"><CarbonIcon name="leaf" size={22} /></div>
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
                  <div className="dash-avatar" style={{ overflow: "hidden", padding: 0 }}>
                    {profile?.avatar ? (
                      <img src={avatarUrl(profile.avatar)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                    ) : (
                      initials(user.username)
                    )}
                  </div>
                  {user.username}
                </button>
              )}
              <button className="dash-btn" onClick={handleLogout}>Sign out</button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && <div className="dash-error"><CarbonIcon name="warning" size={16} /> {error} — check your Express server is running on port 8000.</div>}

          {/* ── Welcome gate ── */}
          {!hasEntry ? (
            <WelcomeGate username={user?.username ?? "there"} onStart={() => router.push("/calculator")} />
          ) : (
            <>
              {/* ── Metric cards ── */}
              <div className="dash-metric-grid">
                {[
                  { cls: "green", icon: "globe", bg: "var(--paper-2)", label: "Total CO₂e",  value: fmtT(total), delta: delta !== null ? (delta < 0 ? `↘ −${fmtT(Math.abs(delta))} vs last` : `↗ +${fmtT(delta)} vs last`) : "First entry", deltaType: delta !== null ? (delta < 0 ? "down" : "up") : "flat" },
                  { cls: "blue",  icon: "transport", bg: "var(--cat-transport-bg)", label: "Transport",   value: fmtT(latest?.transportKg ?? 0), delta: `${Math.round(((latest?.transportKg ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "amber", icon: "energy", bg: "var(--cat-energy-bg)", label: "Energy",      value: fmtT(latest?.energyKg    ?? 0), delta: `${Math.round(((latest?.energyKg    ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "rose",  icon: "diet", bg: "var(--cat-diet-bg)", label: "Diet",        value: fmtT(latest?.dietKg      ?? 0), delta: `${Math.round(((latest?.dietKg      ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "cyan",  icon: "shopping", bg: "var(--cat-shopping-bg)", label: "Shopping",   value: fmtT(latest?.shoppingKg  ?? 0), delta: `${Math.round(((latest?.shoppingKg  ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                  { cls: "teal",  icon: "water", bg: "var(--cat-water-bg)", label: "Water",      value: fmtT(latest?.waterKg     ?? 0), delta: `${Math.round(((latest?.waterKg     ?? 0) / total) * 100)}% of total`, deltaType: "flat" },
                ].map((m) => (
                  <div key={m.label} className={`dash-metric ${m.cls}`}>
                    <div className="dash-m-icon" style={{ background: m.bg }}><CarbonIcon name={m.icon as any} size={19} /></div>
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
                          <div className="dash-vs-fill" style={{ width: barsIn ? `${Math.min(Math.abs(pct), 100)}%` : "0%", background: isGreen ? "var(--chart-good)" : "var(--chart-bad)", transition: "width 1.2s ease" }} />
                        </div>
                        <div className="dash-vs-text" style={{ color: isGreen ? "var(--chart-good-text)" : "var(--chart-bad-text)" }}>
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
                          <span className="dash-tip-icon"><CarbonIcon name={CAT_META[c.key].icon as any} size={17} /></span>
                          <span><strong>{CAT_META[c.key].label}:</strong> {TIPS[c.key]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Climate budget */}
                    <div className="dash-card dash-budget-card">
                      <div className="dash-card-hd"><span className="dash-card-title">Climate budget context</span></div>
                      {[
                        { label: "Your footprint",      kg: total, color: isGreen ? "var(--chart-good)" : "var(--chart-bad)" },
                        { label: "Global average",      kg: avg,   color: "var(--chart-neutral)" },
                        { label: "1.5°C target (2030)", kg: 2300,  color: "var(--chart-target)" },
                      ].map((r) => (
                        <div key={r.label} className="dash-bar-row">
                          <span className="dash-bar-label">{r.label}</span>
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
                          <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--dash-text-muted)", flexWrap: "wrap" }}>
                            {[
                              { key: "transport", kg: e.transportKg },
                              { key: "energy",    kg: e.energyKg },
                              { key: "diet",      kg: e.dietKg },
                              { key: "shopping",  kg: e.shoppingKg },
                              { key: "water",     kg: e.waterKg },
                            ].map((c) => (
                              <span key={c.key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span><CarbonIcon name={CAT_META[c.key].icon as any} size={13} /></span>
                                <span>{fmtT(c.kg ?? 0)}</span>
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--dash-text-primary)" }}>
                            {fmtT(e.totalKgPerYear)}
                          </div>
                          {/* Fixed grid cell — always rendered so alignment holds even for
                              the oldest entry, which has no prior entry to diff against */}
                          {d !== null ? (
  <div style={{ fontSize: 12, fontWeight: 600, color: d < 0 ? "var(--chart-good-text)" : "var(--chart-bad-text)" }}>
    {d < 0 ? "↘" : "↗"} {d < 0 ? "−" : "+"}{fmtT(Math.abs(d))}
  </div>
) : <div />}
<button
  onClick={() => setDeleteTarget(e)}
  title="Delete entry"
  style={{
    background: "none", border: "none", cursor: "pointer",
    color: "var(--dash-text-muted)", fontSize: 13, padding: "4px 6px",
    borderRadius: 6, transition: "background .15s, color .15s",
  }}
  onMouseEnter={(ev) => { ev.currentTarget.style.background = "var(--danger-bg)"; ev.currentTarget.style.color = "var(--chart-bad-text)"; }}
  onMouseLeave={(ev) => { ev.currentTarget.style.background = "none"; ev.currentTarget.style.color = "var(--dash-text-muted)"; }}
>
  <CarbonIcon name="trash" size={15} />
</button>
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
                        <div className="dash-goal-empty-icon"><CarbonIcon name="chart" size={24} /></div>
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
                        const currentKg = goalCurrentKg(g, latest);
                        const pctDone = goalProgress(g, currentKg);
                        const regression = goalIsRegression(g, currentKg);
                        const overdue = new Date(g.deadline) < new Date() && g.status === "active";
                        return (
                          <div key={g._id} className="dash-goal-row">
                            <div className="dash-goal-label-row">
                              <span className="dash-goal-name">
                                <span className="dash-cat-pill" style={{ background: meta.bg, color: meta.color, marginRight: 6 }}>
                                  <CarbonIcon name={meta.icon as any} size={13} /> {meta.label}
                                </span>
                                {g.title}
                              </span>
                              <span className={`dash-goal-meta ${regression ? "is-regression" : ""}`}>
                                {regression ? "0% · above baseline" : `${pctDone}%`}
                              </span>
                            </div>
                            <div className={`dash-goal-track ${regression ? "is-regression" : ""}`}>
                              <div className="dash-goal-fill" style={{ width: barsIn ? `${pctDone}%` : "0%", background: g.status === "achieved" ? "#1f6f68" : meta.color }} />
                            </div>
                            <div className="dash-goal-status-row">
                              <span>Target: {fmtT(g.targetKg)} by {fmtDate(g.deadline)}</span>
                              {regression && currentKg !== null && (
                                <span className="dash-goal-regression">↑ {fmtT(currentKg - g.baselineKg)} above baseline</span>
                              )}
                              {!regression && overdue && <span className="dash-goal-regression">Overdue</span>}
                              {!regression && g.status === "achieved" && <span className="dash-goal-achieved">✓ Achieved</span>}
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
                              <span style={{ fontSize: 15 }}><CarbonIcon name={meta.icon as any} size={15} /></span>
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