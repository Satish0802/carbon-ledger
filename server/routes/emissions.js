const express = require('express');
const router = express.Router();
const EmissionEntry = require('../models/Emissionentry');
const UserProfile   = require('../models/UserProfile');
const authMiddleware = require('../middleware/cookies');
const admin = require('../middleware/admin'); // Optional: restrict some routes to admins
const {
    TRANSPORT, GRID_FACTORS, HEATING, ELECTRIC_HEATER_KW,
    COOKING, COOKING_KWH_PER_MEAL,
    DIET, FOOD_WASTE, LOCAL_FOOD_MAX_DISCOUNT,
    SHOPPING, WATER, BENCHMARKS,
} = require('../constants/emissionfactors');

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

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /emissions — save a new calculator submission
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { userId, userRegion, ...input } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // ── Use the real helpers — no more duplicate inline math ──────────────
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
            .select('totalKgPerYear transportKg energyKg dietKg shoppingKg percentileVsGlobal createdAt');
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching emission entries' });
    }
});

// DELETE /emissions/:id — delete a specific entry
router.delete('/:id', authMiddleware, admin, async (req, res) => {
    try {
        const deleted = await EmissionEntry.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Entry not found' });
        res.json({ message: 'Entry deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting entry' });
    }
});

module.exports = router;