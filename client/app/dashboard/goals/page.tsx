"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./goal.css";
import { apiFetch, AuthExpiredError } from "../../lib/api";
import CarbonIcon from "../../components/CarbonIcon";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredUser {
  _id: string;
  username: string;
  email: string;
}

interface EmissionEntry {
  _id: string;
  totalKgPerYear: number;
  transportKg: number;
  energyKg: number;
  dietKg: number;
  shoppingKg: number;
  waterKg: number;
  createdAt: string;
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

type Category = "transport" | "energy" | "diet" | "shopping" | "water" | "overall";

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; color: string; bg: string; icon: "transport" | "energy" | "diet" | "shopping" | "water" | "globe" }> = {
  transport: { label: "Transport", color: "var(--cat-transport)", bg: "var(--cat-transport-bg)", icon: "transport" },
  energy:    { label: "Energy",    color: "var(--cat-energy)", bg: "var(--cat-energy-bg)", icon: "energy" },
  diet:      { label: "Diet",      color: "var(--cat-diet)", bg: "var(--cat-diet-bg)", icon: "diet" },
  shopping:  { label: "Shopping",  color: "var(--cat-shopping)", bg: "var(--cat-shopping-bg)", icon: "shopping" },
  water:     { label: "Water",     color: "var(--cat-water)", bg: "var(--cat-water-bg)", icon: "water" },
  overall:   { label: "Overall",   color: "var(--cat-energy)", bg: "var(--cat-energy-bg)", icon: "globe" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtT(kg: number) { return (kg / 1000).toFixed(2) + "t"; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function catKg(entry: EmissionEntry | null, key: Category) {
  if (!entry) return 0;
  if (key === "overall") return entry.totalKgPerYear ?? 0;
  const map: Record<string, number> = {
    transport: entry.transportKg, energy: entry.energyKg, diet: entry.dietKg,
    shopping: entry.shoppingKg, water: entry.waterKg,
  };
  return map[key] ?? 0;
}
function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function GoalsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser]     = useState<StoredUser | null>(null);
  const [latest, setLatest] = useState<EmissionEntry | null>(null);
  const [goals, setGoals]   = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestCat = (searchParams.get("suggest") as Category | null) ?? null;
  const suggestKg  = searchParams.get("kg");

  const [showForm, setShowForm]   = useState(!!suggestCat);
  const [category, setCategory]   = useState<Category>(suggestCat ?? "overall");
  const [pct, setPct]             = useState(20);
  const [baseline, setBaseline]   = useState<number>(suggestKg ? Number(suggestKg) : 0);
  const [deadline, setDeadline]   = useState(defaultDeadline());
  const [title, setTitle]         = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const autoTitle = `Cut ${CAT_META[category].label.toLowerCase()} by ${pct}%`;
  const effectiveTitle = titleTouched ? title : autoTitle;

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("carbon_user");
    if (!stored) { router.push("/login"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // ── Fetch goals + latest entry ──────────────────────────────────────────
  const fetchAll = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      const [goalRes, latestRes] = await Promise.all([
        apiFetch(`/goals/${userId}`),
        apiFetch(`/emissions/${userId}/latest`),
      ]);
      if (goalRes.ok) setGoals(await goalRes.json());
      if (latestRes.ok) setLatest(await latestRes.json());
    } catch (e) {
      if (e instanceof AuthExpiredError) return;
      setError(e instanceof Error ? e.message : "Failed to reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchAll(user._id); }, [user, fetchAll]);

  // If arriving via a "Set goal" suggestion and no kg was given, fall back
  // to the latest entry's figure for that category once it loads.
  useEffect(() => {
    if (suggestCat && !suggestKg && latest) {
      setBaseline(catKg(latest, suggestCat));
    }
  }, [suggestCat, suggestKg, latest]);

  function openNewGoalForm() {
    setCategory("overall");
    setPct(20);
    setBaseline(catKg(latest, "overall"));
    setDeadline(defaultDeadline());
    setTitle("");
    setTitleTouched(false);
    setShowForm(true);
  }

  function handleCategoryChange(next: Category) {
    setCategory(next);
    if (!suggestKg) setBaseline(catKg(latest, next));
  }

  async function handleCreateGoal() {
    if (!user) return;
    if (!baseline || baseline <= 0) { setError("Baseline must be greater than 0"); return; }
    if (pct <= 0 || pct > 100) { setError("Reduction % must be between 1 and 100"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user._id,
          category,
          title: effectiveTitle,
          baselineKg: baseline,
          targetReductionPct: pct,
          deadline,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create goal");
      }
      const { goal } = await res.json();
      setGoals((prev) => [...prev, goal]);
      setShowForm(false);
      router.replace("/dashboard/goals"); // drop ?suggest=&kg= now that it's used
    } catch (e) {
      if (e instanceof AuthExpiredError) return;
      setError(e instanceof Error ? e.message : "Failed to create goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelGoal(id: string) {
    if (!user) return;
    try {
      const res = await apiFetch(`/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel goal");
      setGoals((prev) => prev.filter((g) => g._id !== id));
    } catch (e) {
      if (e instanceof AuthExpiredError) return;
      setError(e instanceof Error ? e.message : "Failed to cancel goal");
    }
  }

  if (loading) {
    return (
      <div className="goals-shell">
        <div className="goals-inner">
          <p className="goals-sub">Loading goals…</p>
        </div>
      </div>
    );
  }

  const activeGoals   = goals.filter((g) => g.status === "active");
  const achievedGoals = goals.filter((g) => g.status === "achieved");
  const avgProgress   = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g, goalCurrentKg(g, latest)), 0) / activeGoals.length)
    : 0;

  return (
    <div className="goals-shell">
      <div className="goals-inner">
        <div className="goals-topbar">
          <div className="goals-brand">
            <div className="goals-leaf"><CarbonIcon name="leaf" size={21} /></div>
            <span className="goals-brand-name">Carbon Ledger</span>
          </div>
          <button className="goals-back" onClick={() => router.push("/dashboard")}>← Back to dashboard</button>
        </div>

        <div className="goals-header">
          <div className="goals-title">Goals</div>
          <div className="goals-sub">Track and manage your emission reduction targets</div>
        </div>

        {error && <div className="goals-error"><CarbonIcon name="warning" size={15} /> {error}</div>}

        <div className="goals-stats">
          <div className="goals-stat">
            <div className="goals-stat-num">{activeGoals.length}</div>
            <div className="goals-stat-lbl">Active</div>
          </div>
          <div className="goals-stat">
            <div className="goals-stat-num">{achievedGoals.length}</div>
            <div className="goals-stat-lbl">Achieved</div>
          </div>
          <div className="goals-stat">
            <div className="goals-stat-num">{avgProgress}%</div>
            <div className="goals-stat-lbl">Avg progress</div>
          </div>
        </div>

        <div className="goals-section-hd">
          <span className="goals-section-title">Your goals</span>
          {!showForm && (
            <button className="goals-new-btn" onClick={openNewGoalForm}>+ New goal</button>
          )}
        </div>

        {showForm && (
          <div className="goals-form-card">
            <div className="goals-form-title">Create a goal</div>

            <div className="gf-row">
              <div className="gf-field">
                <label className="gf-label">Category</label>
                <select
                  className="gf-select"
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as Category)}
                >
                  {Object.keys(CAT_META).map((k) => (
                    <option key={k} value={k}>{CAT_META[k].label}</option>
                  ))}
                </select>
              </div>
              <div className="gf-field">
                <label className="gf-label">Target reduction %</label>
                <input
                  className="gf-input"
                  type="number"
                  min={1}
                  max={100}
                  value={pct}
                  onChange={(e) => setPct(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="gf-row">
              <div className="gf-field">
                <label className="gf-label">Baseline (kg CO₂e / year)</label>
                <input
                  className="gf-input"
                  type="number"
                  min={0}
                  value={baseline}
                  onChange={(e) => setBaseline(Number(e.target.value))}
                />
              </div>
              <div className="gf-field">
                <label className="gf-label">Deadline</label>
                <input
                  className="gf-input"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="gf-field">
              <label className="gf-label">Title</label>
              <input
                className="gf-input"
                type="text"
                value={effectiveTitle}
                onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                maxLength={120}
              />
            </div>

            <div className="gf-preview">
              Target: <strong>{fmtT(baseline * (1 - pct / 100))}</strong> by <strong>{fmtDate(deadline)}</strong>
              {" "}— saving ~<strong>{fmtT(baseline * (pct / 100))}</strong> vs baseline {fmtT(baseline)}.
            </div>

            <div className="gf-actions">
              <button className="gf-cancel-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button className="gf-submit-btn" onClick={handleCreateGoal} disabled={saving}>
                {saving ? "Creating…" : "Create goal"}
              </button>
            </div>
          </div>
        )}

        {goals.length === 0 && !showForm ? (
          <div className="goals-empty">No goals set yet. Create your first reduction goal to start tracking progress.</div>
        ) : (
          goals.filter((g) => g.status !== "cancelled").map((g) => {
            const meta = CAT_META[g.category] ?? CAT_META.overall;
            const currentKg = goalCurrentKg(g, latest);
            const pctDone = goalProgress(g, currentKg);
            const regression = currentKg !== null && currentKg > g.baselineKg;
            const overdue = new Date(g.deadline) < new Date() && g.status === "active";
            return (
              <div key={g._id} className="goal-card">
                <div className="goal-card-top">
                  <span className="goal-pill" style={{ background: meta.bg, color: meta.color }}>
                    <CarbonIcon name={meta.icon as any} size={13} /> {meta.label}
                  </span>
                  {g.status === "achieved" && <span className="goal-badge-achieved">✓ Achieved</span>}
                  {overdue && <span className="goal-badge-overdue">Overdue</span>}
                  {g.status === "active" && (
                    <button className="goal-cancel-btn" onClick={() => handleCancelGoal(g._id)} title="Cancel goal"><CarbonIcon name="close" size={15} /></button>
                  )}
                </div>
                <div className="goal-title">{g.title}</div>
                <div className="goal-progress-row">
                  <div className={`goal-track ${regression ? "is-regression" : ""}`}>
                    <div
                      className="goal-fill"
                      style={{ width: `${pctDone}%`, background: g.status === "achieved" ? "var(--teal)" : meta.color }}
                    />
                  </div>
                  <div className={`goal-pct ${regression ? "is-regression" : ""}`}>
                    {regression ? "0%" : `${pctDone}%`}
                  </div>
                </div>
                <div className="goal-meta-row">
                  <span>Baseline: {fmtT(g.baselineKg)}</span>
                  <span>Current: {currentKg === null ? "—" : fmtT(currentKg)}</span>
                  <span>Target: {fmtT(g.targetKg)}</span>
                  <span>Deadline: {fmtDate(g.deadline)}</span>
                </div>
                {regression && currentKg !== null && (
                  <div className="goal-regression">
                    <strong>Needs attention</strong>
                    <span>↑ {fmtT(currentKg - g.baselineKg)} above your baseline. Progress remains at 0% until emissions fall below your baseline.</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="goals-shell"><div className="goals-inner"><p className="goals-sub">Loading goals…</p></div></div>}>
      <GoalsInner />
    </Suspense>
  );
}