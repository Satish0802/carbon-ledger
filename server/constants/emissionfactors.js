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

    // kg CO2e per km (petrol motorbike/scooter)
    motorbike: 0.114,
};

// ─── Energy — Electricity (IEA 2024 regional grid averages, g CO2e/kWh) ──────

const GRID_FACTORS = {
    // Convert g → kg: divide by 1000
    global_average: 0.436,
    europe:         0.258,
    north_america:  0.369,
    latin_america:  0.218,
    china:          0.537,
    india:          0.708,
    southeast_asia: 0.529,
    middle_east:    0.618,
    africa:         0.548,
    oceania:        0.521,
};

// ─── Energy — Heating (kg CO2e per kWh of heat output) ───────────────────────

const HEATING = {
    natural_gas: 0.203,   // IPCC default combustion factor
    lpg:         0.241,
    oil:         0.265,
    electric:    null,    // ← calculated from grid factor × hours × avg kW
    wood:        0.030,   // biomass — low direct CO2 but not zero (IPCC)
    district:    0.150,   // district heating global average
    solar:       0.010,   // embodied + pump electricity
    none:        0,
};

// Avg kW consumed by a typical heater (used when type = electric)
const ELECTRIC_HEATER_KW = 2.0;

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

// Local food discount: up to 10% reduction if 100% local
// Applied as: base × (1 - localFoodPct/100 × 0.10)
const LOCAL_FOOD_MAX_DISCOUNT = 0.10;

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
    HEATING,
    ELECTRIC_HEATER_KW,
    COOKING,
    COOKING_KWH_PER_MEAL,
    DIET,
    FOOD_WASTE,
    LOCAL_FOOD_MAX_DISCOUNT,
    SHOPPING,
    WATER,
    BENCHMARKS,
};