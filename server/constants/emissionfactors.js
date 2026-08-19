/**
 * emissionFactors.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All values in kg CO2e per unit unless stated otherwise.
 * Sources: IPCC AR6 (2022), IEA Emissions Factors 2024, Poore & Nemecek (2018),
 *          DEFRA GHG Conversion Factors 2024.
 *
 * Philosophy: Global IPCC defaults are used so the calculator works for ANY
 * user regardless of country. Grid electricity is the only factor adjusted by
 * region because it varies enormously (258 g/kWh in Europe vs 708 in India).
 * Everything else uses the best available global average.
 */

// ─── Transport ────────────────────────────────────────────────────────────────

const TRANSPORT = {
    // kg CO2e per km driven (includes upstream fuel production — IPCC lifecycle)
    car: {
        petrol:   0.192,   // average petrol/gasoline car, global fleet avg
        diesel:   0.171,   // average diesel car
        hybrid:   0.111,   // petrol-electric hybrid
        electric: 0.053,   // global avg grid mix (improves with cleaner grids)
        none:     0,
    },

    // kg CO2e per passenger-flight (avg seat, economy class)
    // Short < 3hr | Medium 3-6hr | Long > 6hr
    // Source: DEFRA 2024, includes radiative forcing multiplier (×1.9)
    flight: {
        shortHaul:  255,   // ~1,000 km avg, e.g. London–Paris
        mediumHaul: 583,   // ~3,000 km avg, e.g. London–Dubai
        longHaul:  1_620,  // ~9,000 km avg, e.g. London–Sydney
    },

    // kg CO2e per hour of travel
    transit: {
        bus:    0.089 * 30,    // 89 g/km × ~30 km/hr avg city speed = 2.67/hr
        train:  0.041 * 80,    // 41 g/km × ~80 km/hr avg = 3.28/hr
        metro:  0.027 * 40,    // 27 g/km × ~40 km/hr = 1.08/hr
    },

    // kg CO2e per km, by motorbike/scooter power source
    motorbike: {
        petrol:   0.114,   // avg 125cc-150cc ICE scooter/motorbike
        electric: 0.021,   // e-scooter/e-bike, global avg grid mix
        none:     0,
    },
};

// ─── Energy — Electricity (IEA 2024 regional grid averages, g CO2e/kWh) ──────

const GRID_FACTORS = {
    // kg CO2e per kWh — approximate, based on public Ember/IEA grid-intensity
    // data (~2023-24 averages). Real values shift year to year (hydro output
    // varies with rainfall, coal plants retire, etc.) — these are estimates
    // for a personal calculator, not a certified emissions factor.

    // ── Regional fallbacks — used when a specific country isn't listed
    global_average: 0.436,
    europe:         0.258,
    north_america:  0.369,
    latin_america:  0.218,
    southeast_asia: 0.529,
    middle_east:    0.618,
    africa:         0.548,
    oceania:        0.521,

    // ── Hydro/nuclear/geothermal-dominant grids — very low carbon intensity
    nepal:        0.040,
    iceland:      0.005,
    norway:       0.020,
    sweden:       0.020,
    switzerland:  0.030,
    france:       0.060,
    brazil:       0.090,
    ethiopia:     0.010,
    paraguay:     0.010,
    new_zealand:  0.110,
    canada:       0.130,
    colombia:     0.150,
    kenya:        0.100,
    austria:      0.100,

    // ── Mixed grids
    uk:           0.210,
    spain:        0.190,
    peru:         0.200,
    argentina:    0.300,
    russia:       0.320,
    italy:        0.310,
    chile:        0.350,
    germany:      0.350,
    mexico:       0.390,
    united_states:0.369,
    uae:          0.450,
    japan:        0.450,
    egypt:        0.450,
    nigeria:      0.400,
    sri_lanka:    0.400,
    thailand:     0.400,
    south_korea:  0.410,
    turkey:       0.420,
    pakistan:     0.440,
    saudi_arabia: 0.600,

    // ── Coal-heavy / high-intensity grids
    vietnam:      0.490,
    bangladesh:   0.510,
    philippines:  0.550,
    malaysia:     0.550,
    china:        0.537,
    australia:    0.540,
    indonesia:    0.650,
    poland:       0.650,
    india:        0.708,
    south_africa: 0.850,
};

// Countries grouped for the dropdown UI — keeps the raw factor list above
// flat/alphabetical-ish while the UI can still show sensible optgroups.
const GRID_REGION_GROUPS = {
    'South Asia': ['nepal', 'india', 'pakistan', 'bangladesh', 'sri_lanka'],
    'East & Southeast Asia': ['china', 'japan', 'south_korea', 'vietnam', 'thailand', 'malaysia', 'philippines', 'indonesia'],
    'Europe': ['iceland', 'norway', 'sweden', 'switzerland', 'france', 'austria', 'uk', 'spain', 'italy', 'germany', 'poland', 'russia'],
    'Americas': ['canada', 'united_states', 'mexico', 'brazil', 'colombia', 'peru', 'chile', 'argentina', 'paraguay'],
    'Middle East & Africa': ['uae', 'saudi_arabia', 'turkey', 'egypt', 'nigeria', 'kenya', 'ethiopia', 'south_africa'],
    'Oceania': ['australia', 'new_zealand'],
    'Other / not listed': ['global_average', 'europe', 'north_america', 'latin_america', 'southeast_asia', 'middle_east', 'africa', 'oceania'],
};

// ─── Energy — Heating (kg CO2e per kWh of heat output) ───────────────────────

const HEATING = {
    natural_gas: 0.203,   // IPCC default combustion factor
    lpg:         0.241,
    oil:         0.265,
    electric:    null,    // ← calculated from grid factor × hours × avg kW
    heat_pump:   null,    // ← calculated from grid factor × hours × avg kW ÷ COP
    wood:        0.030,   // biomass — low direct CO2 but not zero (IPCC)
    district:    0.150,   // district heating global average
    solar:       0.010,   // embodied + pump electricity
    renewable:   0.010,   // wind/solar-sourced electric heating — embodied only
    none:        0,
};

// Avg kW consumed by a typical heater (used when type = electric/heat_pump)
const ELECTRIC_HEATER_KW = 2.0;

// Heat pumps move heat instead of generating it — typical coefficient of
// performance ~3.5x an electric resistive heater (IPCC/IEA default)
const HEAT_PUMP_COP = 3.5;

// ─── Energy — Cooking (kg CO2e per meal, approx) ─────────────────────────────

const COOKING = {
    electric:    null,    // calculated from grid: ~0.5 kWh/meal
    natural_gas: 0.083,   // 0.41 kWh gas × 0.203 kg/kWh
    lpg:         0.097,
    biomass:     0.049,
};
const COOKING_KWH_PER_MEAL = 0.5; // for electric stoves

// ─── Diet (kg CO2e per year) ─────────────────────────────────────────────────
// Source: Poore & Nemecek 2018 (Science), Oxford Martin School food emissions

const DIET = {
    heavy_meat:   3_300,   // > 100g meat/day
    medium_meat:  2_500,   // 50–100g meat/day (global average)
    low_meat:     1_900,   // < 50g meat/day
    pescatarian:  1_500,
    vegetarian:   1_200,
    vegan:          800,
};

// Food waste multipliers on diet base
const FOOD_WASTE = {
    low:    1.00,
    medium: 1.10,   // +10%
    high:   1.25,   // +25%
};

// Local food discount: how much of your diet is sourced nearby vs shipped
// in. Applied as: base × discount multiplier below — a category is much
// easier for someone to answer honestly than an exact percentage.
const LOCAL_FOOD = {
    mostly_local:    0.93,  // farmers market / local produce most of the time — ~7% below baseline
    mixed:           1.00,  // baseline — typical supermarket mix
    mostly_imported: 1.04,  // mostly imported/out-of-season produce — ~4% above baseline
};

// ─── Shopping & Consumption ───────────────────────────────────────────────────

const SHOPPING = {
    // kg CO2e per clothing item (includes manufacturing + transport)
    clothing: {
        fast_fashion:  23,   // synthetic, long supply chain
        mixed:         15,   // average
        sustainable:    7,   // organic/recycled/second-hand
    },

    // kg CO2e per device (lifecycle avg: manufacturing dominates)
    electronics: {
        perDevice: 70,       // smartphone ~70kg, laptop ~300kg — using midpoint
    },

    // kg CO2e per USD of general consumer goods spend
    // Source: EEIO (Environmentally Extended Input-Output) global avg
    generalGoods: {
        perUSD: 0.50,        // 0.5 kg CO2e / $ spent (global supply chain avg)
    },

    // kg CO2e per hour of video streaming
    // Source: Carbon Trust / IEA 2024 (data centres + network)
    streaming: {
        perHour: 0.036,
    },
};

// ─── Water ───────────────────────────────────────────────────────────────────

const WATER = {
    // kg CO2e per litre of hot water (heating energy cost)
    // Assumes 40°C rise, 4.18 kJ/kg·K, converted to kWh then × heating factor
    // Electric baseline used; caller adjusts by hotWaterSource
    hotWater: {
        electric:    0.00144,  // per litre, global avg grid
        natural_gas: 0.00099,
        solar:       0.00012,
        heat_pump:   0.00048,
    },

    // Litres per minute for a standard shower
    showerLitresPerMinute: 8,

    // Litres per bath
    bathLitres: 130,

    // kg CO2e per litre for water supply + wastewater treatment (pumping,
    // purification, sewage processing) — applies regardless of temperature.
    // Global average, IEA/DEFRA water-sector estimates.
    supplyTreatmentPerLitre: 0.0004,

    // When a user gives a total bill figure (litres/month) instead of
    // shower+bath estimates, we don't know how much of it was heated.
    // Typical household split: showers/baths ≈ 30% of total water use.
    hotWaterFractionOfTotal: 0.30,
};

// ─── Global average benchmark ────────────────────────────────────────────────
// World average personal carbon footprint ~4,800 kg CO2e/year (IPCC 2023)
// 1.5°C-compatible budget: ~2,300 kg CO2e/year per person by 2030

const BENCHMARKS = {
    globalAverageKg: 4_800,
    targetKg:        2_300,
    lowEmitterKg:    2_000,   // bottom 20% globally
    highEmitterKg:   8_000,   // top 20% globally
};

module.exports = {
    TRANSPORT,
    GRID_FACTORS,
    GRID_REGION_GROUPS,
    HEATING,
    ELECTRIC_HEATER_KW,
    HEAT_PUMP_COP,
    COOKING,
    COOKING_KWH_PER_MEAL,
    DIET,
    FOOD_WASTE,
    LOCAL_FOOD,
    SHOPPING,
    WATER,
    BENCHMARKS,
};