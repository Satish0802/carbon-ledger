"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./profile.css";
import { apiFetch, AuthExpiredError, API, avatarUrl } from "../../lib/api";

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
  avatar: string;
}

const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB — before client-side resize
const AVATAR_DIMENSION = 256; // px, square

// Reads an image file and downsizes it to a small square JPEG Blob before
// upload — keeps the request small regardless of the original photo size.
function resizeImageToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_DIMENSION;
        canvas.height = AVATAR_DIMENSION;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Image processing is not supported here')); return; }

        // Cover-crop to a centered square so the avatar isn't stretched
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_DIMENSION, AVATAR_DIMENSION);

        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Could not process that image')),
          'image/jpeg',
          0.85
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
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
    avatar: "",
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]         = useState<string | null>(null);
  const [stats, setStats]       = useState<{ entries: number; goals: number } | null>(null);
  const [accountForm, setAccountForm] = useState({
    username: "", currentPassword: "", newPassword: "", confirmPassword: "",
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("carbon_user");
    if (!stored) { router.push("/login"); return; }
    const u: StoredUser = JSON.parse(stored);
    setUser(u);
    loadProfile(u._id);
    loadStats(u._id);
    setAccountForm((f) => ({ ...f, username: u.username }));
  }, [router]);

  async function loadProfile(uid: string) {
    try {
      const res = await apiFetch(`/profile/${uid}`);
      if (res.ok) {
        const data = await res.json();
        setForm({
          country: data.country ?? "",
          continent: data.continent ?? "prefer_not_to_say",
          householdSize: data.householdSize ?? 1,
          homeType: data.homeType ?? "apartment",
          occupationType: data.occupationType ?? "other",
          preferredDistanceUnit: data.preferredDistanceUnit ?? "km",
          avatar: data.avatar ?? "",
        });
      }
    } catch (e) { if (!(e instanceof AuthExpiredError)) { /* no profile yet — defaults fine */ } }
    finally { setLoading(false); }
  }

  async function loadStats(uid: string) {
    try {
      const [eRes, gRes] = await Promise.all([
        apiFetch(`/emissions/${uid}`),
        apiFetch(`/goals/${uid}`),
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
      const res = await apiFetch(`/profile/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const responseBody = await res.json();
      if (!res.ok) throw new Error(responseBody.message || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !user) return;

    setAvatarError(null);

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setAvatarError("Image is too large (max 8MB).");
      return;
    }

    setAvatarUploading(true);
    try {
      const blob = await resizeImageToBlob(file);
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");

      const res = await apiFetch(`/profile/${user._id}/avatar`, {
        method: "POST",
        body: formData, // no Content-Type header — the browser sets the multipart boundary
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save your photo");
      }
      const updated = await res.json();
      setForm((p) => ({ ...p, avatar: updated.avatar }));
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        setAvatarError(err instanceof Error ? err.message : "Could not upload photo");
      }
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAccountSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const usernameChanged = accountForm.username.trim() !== user.username;
    const wantsPasswordChange = accountForm.newPassword.length > 0 || accountForm.confirmPassword.length > 0;

    if (!usernameChanged && !wantsPasswordChange) {
      setAccountMsg({ type: "err", text: "No changes to save." });
      return;
    }
    if (wantsPasswordChange) {
      if (accountForm.newPassword.length < 8) {
        setAccountMsg({ type: "err", text: "New password must be at least 8 characters." });
        return;
      }
      if (accountForm.newPassword !== accountForm.confirmPassword) {
        setAccountMsg({ type: "err", text: "New passwords don't match." });
        return;
      }
      if (!accountForm.currentPassword) {
        setAccountMsg({ type: "err", text: "Enter your current password to set a new one." });
        return;
      }
    }

    setAccountSaving(true);
    setAccountMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (usernameChanged) payload.username = accountForm.username.trim();
      if (wantsPasswordChange) {
        payload.currentPassword = accountForm.currentPassword;
        payload.newPassword = accountForm.newPassword;
      }

      const res = await apiFetch(`/users/${user._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ||data.message || "Update failed");

      if (usernameChanged) {
        const updatedUser = { ...user, username: accountForm.username.trim() };
        setUser(updatedUser);
        localStorage.setItem("carbon_user", JSON.stringify(updatedUser));
      }
      setAccountForm((f) => ({ ...f, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setAccountMsg({ type: "ok", text: "Account updated." });
      setTimeout(() => setAccountMsg(null), 3000);
    } catch (err) {
      setAccountMsg({ type: "err", text: err instanceof Error ? err.message : "Error updating account." });
    } finally {
      setAccountSaving(false);
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
            <label
              htmlFor="avatar-upload"
              className="profile-avatar-lg"
              style={{
                cursor: "pointer",
                padding: 0,
                overflow: "hidden",
                position: "relative",
                opacity: avatarUploading ? 0.6 : 1,
              }}
              title="Click to change photo"
            >
              {form.avatar ? (
                <img
                  src={avatarUrl(form.avatar)}
                  alt={`${user.username}'s avatar`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                />
              ) : (
                initials(user.username)
              )}
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
            </label>
            <div style={{ flex: 1 }}>
              <div className="profile-name">{user.username}</div>
              <div className="profile-email">{user.email}</div>
              {stats && (
                <div className="profile-stats">
                  <div className="profile-stat"><strong>{stats.entries}</strong> entries</div>
                  <div className="profile-stat"><strong>{stats.goals}</strong> goals</div>
                </div>
              )}
              {avatarUploading && <div className="profile-email">Uploading photo…</div>}
              {avatarError && <div className="profile-error" style={{ marginTop: 6 }}>⚠️ {avatarError}</div>}
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

              {/* Actions */}
            <div className="pf-actions">
              {saved && <span className="pf-saved">✓ Profile saved</span>}
              <button type="submit" className="pf-save-btn" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
            </div>

            
          </form>
        )}

        {/* Account settings */}
        <div className="profile-card">
          <div className="profile-card-title">🔐 Account settings</div>

          <form onSubmit={handleAccountSave}>
            <div className="pf-field">
              <label className="pf-label">Username</label>
              <input
                className="pf-input"
                value={accountForm.username}
                onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Your username"
                minLength={2}
                maxLength={30}
                required
              />
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--b)", margin: "1rem 0" }} />

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m)", marginBottom: 10 }}>
              Change password — leave blank to keep current
            </div>

            <div className="pf-field">
              <label className="pf-label">Current password</label>
              <input
                className="pf-input"
                type="password"
                value={accountForm.currentPassword}
                onChange={(e) => setAccountForm((f) => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Required when changing password"
                autoComplete="current-password"
              />
            </div>

            <div className="pf-grid">
              <div className="pf-field">
                <label className="pf-label">New password</label>
                <input
                  className="pf-input"
                  type="password"
                  value={accountForm.newPassword}
                  onChange={(e) => setAccountForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="pf-field">
                <label className="pf-label">Confirm new password</label>
                <input
                  className="pf-input"
                  type="password"
                  value={accountForm.confirmPassword}
                  onChange={(e) => setAccountForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {accountMsg && (
              <div className={accountMsg.type === "ok" ? "pf-msg-ok" : "pf-msg-err"}>
                {accountMsg.type === "ok" ? "✓ " : "⚠ "}{accountMsg.text}
              </div>
            )}

            <div className="pf-actions">
              <button type="submit" className="pf-save-btn" disabled={accountSaving}>
                {accountSaving ? "Saving…" : "Save account changes"}
              </button>
            </div>
          </form>
        </div>

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