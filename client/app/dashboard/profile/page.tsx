"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./profile.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface StoredUser {
  _id: string;
  username: string;
  email: string;
}

interface ProfileForm {
  country: string;
  continent: string;
  householdSize: number;
  homeType: string;
  occupationType: string;
  preferredDistanceUnit: string;
}

const CONTINENTS = [
  { val: "africa",           label: "Africa" },
  { val: "asia",             label: "Asia" },
  { val: "europe",           label: "Europe" },
  { val: "north_america",    label: "North America" },
  { val: "south_america",    label: "South America" },
  { val: "oceania",          label: "Oceania / Pacific" },
  { val: "prefer_not_to_say",label: "Prefer not to say" },
];

const HOME_TYPES = [
  { val: "apartment",   label: "🏢 Apartment" },
  { val: "small_house", label: "🏠 Small house" },
  { val: "large_house", label: "🏡 Large house" },
  { val: "shared",      label: "🏘️ Shared / co-living" },
];

const OCCUPATIONS = [
  { val: "office_based", label: "🏢 Office-based" },
  { val: "remote",       label: "💻 Remote / work from home" },
  { val: "hybrid",       label: "🔄 Hybrid" },
  { val: "outdoor",      label: "🌳 Outdoor / field work" },
  { val: "student",      label: "🎓 Student" },
  { val: "other",        label: "⋯ Other" },
];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]   = useState<StoredUser | null>(null);
  const [form, setForm]   = useState<ProfileForm>({
    country: "", continent: "prefer_not_to_say",
    householdSize: 1, homeType: "apartment",
    occupationType: "other", preferredDistanceUnit: "km",
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [stats, setStats]       = useState<{ entries: number; goals: number } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("carbon_user");
    if (!stored) { router.push("/login"); return; }
    const u: StoredUser = JSON.parse(stored);
    setUser(u);
    loadProfile(u._id);
    loadStats(u._id);
  }, [router]);

  async function loadProfile(uid: string) {
    try {
      const res = await fetch(`${API}/profile/${uid}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setForm({
          country: data.country ?? "",
          continent: data.continent ?? "prefer_not_to_say",
          householdSize: data.householdSize ?? 1,
          homeType: data.homeType ?? "apartment",
          occupationType: data.occupationType ?? "other",
          preferredDistanceUnit: data.preferredDistanceUnit ?? "km",
        });
      }
    } catch { /* no profile yet — defaults fine */ }
    finally { setLoading(false); }
  }

  async function loadStats(uid: string) {
    try {
      const [eRes, gRes] = await Promise.all([
  fetch(`${API}/emissions/${uid}`, { credentials: 'include' }), // ✅
  fetch(`${API}/goals/${uid}`,     { credentials: 'include' }), // ✅
]);
      const entries = eRes.ok ? (await eRes.json()).length : 0;
      const goals   = gRes.ok ? (await gRes.json()).length : 0;
      setStats({ entries, goals });
    } catch { /* silent */ }
  }

  async function handleSave(e: React.FormEvent) {
  e.preventDefault();
  if (!user) return;
  setSaving(true);
  setError(null);
  try {
    const res = await fetch(`${API}/profile/${user._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });

    // ADD THESE LINES:
    console.log("Status:", res.status);
    const responseBody = await res.json();
    console.log("Response:", responseBody);

    if (!res.ok) throw new Error(responseBody.message || "Save failed");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Error saving profile");
  } finally {
    setSaving(false);
  }
}

  async function handleLogout() {
  await fetch(`${API}/users/logout`, {
    method:      'POST',
    credentials: 'include',
  });
  localStorage.removeItem('carbon_user');
  router.push('/login');
}

  return (
    <div className="profile-shell">
      <div className="profile-inner">

        {/* Topbar */}
        <div className="profile-topbar">
          <div className="profile-brand">
            <div className="profile-leaf">🌿</div>
            <span className="profile-brand-name">Carbon Ledger</span>
          </div>
          <button className="profile-back" onClick={() => router.push("/dashboard")}>← Dashboard</button>
        </div>

        {/* Hero card */}
        {user && (
          <div className="profile-hero">
            <div className="profile-avatar-lg">{initials(user.username)}</div>
            <div style={{ flex: 1 }}>
              <div className="profile-name">{user.username}</div>
              <div className="profile-email">{user.email}</div>
              {stats && (
                <div className="profile-stats">
                  <div className="profile-stat"><strong>{stats.entries}</strong> entries</div>
                  <div className="profile-stat"><strong>{stats.goals}</strong> goals</div>
                </div>
              )}
            </div>
            <button className="profile-logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        )}

        {error && <div className="profile-error">⚠️ {error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--m)", fontSize: 13 }}>Loading profile…</div>
        ) : (
          <form onSubmit={handleSave}>
            {/* Location */}
            <div className="profile-card">
              <div className="profile-card-title">📍 Location</div>
              <div className="pf-grid">
                <div className="pf-field">
                  <label className="pf-label">Country</label>
                  <input className="pf-input" type="text" placeholder="e.g. Nepal" value={form.country}
                    onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} />
                </div>
                <div className="pf-field">
                  <label className="pf-label">Region / Continent</label>
                  <select className="pf-select" value={form.continent}
                    onChange={(e) => setForm((p) => ({ ...p, continent: e.target.value }))}>
                    {CONTINENTS.map((c) => <option key={c.val} value={c.val}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Household */}
            <div className="profile-card">
              <div className="profile-card-title">🏠 Household</div>
              <div className="pf-field">
                <label className="pf-label">People in household</label>
                <input className="pf-input" type="number" min="1" max="20" value={form.householdSize}
                  onChange={(e) => setForm((p) => ({ ...p, householdSize: Number(e.target.value) }))} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Home type</label>
                <div className="pf-radio-row">
                  {HOME_TYPES.map(({ val, label }) => (
                    <div key={val} className={`pf-radio-card${form.homeType === val ? " selected" : ""}`}
                      onClick={() => setForm((p) => ({ ...p, homeType: val }))}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lifestyle */}
            <div className="profile-card">
              <div className="profile-card-title">💼 Lifestyle</div>
              <div className="pf-field">
                <label className="pf-label">Work style</label>
                <div className="pf-radio-row">
                  {OCCUPATIONS.map(({ val, label }) => (
                    <div key={val} className={`pf-radio-card${form.occupationType === val ? " selected" : ""}`}
                      onClick={() => setForm((p) => ({ ...p, occupationType: val }))}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pf-field" style={{ marginTop: 4 }}>
                <label className="pf-label">Distance unit preference</label>
                <div className="pf-radio-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  {[{ val: "km", label: "Kilometres (km)" }, { val: "miles", label: "Miles" }].map(({ val, label }) => (
                    <div key={val} className={`pf-radio-card${form.preferredDistanceUnit === val ? " selected" : ""}`}
                      onClick={() => setForm((p) => ({ ...p, preferredDistanceUnit: val }))}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pf-actions">
              {saved && <span className="pf-saved">✓ Profile saved</span>}
              <button type="submit" className="pf-save-btn" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        )}

        {/* Danger zone */}
        <div className="profile-danger" style={{ marginTop: "1.5rem" }}>
          <div className="profile-danger-title">⚠️ Account</div>
          <div className="profile-danger-sub">Sign out of Carbon Ledger on this device.</div>
          <button className="profile-logout-btn" onClick={handleLogout} style={{ width: "auto" }}>
            Sign out
          </button>
        </div>

      </div>
    </div>
  );
}