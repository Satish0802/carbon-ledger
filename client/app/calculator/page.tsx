"use client";

import { useState, ChangeEvent, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./calculator.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  carType: string;
  carKmPerWeek: number;
  flightsPerYear: number;
  flightTypeRatio: string;
  publicTransitHoursPerWeek: number;
  electricityKwhPerMonth: number;
  gridRegion: string;
  heatingType: string;
  householdSize: number;
  dietType: string;
  foodWasteLevel: string;
  monthlySpendUSD: number;
  newElectronicsPerYear: number;
}

const INITIAL: FormData = {
  carType: "",
  carKmPerWeek: 0,
  flightsPerYear: 0,
  flightTypeRatio: "mixed",
  publicTransitHoursPerWeek: 0,
  electricityKwhPerMonth: 0,
  gridRegion: "",
  heatingType: "",
  householdSize: 0,
  dietType: "",
  foodWasteLevel: "",
  monthlySpendUSD: 0,
  newElectronicsPerYear: 0,
};

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { icon: "🚗", label: "Transport" },
  { icon: "⚡", label: "Energy" },
  { icon: "🥗", label: "Diet" },
  { icon: "🛍️", label: "Shopping" },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="calc-field">
      <label className="calc-label">{label}</label>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [step, setStep] = useState(0); // 0-indexed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

 useEffect(() => {
  const stored = localStorage.getItem('carbon_user');
  if (!stored) { router.push('/login'); return; }
  setUserId(JSON.parse(stored)._id);
}, [router]);

function set(field: keyof FormData, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  const { type, value, inputMode } = e.target as HTMLInputElement;
  const isNumeric = type === "number" || (inputMode as string) === "numeric";
  setForm((prev) => ({ ...prev, [field]: isNumeric ? Number(value) || 0 : value }));
}

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) { setStep((s) => s + 1); return; }

    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/emissions`, {
  method:      'POST',
  headers:     { 'Content-Type': 'application/json' },
  credentials: 'include',                              // ✅ Added
  body:        JSON.stringify({ userId, ...form }),
});
      if (!res.ok) throw new Error("Failed to save. Is the server running?");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  // ── Step panels ────────────────────────────────────────────────────────────

  const panels = [
    // Step 0 — Transport
    <>
      <Field label="Do you drive a personal car?">
        <select value={form.carType} onChange={(e) => set("carType", e)}>
          <option value="" disabled>Select an option</option>
          <option value="none">No car</option>
          <option value="petrol">Petrol / Gasoline</option>
          <option value="diesel">Diesel</option>
          <option value="hybrid">Hybrid</option>
          <option value="electric">Electric</option>
        </select>
      </Field>

      {form.carType !== "none" && (
        <Field label="How far do you drive per week? (km)">
          <input type="text" inputMode="numeric" min="0" value={form.carKmPerWeek || ""} placeholder="e.g. 100 km" onChange={(e) => set("carKmPerWeek", e)} />
        </Field>
      )}

      <Field label="How many flights do you take per year?">
        <input type="text" inputMode="numeric" min="0" value={form.flightsPerYear || ""} placeholder="e.g. 5" onChange={(e) => set("flightsPerYear", e)} />
      </Field>

      {form.flightsPerYear > 0 && (
        <Field label="What kind of flights?">
          <select value={form.flightTypeRatio} onChange={(e) => set("flightTypeRatio", e)}>
            <option value="mostly_short">Mostly short (&lt; 3 hrs)</option>
            <option value="mixed">A mix of short and long</option>
            <option value="mostly_long">Mostly long-haul (&gt; 6 hrs)</option>
          </select>
        </Field>
      )}

      <Field label="Public transit usage (hours/week)">
        <input type="text" inputMode="numeric" min="0" value={form.publicTransitHoursPerWeek || ""} placeholder="e.g. 10 hours" onChange={(e) => set("publicTransitHoursPerWeek", e)} />
      </Field>
    </>,

    // Step 1 — Energy
    <>
      <Field label="How many people live in your home?">
        <input type="text" inputMode="numeric" pattern="[0-9]*"  value={form.householdSize || ""} placeholder="e.g. 4 people" onChange={(e) => set("householdSize", e)} />
      </Field>

      <Field label="Monthly electricity usage (kWh)">
        <input type="text" inputMode="numeric" min="0" value={form.electricityKwhPerMonth || ""} placeholder="e.g. 250 kwh" onChange={(e) => set("electricityKwhPerMonth", e)} />
      </Field>

      <Field label="Where do you live? (affects grid carbon intensity)">
        <select value={form.gridRegion} onChange={(e) => set("gridRegion", e)}>
          <option value="" disabled>Select an option</option>
          <option value="global_average">Not sure / Global average</option>
          <option value="europe">Europe</option>
          <option value="north_america">North America</option>
          <option value="latin_america">Latin America</option>
          <option value="china">China</option>
          <option value="india">India</option>
          <option value="southeast_asia">Southeast Asia</option>
          <option value="middle_east">Middle East</option>
          <option value="africa">Africa</option>
          <option value="oceania">Oceania / Australia</option>
        </select>
      </Field>

      <Field label="How do you heat your home?">
        <select value={form.heatingType || ""} onChange={(e) => set("heatingType", e)}>
          <option value="" disabled>Select an option</option>
          <option value="none">No heating / warm climate</option>
          <option value="natural_gas">Natural gas boiler</option>
          <option value="electric">Electric heater</option>
          <option value="heat_pump">Heat pump</option>
          <option value="renewable">Renewable (solar, biomass, etc.)</option>
        </select>
      </Field>
    </>,

    // Step 2 — Diet
    <>
      <Field label="Which best describes your diet?">
        <div className="calc-radio-group">
          {[
            { val: "heavy_meat",  label: "Heavy meat",  sub: "Meat at most meals" },
            { val: "medium_meat", label: "Medium meat",  sub: "Meat most days" },
            { val: "low_meat",    label: "Low meat",     sub: "Meat a few times/week" },
            { val: "pescatarian", label: "Pescatarian",  sub: "Fish, no red meat" },
            { val: "vegetarian",  label: "Vegetarian",   sub: "No meat or fish" },
            { val: "vegan",       label: "Vegan",        sub: "No animal products" },
          ].map(({ val, label, sub }) => (
            <label
              key={val}
              className={`calc-radio-card${form.dietType === val ? " selected" : ""}`}
              onClick={() => setForm((p) => ({ ...p, dietType: val }))}
            >
              <div className="calc-radio-label">{label}</div>
              <div className="calc-radio-sub">{sub}</div>
            </label>
          ))}
        </div>
      </Field>

      <Field label="How much food do you typically waste?">
        <select value={form.foodWasteLevel || ""}  onChange={(e) => set("foodWasteLevel", e)}>
          <option value="" disabled>Select an option</option>
          <option value="low">Low — I rarely throw food away</option>
          <option value="medium">Medium — I waste some food occasionally</option>
          <option value="high">High — I throw away a fair amount</option>
        </select>
      </Field>
    </>,

    // Step 3 — Shopping
    <>
      <Field label="How much do you spend on general goods per month? (USD)">
        <input type="text" inputMode="numeric" min="0" value={form.monthlySpendUSD || ""} onChange={(e) => set("monthlySpendUSD", e)} placeholder="e.g. 200" />
        <span className="calc-hint">Clothing, household items, personal goods, etc.</span>
      </Field>

      <Field label="How many new electronics do you buy per year?">
        <input type="text" inputMode="numeric" min="0" value={form.newElectronicsPerYear || ""} onChange={(e) => set("newElectronicsPerYear", e)} placeholder="e.g. phones, laptops, tablets" />
        <span className="calc-hint">Include phones, laptops, tablets, headphones, etc.</span>
      </Field>
    </>,
  ];

  const isLast = step === STEPS.length - 1;

  return (
    <div className="calc-shell">
      <div className="calc-container">

        {/* Top bar */}
        <div className="calc-topbar">
          <div className="calc-brand">
            <div className="calc-leaf">🌿</div>
            <span className="calc-brand-name">Carbon Ledger</span>
          </div>
          <button className="calc-back-btn" onClick={() => router.push("/dashboard")}>
            ← Dashboard
          </button>
        </div>

        {/* Step pills */}
        <div className="calc-steps">
          {STEPS.map(({ icon, label }, i) => (
            <div
              key={label}
              className={`calc-step-pill${i === step ? " active" : i < step ? " done" : ""}`}
            >
              <span className="calc-step-icon">{i < step ? "✓" : icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="calc-progress-wrap">
          <div className="calc-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* Card */}
        <div className="calc-card">
          <div className="calc-card-header">
            <div className="calc-card-title">
              {STEPS[step].icon} {STEPS[step].label}
            </div>
            <div className="calc-card-sub">
              Step {step + 1} of {STEPS.length} — fill in what applies to you
            </div>
          </div>

          {error && <div className="calc-error">⚠️ {error}</div>}

          <form onSubmit={handleNext}>
            {panels[step]}

            <div className="calc-actions">
              {step > 0 ? (
                <button type="button" className="calc-btn-back" onClick={() => setStep((s) => s - 1)}>
                  ← Back
                </button>
              ) : <div />}
              <button type="submit" className="calc-btn-next" disabled={loading}>
                {isLast ? (loading ? "Saving…" : "Submit ✓") : "Continue →"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}