"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./goal.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  progressHistory: { date: string; currentKg: number; pctAchieved: number }[];
  createdAt: string;
}

interface EmissionEntry {
  transportKg: number;
  energyKg: number;
  dietKg: number;
  shoppingKg: number;
  totalKgPerYear: number;
}

interface NewGoalForm {
  category: string;
  title: string;
  targetReductionPct: number;
  deadline: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  transport: { label: "Transport", color: "#3b82f6", bg: "#dbeafe", icon: "🚗" },
  energy:    { label: "Energy",    color: "#f59e0b", bg: "#fef3c7", icon: "⚡" },
  diet:      { label: "Diet",      color: "#22c55e", bg: "#dcfce7", icon: "🥗" },
  shopping:  { label: "Shopping",  color: "#f43f5e", bg: "#ffe4e6", icon: "🛍️" },
  overall:   { label: "Overall",   color: "#8b5cf6", bg: "#ede9fe", icon: "🌍" },
};

function fmtT(kg: number) { return (kg / 1000).toFixed(2) + "t"; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysLeft(deadline: string) {
  const d = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  return d;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onCancel,
}: {
  goal: Goal;
  onCancel: (id: string) => void;
}) {
  const meta   = CAT_META[goal.category] ?? CAT_META.overall;
  const pct    = Math.min(goal.latestPctAchieved, 100);
  const days   = daysLeft(goal.deadline);
  const overdue = days < 0 && goal.status === "active";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="goal-card" style={{ borderLeft: `3px solid ${meta.color}` }}>
      <div className="goal-card-top">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <span className="goal-pill" style={{ background: meta.bg, color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
          {goal.status === "achieved" && <span className="goal-badge-achieved">✓ Achieved</span>}
          {overdue && <span className="goal-badge-overdue">Overdue</span>}
          {goal.status === "cancelled" && <span className="goal-badge-cancelled">Cancelled</span>}
        </div>
        {goal.status === "active" && (
          <button className="goal-cancel-btn" onClick={() => onCancel(goal._id)} title="Cancel goal">✕</button>
        )}
      </div>

      <div className="goal-title">{goal.title}</div>

      <div className="goal-progress-row">
        <div className="goal-track">
          <div
            className="goal-fill"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? "#22c55e" : meta.color,
            }}
          />
        </div>
        <span className="goal-pct">{pct}%</span>
      </div>

      <div className="goal-meta-row">
        <span>Baseline: {fmtT(goal.baselineKg)}</span>
        <span>Target: {fmtT(goal.targetKg)} (−{goal.targetReductionPct}%)</span>
        <span>
          {goal.status === "active"
            ? overdue
              ? `${Math.abs(days)}d overdue`
              : `${days}d left`
            : `Deadline: ${fmtDate(goal.deadline)}`}
        </span>
      </div>

      {goal.progressHistory.length > 0 && (
        <button className="goal-expand-btn" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Hide" : "Show"} progress history ({goal.progressHistory.length})
        </button>
      )}

      {expanded && (
        <div className="goal-history">
          {[...goal.progressHistory].reverse().map((p, i) => (
            <div key={i} className="goal-history-row">
              <span>{fmtDate(p.date)}</span>
              <span>{fmtT(p.currentKg)}</span>
              <span style={{ color: p.pctAchieved >= 100 ? "#16a34a" : "#6b7280" }}>{Math.min(p.pctAchieved, 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId]   = useState<string | null>(null);
  const [goals, setGoals]     = useState<Goal[]>([]);
  const [latest, setLatest]   = useState<EmissionEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Pre-fill from URL params (coming from dashboard "Set goal" buttons)
  const suggestCat = searchParams.get("suggest") ?? "overall";
  const [form, setForm] = useState<NewGoalForm>({
    category: suggestCat,
    title: "",
    targetReductionPct: 20,
    deadline: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0], // 90 days default
  });

  useEffect(() => {
    const stored = localStorage.getItem("carbon_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setUserId(u._id);
    if (searchParams.get("suggest")) setShowForm(true);
  }, [router, searchParams]);

  const fetchData = useCallback(async (uid: string) => {
    try {
      setLoading(true);
      const [goalRes, latestRes] = await Promise.all([
  fetch(`${API}/goals/${uid}`,            { credentials: 'include' }), // ✅
  fetch(`${API}/emissions/${uid}/latest`, { credentials: 'include' }), // ✅
]);
      if (goalRes.ok)   setGoals(await goalRes.json());
      if (latestRes.ok) setLatest(await latestRes.json());
    } catch { setError("Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (userId) fetchData(userId); }, [userId, fetchData]);

  // Derive baseline from category selection
  function baselineForCategory(cat: string): number {
    if (!latest) return 0;
    switch (cat) {
      case "transport": return latest.transportKg;
      case "energy":    return latest.energyKg;
      case "diet":      return latest.dietKg;
      case "shopping":  return latest.shoppingKg;
      case "overall":   return latest.totalKgPerYear;
      default:          return 0;
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    const baselineKg = baselineForCategory(form.category);
    if (baselineKg === 0) {
      setError("No emission data found for that category. Submit a calculator entry first.");
      return;
    }

    const targetKg = baselineKg * (1 - form.targetReductionPct / 100);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/goals`, {
  method:      'POST',
  headers:     { 'Content-Type': 'application/json' },
  credentials: 'include',                                               // ✅
  body: JSON.stringify({
  userId,
  category: form.category,
  title: form.title || `Cut ${CAT_META[form.category]?.label ?? form.category} by ${form.targetReductionPct}%`,
  baselineKg,
  targetReductionPct: form.targetReductionPct,
  targetKg,
  deadline: new Date(form.deadline).toISOString(),
}),
});
      if (!res.ok) throw new Error("Failed to create goal");
      setShowForm(false);
      setForm({ category: "overall", title: "", targetReductionPct: 20, deadline: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0] });
      fetchData(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    if (!userId || !confirm("Cancel this goal?")) return;
    try {
      await fetch(`${API}/goals/${id}`, {
  method:      'PATCH',
  headers:     { 'Content-Type': 'application/json' },
  credentials: 'include',                                               // ✅
  body:        JSON.stringify({ status: 'cancelled' }),
});
      fetchData(userId);
    } catch { setError("Failed to cancel goal"); }
  }

  const activeGoals   = goals.filter((g) => g.status === "active");
  const achievedGoals = goals.filter((g) => g.status === "achieved");
  const missedGoals   = goals.filter((g) => g.status === "missed" || (g.status === "cancelled"));
  const baseline      = baselineForCategory(form.category);
  const targetKgPreview = baseline * (1 - form.targetReductionPct / 100);

  return (
    <div className="goals-shell">
      <div className="goals-inner">

        {/* Topbar */}
        <div className="goals-topbar">
          <div className="goals-brand">
            <div className="goals-leaf">🌿</div>
            <span className="goals-brand-name">Carbon Ledger</span>
          </div>
          <button className="goals-back" onClick={() => router.push("/dashboard")}>← Dashboard</button>
        </div>

        <div className="goals-header">
          <div className="goals-title">🎯 Reduction Goals</div>
          <div className="goals-sub">Set targets, track progress, build better habits</div>
        </div>

        {/* Stats */}
        <div className="goals-stats">
          <div className="goals-stat">
            <div className="goals-stat-num">{activeGoals.length}</div>
            <div className="goals-stat-lbl">Active</div>
          </div>
          <div className="goals-stat">
            <div className="goals-stat-num" style={{ color: "#16a34a" }}>{achievedGoals.length}</div>
            <div className="goals-stat-lbl">Achieved</div>
          </div>
          <div className="goals-stat">
            <div className="goals-stat-num">{missedGoals.length}</div>
            <div className="goals-stat-lbl">Missed / Cancelled</div>
          </div>
        </div>

        {error && <div className="goals-error">⚠️ {error}</div>}

        {/* New goal form */}
        {showForm ? (
          <div className="goals-form-card">
            <div className="goals-form-title">Create a new goal</div>
            <form onSubmit={handleCreate}>
              <div className="gf-row">
                <div className="gf-field">
                  <label className="gf-label">Category</label>
                  <select className="gf-select" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {Object.entries(CAT_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="gf-field">
                  <label className="gf-label">Reduction target</label>
                  <select className="gf-select" value={form.targetReductionPct} onChange={(e) => setForm((p) => ({ ...p, targetReductionPct: Number(e.target.value) }))}>
                    {[10, 15, 20, 25, 30, 40, 50].map((v) => (
                      <option key={v} value={v}>{v}% reduction</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="gf-field">
                <label className="gf-label">Goal title (optional)</label>
                <input
                  className="gf-input" type="text" placeholder={`Cut ${CAT_META[form.category]?.label ?? form.category} by ${form.targetReductionPct}%`}
                  value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  maxLength={120}
                />
              </div>

              <div className="gf-field">
                <label className="gf-label">Deadline</label>
                <input className="gf-input" type="date" value={form.deadline}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))} required />
              </div>

              {baseline > 0 && (
                <div className="gf-preview">
                  <strong>Preview:</strong> Reduce {CAT_META[form.category]?.label} from{" "}
                  <strong>{fmtT(baseline)}</strong> → <strong>{fmtT(targetKgPreview)}</strong>{" "}
                  (saving <strong>{fmtT(baseline - targetKgPreview)}</strong> CO₂e/yr)
                </div>
              )}

              {baseline === 0 && (
                <div className="gf-preview" style={{ color: "#dc2626" }}>
                  ⚠️ No emission data for this category yet. Complete a calculator entry first.
                </div>
              )}

              <div className="gf-actions">
                <button type="button" className="gf-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="gf-submit-btn" disabled={saving || baseline === 0}>
                  {saving ? "Creating…" : "Create goal"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="goals-section-hd" style={{ marginBottom: "1rem" }}>
            <span />
            <button className="goals-new-btn" onClick={() => setShowForm(true)}>
              + New Goal
            </button>
          </div>
        )}

        {/* Active goals */}
        {loading ? (
          <div className="goals-empty">Loading…</div>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <>
                <div className="goals-section-hd">
                  <span className="goals-section-title">Active ({activeGoals.length})</span>
                </div>
                {activeGoals.map((g) => <GoalCard key={g._id} goal={g} onCancel={handleCancel} />)}
              </>
            )}

            {achievedGoals.length > 0 && (
              <>
                <div className="goals-divider" />
                <div className="goals-section-hd">
                  <span className="goals-section-title" style={{ color: "#16a34a" }}>✓ Achieved ({achievedGoals.length})</span>
                </div>
                {achievedGoals.map((g) => <GoalCard key={g._id} goal={g} onCancel={handleCancel} />)}
              </>
            )}

            {missedGoals.length > 0 && (
              <>
                <div className="goals-divider" />
                <div className="goals-section-hd">
                  <span className="goals-section-title" style={{ color: "#9ca3af" }}>Missed / Cancelled</span>
                </div>
                {missedGoals.map((g) => <GoalCard key={g._id} goal={g} onCancel={handleCancel} />)}
              </>
            )}

            {goals.length === 0 && !showForm && (
              <div className="goals-empty">
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
                No goals yet. Create your first one above!
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}