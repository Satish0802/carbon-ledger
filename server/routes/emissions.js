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
        const {
            userId,
            // flat transport fields
            carType, carKmPerWeek, flightsPerYear, flightTypeRatio,
            publicTransitHoursPerWeek,
            // flat energy fields
            electricityKwhPerMonth, gridRegion, heatingType, householdSize,
            // flat diet fields
            dietType, foodWasteLevel,
            // flat shopping fields
            monthlySpendUSD, newElectronicsPerYear,
            userRegion,
        } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // ── Calculate subtotals from flat fields ──────────────────────────────

        const weeksPerYear = 52;

        // Transport
        const carFactor = { none: 0, petrol: 0.171, diesel: 0.163, hybrid: 0.105, electric: 0.047 };
        const flightFactor = { mostly_short: 255, mixed: 400, mostly_long: 700 };
        const transportKg = Math.round(
            (carFactor[carType] || 0) * (carKmPerWeek || 0) * weeksPerYear +
            (flightsPerYear || 0) * (flightFactor[flightTypeRatio] || 400) +
            (publicTransitHoursPerWeek || 0) * 40 * weeksPerYear / 1000
        );

        // Energy
        const gridFactor = {
            global_average: 0.436, europe: 0.258, north_america: 0.369,
            latin_america: 0.218, china: 0.537, india: 0.708,
            southeast_asia: 0.529, middle_east: 0.618, africa: 0.548, oceania: 0.521,
        };
        const heatingBase = { none: 0, natural_gas: 0.203, electric: 1, heat_pump: 0.4, renewable: 0.05 };
        const gf = gridFactor[gridRegion] || 0.436;
        const electricityKg = (electricityKwhPerMonth || 0) * gf * 12;
        const heatingKg = heatingType === 'electric'
            ? 2 * 8 * 150 * gf   // avg 2kW, 8hr/day, ~150 heating days
            : (heatingBase[heatingType] || 0) * 2 * 8 * 150;
        const energyKg = Math.round((electricityKg + heatingKg) / Math.max(householdSize || 1, 1));

        // Diet
        const dietBase = { heavy_meat: 3300, medium_meat: 2500, low_meat: 1900, pescatarian: 1500, vegetarian: 1200, vegan: 800 };
        const wasteMult = { low: 1.0, medium: 1.1, high: 1.25 };
        const dietKg = Math.round(
            (dietBase[dietType] || 2500) * (wasteMult[foodWasteLevel] || 1.1)
        );

        // Shopping
        const shoppingKg = Math.round(
            (monthlySpendUSD || 0) * 12 * 0.5 +    // ~0.5 kg CO2e per USD spent
            (newElectronicsPerYear || 0) * 300       // ~300 kg per device
        );

        const totalKgPerYear = transportKg + energyKg + dietKg + shoppingKg;

        const calcPercentile = (kg) => {
            if (kg <= 2000) return Math.round((kg / 2000) * 10);
            if (kg <= 4800) return Math.round(10 + ((kg - 2000) / 2800) * 40);
            if (kg <= 8000) return Math.round(50 + ((kg - 4800) / 3200) * 30);
            return Math.min(Math.round(80 + ((kg - 8000) / 4000) * 20), 99);
        };

        const entry = new EmissionEntry({
            userId,
            // store all flat input fields
            carType, carKmPerWeek, flightsPerYear, flightTypeRatio,
            publicTransitHoursPerWeek,
            electricityKwhPerMonth, gridRegion, heatingType, householdSize,
            dietType, foodWasteLevel,
            monthlySpendUSD, newElectronicsPerYear,
            // calculated subtotals
            transportKg,
            energyKg,
            dietKg,
            shoppingKg,
            totalKgPerYear,
            globalAverageKg: 4800,
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
                totalKgPerYear, transportKg, energyKg, dietKg, shoppingKg,
                percentileVsGlobal: entry.percentileVsGlobal,
                globalAverageKg: 4800,
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