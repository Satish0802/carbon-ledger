const express = require('express');
const router = express.Router();
const EmissionEntry = require('../models/Emissionentry');
const UserProfile   = require('../models/UserProfile');
const Goal           = require('../models/Goal');
const authMiddleware = require('../middleware/cookies');
const admin = require('../middleware/admin'); // Optional: restrict some routes to admins
const {
    TRANSPORT, GRID_FACTORS, HEATING, ELECTRIC_HEATER_KW,
    COOKING, COOKING_KWH_PER_MEAL,
    DIET, FOOD_WASTE, LOCAL_FOOD_MAX_DISCOUNT,
    SHOPPING, WATER, BENCHMARKS,
} = require('../constants/emissionfactors');

// ─── Input sanitization ───────────────────────────────────────────────────────
// Never trust client numbers. Anything numeric gets coerced, floored at 0, and
// capped at a sane ceiling before it ever reaches the calculation helpers.
// This runs independently of the Mongoose schema bounds — schema bounds catch
// it again at save time as a second line of defense (defense in depth).

const NUMERIC_CAPS = {
    carKmPerWeek: 2_000,
    shortHaulFlightsPerYear: 100,
    mediumHaulFlightsPerYear: 100,
    longHaulFlightsPerYear: 100,
    busHoursPerWeek: 100,
    trainHoursPerWeek: 100,
    metroHoursPerWeek: 100,
    motorbikeKmPerWeek: 2_000,
    electricityKwhPerMonth: 10_000,
    heatingHoursPerDay: 24,
    householdSize: 20,
    localFoodPct: 100,
    newClothingItemsPerYear: 500,
    newElectronicsPerYear: 50,
    generalGoodsMonthlyUSD: 100_000,
    streamingHoursPerDay: 24,
    showerMinutesPerDay: 180,
    bathsPerWeek: 50,
};

// Enum fields default to an empty string on the frontend until the user
// actually interacts with that select/step. Skipping a step (or the whole
// step's category not applying to them) should not 400 the whole submission —
// fall back to each field's schema default instead.
const ENUM_DEFAULTS = {
    carType:         { allowed: ['none', 'petrol', 'diesel', 'hybrid', 'electric'], fallback: 'none' },
    gridRegion:      {
        allowed: ['global_average', 'europe', 'north_america', 'latin_america', 'china', 'india', 'southeast_asia', 'middle_east', 'africa', 'oceania'],
        fallback: 'global_average',
    },
    heatingType:     {
        allowed: ['none', 'natural_gas', 'electric', 'heat_pump', 'renewable', 'lpg', 'oil', 'wood', 'district', 'solar'],
        fallback: 'none',
    },
    cookingFuelType: { allowed: ['electric', 'natural_gas', 'lpg', 'biomass'], fallback: 'electric' },
    dietType:        { allowed: ['heavy_meat', 'medium_meat', 'low_meat', 'pescatarian', 'vegetarian', 'vegan'], fallback: 'medium_meat' },
    foodWasteLevel:  { allowed: ['low', 'medium', 'high'], fallback: 'medium' },
    clothingType:    { allowed: ['fast_fashion', 'mixed', 'sustainable'], fallback: 'mixed' },
    hotWaterSource:  { allowed: ['electric', 'natural_gas', 'solar', 'heat_pump'], fallback: 'electric' },
};

function sanitizeInput(raw) {
    const out = { ...raw };
    for (const [field, cap] of Object.entries(NUMERIC_CAPS)) {
        const n = Number(out[field]);
        out[field] = Number.isFinite(n) ? Math.min(Math.max(n, 0), cap) : 0;
    }
    // householdSize should never be 0 — floor is 1
    if (out.householdSize < 1) out.householdSize = 1;

    for (const [field, { allowed, fallback }] of Object.entries(ENUM_DEFAULTS)) {
        if (!allowed.includes(out[field])) out[field] = fallback;
    }
    return out;
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

function calcTransport(t) {
    const weeksPerYear = 52;

    const carKg = (TRANSPORT.car[t.carType] || 0) * (t.carKmPerWeek || 0) * weeksPerYear;

    const flightKg =
        (t.shortHaulFlightsPerYear  || 0) * TRANSPORT.flight.shortHaul  +
        (t.mediumHaulFlightsPerYear || 0) * TRANSPORT.flight.mediumHaul +
        (t.longHaulFlightsPerYear   || 0) * TRANSPORT.flight.longHaul;

    const busKg   = (t.busHoursPerWeek   || 0) * TRANSPORT.transit.bus   * weeksPerYear;
    const trainKg = (t.trainHoursPerWeek || 0) * TRANSPORT.transit.train * weeksPerYear;
    const metroKg = (t.metroHoursPerWeek || 0) * TRANSPORT.transit.metro * weeksPerYear;

    const bikeKg  = (t.motorbikeKmPerWeek || 0) * TRANSPORT.motorbike * weeksPerYear;

    return Math.round(carKg + flightKg + busKg + trainKg + metroKg + bikeKg);
}

function calcEnergy(e) {
    const gridFactor = GRID_FACTORS[e.gridRegion] || GRID_FACTORS.global_average;
    const monthsPerYear = 12;

    // Electricity
    const electricityKg = (e.electricityKwhPerMonth || 0) * gridFactor * monthsPerYear;

    // Heating
    let heatingKg = 0;
    if (e.heatingType === 'electric') {
        // electric heater: avg 2kW × hours/day × 365
        heatingKg = ELECTRIC_HEATER_KW * (e.heatingHoursPerDay || 0) * 365 * gridFactor;
    } else if (HEATING[e.heatingType]) {
        // combustion fuels: kWh output approximated as 2kW × hours
        heatingKg = ELECTRIC_HEATER_KW * (e.heatingHoursPerDay || 0) * 365 * HEATING[e.heatingType];
    }

    // Cooking — estimate 2 meals/day cooked at home
    const mealsPerYear = 2 * 365;
    let cookingKg = 0;
    if (e.cookingFuelType === 'electric') {
        cookingKg = mealsPerYear * COOKING_KWH_PER_MEAL * gridFactor;
    } else if (COOKING[e.cookingFuelType]) {
        cookingKg = mealsPerYear * COOKING[e.cookingFuelType];
    }

    // Divide by household size so figure is per-person
    const householdSize = Math.max(e.householdSize || 1, 1);
    const totalKg = (electricityKg + heatingKg + cookingKg) / householdSize;

    return Math.round(totalKg);
}

function calcDiet(d) {
    const base        = DIET[d.dietType] || DIET.medium_meat;
    const wasteMult   = FOOD_WASTE[d.foodWasteLevel] || FOOD_WASTE.medium;
    const localPct    = Math.min(Math.max(d.localFoodPct || 30, 0), 100);
    const localDiscount = 1 - (localPct / 100) * LOCAL_FOOD_MAX_DISCOUNT;
    return Math.round(base * wasteMult * localDiscount);
}

function calcShopping(s) {
    const clothingKg  = (s.newClothingItemsPerYear || 0) * (SHOPPING.clothing[s.clothingType] || SHOPPING.clothing.mixed);
    const electronicsKg = (s.newElectronicsPerYear || 0) * SHOPPING.electronics.perDevice;
    const goodsKg     = (s.generalGoodsMonthlyUSD || 0) * 12 * SHOPPING.generalGoods.perUSD;
    const streamingKg = (s.streamingHoursPerDay   || 0) * 365 * SHOPPING.streaming.perHour;
    return Math.round(clothingKg + electronicsKg + goodsKg + streamingKg);
}

function calcWater(w) {
    const factor = WATER.hotWater[w.hotWaterSource] || WATER.hotWater.electric;
    const showerLitresPerYear = (w.showerMinutesPerDay || 0) * WATER.showerLitresPerMinute * 365;
    const bathLitresPerYear   = (w.bathsPerWeek        || 0) * WATER.bathLitres * 52;
    return Math.round((showerLitresPerYear + bathLitresPerYear) * factor);
}

function calcPercentile(totalKg) {
    // Rough global distribution bucket:
    // < 2,000 kg → top ~10% greenest
    // 2,000–4,800 → 10–50%
    // 4,800–8,000 → 50–80%
    // > 8,000     → top 20% emitters
    if (totalKg <= 2_000) return Math.round((totalKg / 2_000) * 10);
    if (totalKg <= 4_800) return Math.round(10 + ((totalKg - 2_000) / 2_800) * 40);
    if (totalKg <= 8_000) return Math.round(50 + ((totalKg - 4_800) / 3_200) * 30);
    return Math.min(Math.round(80 + ((totalKg - 8_000) / 4_000) * 20), 99);
}

// ─── Goal progress sync ───────────────────────────────────────────────────────
// Recalculates every active goal's progress against a given category→kg map.
// Called after any change to a user's emission history (new entry, or an
// entry being deleted) so `latestPctAchieved` never goes stale.
async function syncGoalProgress(userId, categoryKg) {
    const activeGoals = await Goal.find({ userId, status: 'active' });
    for (const goal of activeGoals) {
        const currentKg = categoryKg[goal.category];
        if (currentKg === undefined) continue;

        const denom = goal.baselineKg - goal.targetKg;
        const pctAchieved = denom !== 0
            ? Math.round(((goal.baselineKg - currentKg) / denom) * 100)
            : 0;

        goal.progressHistory.push({ currentKg, pctAchieved });
        goal.latestKg = currentKg;
        goal.latestPctAchieved = pctAchieved;

        if (currentKg <= goal.targetKg) goal.status = 'achieved';
        else if (new Date() > goal.deadline) goal.status = 'missed';

        await goal.save();
    }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /emissions — save a new calculator submission
router.post('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { userRegion, ...rawInput } = req.body;

        // ── Never trust client numbers — sanitize before any calculation ──────
        const input = sanitizeInput(rawInput);

        const transportKg = calcTransport(input);
        const energyKg    = calcEnergy(input);
        const dietKg       = calcDiet(input);
        const shoppingKg   = calcShopping(input);
        const waterKg      = calcWater(input);

        const totalKgPerYear = transportKg + energyKg + dietKg + shoppingKg + waterKg;

        const entry = new EmissionEntry({
            userId,
            ...input,
            transportKg, energyKg, dietKg, shoppingKg, waterKg,
            totalKgPerYear,
            globalAverageKg: BENCHMARKS.globalAverageKg,
            percentileVsGlobal: calcPercentile(totalKgPerYear),
            userRegion: userRegion || 'global',
        });

        await entry.save();

        await UserProfile.findOneAndUpdate(
            { userId },
            { hasCompletedCalculator: true, latestEntryId: entry._id, onboardingStep: 'complete' },
            { upsert: true, new: true }
        );

        // ── Sync active goal progress against this new entry ───────────────────
        // A goal's `latestPctAchieved` is a denormalised snapshot — it only
        // reflects reality if something recalculates it whenever a new entry
        // comes in. Previously nothing did, so goals stayed frozen at whatever
        // value they had when created/last patched directly.
        await syncGoalProgress(userId, {
            transport: transportKg,
            energy: energyKg,
            diet: dietKg,
            shopping: shoppingKg,
            water: waterKg,
            overall: totalKgPerYear,
        });

        res.status(201).json({
            message: 'Emission entry saved',
            entry: {
                _id: entry._id,
                totalKgPerYear, transportKg, energyKg, dietKg, shoppingKg, waterKg,
                percentileVsGlobal: entry.percentileVsGlobal,
                globalAverageKg: BENCHMARKS.globalAverageKg,
                createdAt: entry.createdAt,
            },
        });
    } catch (error) {
        console.error('POST /emissions error:', error);
        // Mongoose enum/min/max validation errors → 400, not 500
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Invalid emission data', details: error.message });
        }
        res.status(500).json({ error: 'Error saving emission entry' });
    }
});

// GET /emissions — all entries (dev/debug)
router.get('/', authMiddleware, admin, async (req, res) => {
    try {
        const entries = await EmissionEntry.find().sort({ createdAt: -1 }).limit(50);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// GET /emissions/:userId/latest — most recent entry (used for dashboard + gateway check)
router.get('/:userId/latest', authMiddleware, async (req, res) => {
    if (req.user.userId !== req.params.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const entry = await EmissionEntry
            .findOne({ userId: req.params.userId })
            .sort({ createdAt: -1 });

        if (!entry) {
            // 404 signals "no entry yet" — frontend redirects to calculator
            return res.status(404).json({ error: 'No emission entry found' });
        }

        res.json(entry);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching latest emission entry' });
    }
});

// GET /emissions/:userId — all entries for a user (for history / trend chart)
router.get('/:userId', authMiddleware, async (req, res) => {
    if (req.user.userId !== req.params.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const entries = await EmissionEntry
            .find({ userId: req.params.userId })
            .sort({ createdAt: -1 })
            .select('totalKgPerYear transportKg energyKg dietKg shoppingKg waterKg percentileVsGlobal createdAt');
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching emission entries' });
    }
});

// DELETE /emissions/:id — delete a specific entry (owner or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const entry = await EmissionEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });

        const isOwner = entry.userId.toString() === req.user.userId;
        if (!isOwner && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const userId = entry.userId;
        await entry.deleteOne();

        // ── Re-sync goal progress to whatever is now the latest entry ──────────
        // Goal progress is only ever calculated from the most recent submission.
        // If the entry just deleted WAS the latest one, every active goal's
        // percentage was derived from data that no longer exists — recalculate
        // against the new latest entry (or leave untouched if none remain).
        const newLatest = await EmissionEntry.findOne({ userId }).sort({ createdAt: -1 });
        if (newLatest) {
            await syncGoalProgress(userId, {
                transport: newLatest.transportKg,
                energy: newLatest.energyKg,
                diet: newLatest.dietKg,
                shopping: newLatest.shoppingKg,
                water: newLatest.waterKg,
                overall: newLatest.totalKgPerYear,
            });
        }

        res.json({
            message: 'Entry deleted',
            newLatestEntryId: newLatest ? newLatest._id : null,
        });
    } catch (error) {
        console.error('DELETE /emissions/:id error:', error);
        res.status(500).json({ error: 'Error deleting entry' });
    }
});

module.exports = router;