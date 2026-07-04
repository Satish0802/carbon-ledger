"use client";

import { useState, ChangeEvent, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./calculator.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  carType: string;
  carKmPerWeek: number;
  shortHaulFlightsPerYear: number;
  mediumHaulFlightsPerYear: number;
  longHaulFlightsPerYear: number;
  busHoursPerWeek: number;
  trainHoursPerWeek: number;
  metroHoursPerWeek: number;
  motorbikeKmPerWeek: number;
  electricityKwhPerMonth: number;
  gridRegion: string;
  heatingType: string;
  heatingHoursPerDay: number;
  cookingFuelType: string;
  householdSize: number;
  dietType: string;
  foodWasteLevel: string;
  localFoodPct: number;
  newClothingItemsPerYear: number;
  clothingType: string;
  newElectronicsPerYear: number;
  generalGoodsMonthlyUSD: number;
  streamingHoursPerDay: number;
  hotWaterSource: string;
  showerMinutesPerDay: number;
  bathsPerWeek: number;
}

const INITIAL: FormData = {
  carType: "",
  carKmPerWeek: 0,
  shortHaulFlightsPerYear: 0,
  mediumHaulFlightsPerYear: 0,
  longHaulFlightsPerYear: 0,
  busHoursPerWeek: 0,
  trainHoursPerWeek: 0,
  metroHoursPerWeek: 0,
  motorbikeKmPerWeek: 0,
  electricityKwhPerMonth: 0,
  gridRegion: "",
  heatingType: "",
  heatingHoursPerDay: 0,
  cookingFuelType: "electric",
  householdSize: 0,
  dietType: "",
  foodWasteLevel: "",
  localFoodPct: 30,
  newClothingItemsPerYear: 0,
  clothingType: "mixed",
  newElectronicsPerYear: 0,
  generalGoodsMonthlyUSD: 0,
  streamingHoursPerDay: 0,
  hotWaterSource: "electric",
  showerMinutesPerDay: 0,
  bathsPerWeek: 0,
};

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { icon: "🚗", label: "Transport" },
  { icon: "⚡", label: "Energy" },
  { icon: "🥗", label: "Diet" },
  { icon: "🛍️", label: "Shopping" },
  { icon: "💧", label: "Water" },
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

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <div className="calc-radio-group">
        <label className={`calc-radio-card${value === true ? " selected" : ""}`} onClick={() => onChange(true)}>
          <div className="calc-radio-label">Yes</div>
        </label>
        <label className={`calc-radio-card${value === false ? " selected" : ""}`} onClick={() => onChange(false)}>
          <div className="calc-radio-label">No</div>
        </label>
      </div>
    </Field>
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

  // UI-only gating toggles — not submitted, just control which fields show
  const [hasMotorbike, setHasMotorbike] = useState<boolean | null>(null);
  const [hasFlights, setHasFlights] = useState<boolean | null>(null);
  const [hasTransit, setHasTransit] = useState<boolean | null>(null);

 useEffect(() => {
  const stored = localStorage.getItem('carbon_user');
  if (!stored) { router.push('/login'); return; }
  setUserId(JSON.parse(stored)._id);
}, [router]);

function set(field: keyof FormData, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  const { type, value, inputMode } = e.target as HTMLInputElement;
  const isNumeric = type === "number" || (inputMode as string) === "numeric";
  setForm((prev) => ({ ...prev, [field]: isNumeric ? (value === "" ? NaN : Number(value)) : value }));
}

// number field that lets you type/keep "0" instead of it blanking, but still empty while NaN
function num(form: FormData, field: keyof FormData) {
  const v = form[field] as number;
  return Number.isFinite(v) ? String(v) : "";
}

function clean(form: FormData): FormData {
  const out: any = { ...form };
  for (const k in out) if (typeof out[k] === "number" && !Number.isFinite(out[k])) out[k] = 0;
  return out;
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
  body:        JSON.stringify({ userId, ...clean(form) }),
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

      {form.carType && form.carType !== "none" && (
        <Field label="How far do you drive per week? (km)">
          <input type="text" inputMode="numeric" min="0" value={num(form, "carKmPerWeek")} placeholder="e.g. 100 km" onChange={(e) => set("carKmPerWeek", e)} />
        </Field>
      )}

      <YesNo
        label="Do you ride a motorbike or scooter?"
        value={hasMotorbike}
        onChange={(v) => { setHasMotorbike(v); if (!v) setForm((p) => ({ ...p, motorbikeKmPerWeek: 0 })); }}
      />
      {hasMotorbike && (
        <Field label="Motorbike/scooter — km per week">
          <input type="text" inputMode="numeric" min="0" value={num(form, "motorbikeKmPerWeek")} placeholder="e.g. 50" onChange={(e) => set("motorbikeKmPerWeek", e)} />
        </Field>
      )}

      <YesNo
        label="Have you taken any flights this year?"
        value={hasFlights}
        onChange={(v) => {
          setHasFlights(v);
          if (!v) setForm((p) => ({ ...p, shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0 }));
        }}
      />
      {hasFlights && (
        <>
          <Field label="Short-haul flights per year (< 3 hrs)">
            <input type="text" inputMode="numeric" min="0" value={num(form, "shortHaulFlightsPerYear")} placeholder="e.g. 2" onChange={(e) => set("shortHaulFlightsPerYear", e)} />
          </Field>
          <Field label="Medium-haul flights per year (3–6 hrs)">
            <input type="text" inputMode="numeric" min="0" value={num(form, "mediumHaulFlightsPerYear")} placeholder="e.g. 1" onChange={(e) => set("mediumHaulFlightsPerYear", e)} />
          </Field>
          <Field label="Long-haul flights per year (> 6 hrs)">
            <input type="text" inputMode="numeric" min="0" value={num(form, "longHaulFlightsPerYear")} placeholder="e.g. 0" onChange={(e) => set("longHaulFlightsPerYear", e)} />
          </Field>
        </>
      )}

      <YesNo
        label="Do you use public transit (bus, train, or metro)?"
        value={hasTransit}
        onChange={(v) => {
          setHasTransit(v);
          if (!v) setForm((p) => ({ ...p, busHoursPerWeek: 0, trainHoursPerWeek: 0, metroHoursPerWeek: 0 }));
        }}
      />
      {hasTransit && (
        <>
          <Field label="Bus — hours per week">
            <input type="text" inputMode="numeric" min="0" value={num(form, "busHoursPerWeek")} placeholder="e.g. 3" onChange={(e) => set("busHoursPerWeek", e)} />
          </Field>
          <Field label="Train — hours per week">
            <input type="text" inputMode="numeric" min="0" value={num(form, "trainHoursPerWeek")} placeholder="e.g. 0" onChange={(e) => set("trainHoursPerWeek", e)} />
          </Field>
          <Field label="Metro/subway — hours per week">
            <input type="text" inputMode="numeric" min="0" value={num(form, "metroHoursPerWeek")} placeholder="e.g. 0" onChange={(e) => set("metroHoursPerWeek", e)} />
          </Field>
        </>
      )}
    </>,

    // Step 1 — Energy
    <>
      <Field label="How many people live in your home?">
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={num(form, "householdSize")} placeholder="e.g. 4 people" onChange={(e) => set("householdSize", e)} />
      </Field>

      <Field label="Monthly electricity usage (kWh)">
        <input type="text" inputMode="numeric" min="0" value={num(form, "electricityKwhPerMonth")} placeholder="e.g. 250 kwh" onChange={(e) => set("electricityKwhPerMonth", e)} />
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
          <option value="lpg">LPG</option>
          <option value="oil">Oil</option>
          <option value="wood">Wood / biomass</option>
          <option value="district">District heating</option>
          <option value="solar">Solar</option>
          <option value="renewable">Other renewable</option>
        </select>
      </Field>

      {form.heatingType && form.heatingType !== "none" && (
        <Field label="Heating — hours per day">
          <input type="text" inputMode="numeric" min="0" value={num(form, "heatingHoursPerDay")} placeholder="e.g. 6" onChange={(e) => set("heatingHoursPerDay", e)} />
        </Field>
      )}

      <Field label="What fuel do you cook with?">
        <select value={form.cookingFuelType || ""} onChange={(e) => set("cookingFuelType", e)}>
          <option value="electric">Electric</option>
          <option value="natural_gas">Natural gas</option>
          <option value="lpg">LPG</option>
          <option value="biomass">Biomass / wood</option>
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

      <Field label="What % of your food is locally sourced?">
        <input type="text" inputMode="numeric" min="0" max="100" value={num(form, "localFoodPct")} placeholder="e.g. 30" onChange={(e) => set("localFoodPct", e)} />
      </Field>
    </>,

    // Step 3 — Shopping
    <>
      <Field label="How much do you spend on general goods per month? (USD)">
        <input type="text" inputMode="numeric" min="0" value={num(form, "generalGoodsMonthlyUSD")} onChange={(e) => set("generalGoodsMonthlyUSD", e)} placeholder="e.g. 200" />
        <span className="calc-hint">Household items, personal goods, etc. — not clothing.</span>
      </Field>

      <Field label="New clothing items bought per year">
        <input type="text" inputMode="numeric" min="0" value={num(form, "newClothingItemsPerYear")} onChange={(e) => set("newClothingItemsPerYear", e)} placeholder="e.g. 10" />
      </Field>

      <Field label="What kind of clothing do you mostly buy?">
        <select value={form.clothingType || ""} onChange={(e) => set("clothingType", e)}>
          <option value="fast_fashion">Fast fashion</option>
          <option value="mixed">Mixed</option>
          <option value="sustainable">Sustainable / second-hand</option>
        </select>
      </Field>

      <Field label="How many new electronics do you buy per year?">
        <input type="text" inputMode="numeric" min="0" value={num(form, "newElectronicsPerYear")} onChange={(e) => set("newElectronicsPerYear", e)} placeholder="e.g. phones, laptops, tablets" />
        <span className="calc-hint">Include phones, laptops, tablets, headphones, etc.</span>
      </Field>

      <Field label="Video streaming — hours per day">
        <input type="text" inputMode="numeric" min="0" value={num(form, "streamingHoursPerDay")} onChange={(e) => set("streamingHoursPerDay", e)} placeholder="e.g. 2" />
      </Field>
    </>,

    // Step 4 — Water
    <>
      <Field label="What heats your hot water?">
        <select value={form.hotWaterSource || ""} onChange={(e) => set("hotWaterSource", e)}>
          <option value="electric">Electric</option>
          <option value="natural_gas">Natural gas</option>
          <option value="solar">Solar</option>
          <option value="heat_pump">Heat pump</option>
        </select>
      </Field>

      <Field label="Shower — minutes per day">
        <input type="text" inputMode="numeric" min="0" value={num(form, "showerMinutesPerDay")} onChange={(e) => set("showerMinutesPerDay", e)} placeholder="e.g. 8" />
      </Field>

      <Field label="Baths — per week">
        <input type="text" inputMode="numeric" min="0" value={num(form, "bathsPerWeek")} onChange={(e) => set("bathsPerWeek", e)} placeholder="e.g. 0" />
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