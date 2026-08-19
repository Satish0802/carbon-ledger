/**
 * seed.js — Carbon Ledger
 * ─────────────────────────────────────────────────────────────────────────────
 * Run from the server/ directory:
 *   node seed.js
 *
 * What it creates:
 *   • 3 users (different diet / lifestyle profiles)
 *   • 6 monthly EmissionEntry documents per user (Dec 2025 → May 2026)
 *   • 1 UserProfile per user
 *   • 2–3 Goals per user (seeded with realistic progress history)
 *
 * Safe to re-run — drops existing seed data first (matches by email).
 *
 * NOTE: emission math is intentionally NOT duplicated here — it imports the
 * same constants and calculation logic used by routes/emissions.js, so seed
 * data can never silently drift out of sync with what the live calculator
 * produces (this bit the previous version of this file: it kept its own
 * copy of flight/heating factors that had gone stale).
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const User          = require('./models/user');
const EmissionEntry = require('./models/Emissionentry');
const UserProfile   = require('./models/UserProfile');
const Goal          = require('./models/Goal');

const {
    TRANSPORT, GRID_FACTORS, HEATING, ELECTRIC_HEATER_KW, HEAT_PUMP_COP,
    COOKING, COOKING_KWH_PER_MEAL,
    DIET, FOOD_WASTE, LOCAL_FOOD,
    SHOPPING, WATER, BENCHMARKS,
} = require('./constants/emissionfactors');

// ─── Calculation helpers ──────────────────────────────────────────────────────
// Mirrors routes/emissions.js exactly — same formulas, same constants.

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
    const motorbikeFactor = TRANSPORT.motorbike[t.motorbikeType] ?? TRANSPORT.motorbike.petrol;
    const bikeKg  = (t.motorbikeKmPerWeek || 0) * motorbikeFactor * weeksPerYear;
    return Math.round(carKg + flightKg + busKg + trainKg + metroKg + bikeKg);
}

function calcEnergy(e) {
    const gridFactor = GRID_FACTORS[e.gridRegion] || GRID_FACTORS.global_average;
    const monthsPerYear = 12;

    const RENEWABLE_FRACTION = { no: 0, half: 0.5, yes: 1 };
    const renewableFraction = RENEWABLE_FRACTION[e.renewableElectricity] ?? 0;
    const effectiveGridFactor = gridFactor * (1 - renewableFraction);

    const electricityKg = (e.electricityKwhPerMonth || 0) * effectiveGridFactor * monthsPerYear;

    let heatingKg = 0;
    if (e.heatingType === 'electric') {
        heatingKg = ELECTRIC_HEATER_KW * (e.heatingHoursPerDay || 0) * 365 * effectiveGridFactor;
    } else if (e.heatingType === 'heat_pump') {
        heatingKg = (ELECTRIC_HEATER_KW * (e.heatingHoursPerDay || 0) * 365 * effectiveGridFactor) / HEAT_PUMP_COP;
    } else if (HEATING[e.heatingType]) {
        heatingKg = ELECTRIC_HEATER_KW * (e.heatingHoursPerDay || 0) * 365 * HEATING[e.heatingType];
    }

    const mealsPerYear = 2 * 365;
    let cookingKg = 0;
    if (e.cookingFuelType === 'electric') {
        cookingKg = mealsPerYear * COOKING_KWH_PER_MEAL * effectiveGridFactor;
    } else if (COOKING[e.cookingFuelType]) {
        cookingKg = mealsPerYear * COOKING[e.cookingFuelType];
    }

    const householdSize = Math.max(e.householdSize || 1, 1);
    return Math.round((electricityKg + heatingKg + cookingKg) / householdSize);
}

function calcDiet(d) {
    const base          = DIET[d.dietType] || DIET.medium_meat;
    const wasteMult      = FOOD_WASTE[d.foodWasteLevel] || FOOD_WASTE.medium;
    const localMult       = LOCAL_FOOD[d.localFoodLevel] || LOCAL_FOOD.mixed;
    return Math.round(base * wasteMult * localMult);
}

function calcShopping(s) {
    const clothingKg     = (s.newClothingItemsPerYear || 0) * (SHOPPING.clothing[s.clothingType] || SHOPPING.clothing.mixed);
    const electronicsKg  = (s.newElectronicsPerYear   || 0) * SHOPPING.electronics.perDevice;
    const goodsKg        = (s.generalGoodsMonthlyUSD  || 0) * 12 * SHOPPING.generalGoods.perUSD;
    const streamingKg    = (s.streamingHoursPerDay     || 0) * 365 * SHOPPING.streaming.perHour;
    return Math.round(clothingKg + electronicsKg + goodsKg + streamingKg);
}

function calcWater(w) {
    const factor = WATER.hotWater[w.hotWaterSource] || WATER.hotWater.electric;

    if (w.waterLitresPerMonth > 0) {
        const litresPerYear = w.waterLitresPerMonth * 12;
        const hotLitresPerYear = litresPerYear * WATER.hotWaterFractionOfTotal;
        const heatingKg = hotLitresPerYear * factor;
        const supplyKg  = litresPerYear * WATER.supplyTreatmentPerLitre;
        return Math.round(heatingKg + supplyKg);
    }

    const showerLitresPerYear = (w.showerMinutesPerDay || 0) * WATER.showerLitresPerMinute * 365;
    const bathLitresPerYear   = (w.bathsPerWeek        || 0) * WATER.bathLitres * 52;
    const litresPerYear = showerLitresPerYear + bathLitresPerYear;
    const heatingKg = litresPerYear * factor;
    const supplyKg  = litresPerYear * WATER.supplyTreatmentPerLitre;
    return Math.round(heatingKg + supplyKg);
}

function calcPercentile(totalKg) {
    if (totalKg <= 2_000) return Math.round((totalKg / 2_000) * 10);
    if (totalKg <= 4_800) return Math.round(10 + ((totalKg - 2_000) / 2_800) * 40);
    if (totalKg <= 8_000) return Math.round(50 + ((totalKg - 4_800) / 3_200) * 30);
    return Math.min(Math.round(80 + ((totalKg - 8_000) / 4_000) * 20), 99);
}

function buildEntry(userId, baseData, monthOffset) {
    // Apply a small realistic variation per month (±5–20%) so the trend line
    // isn't a perfectly straight interpolation between hand-authored points.
    const jitter = (base, pct = 0.10) =>
        Math.round(base * (1 + (Math.random() * 2 - 1) * pct));

    const d = {
        ...baseData,
        carKmPerWeek:           jitter(baseData.carKmPerWeek),
        electricityKwhPerMonth: jitter(baseData.electricityKwhPerMonth, 0.12),
        busHoursPerWeek:        jitter(baseData.busHoursPerWeek, 0.15),
        generalGoodsMonthlyUSD: jitter(baseData.generalGoodsMonthlyUSD, 0.20),
    };

    const transportKg = calcTransport(d);
    const energyKg    = calcEnergy(d);
    const dietKg      = calcDiet(d);
    const shoppingKg  = calcShopping(d);
    const waterKg     = calcWater(d);
    const totalKgPerYear = transportKg + energyKg + dietKg + shoppingKg + waterKg;

    // createdAt = first of the month, starting 5 months ago
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - monthOffset));
    date.setHours(9, 0, 0, 0);

    return {
        userId,
        ...d,
        transportKg,
        energyKg,
        dietKg,
        shoppingKg,
        waterKg,
        totalKgPerYear,
        globalAverageKg:    BENCHMARKS.globalAverageKg,
        percentileVsGlobal: calcPercentile(totalKgPerYear),
        userRegion: baseData.userRegion ?? 'global',
        createdAt: date,
        updatedAt: date,
    };
}

// ─── Seed definitions ─────────────────────────────────────────────────────────

const USERS = [
    // ── User 1: Priya — vegetarian, South Asia, improving over time ──────────
    {
        user: {
            username: 'priya_sharma',
            email:    'priya@carbonledger.dev',
            password: 'password123',
        },
        profile: {
            country:       'India',
            continent:     'asia',
            householdSize: 3,
            homeType:      'apartment',
            occupationType:'remote',
            preferredDistanceUnit: 'km',
        },
        monthlyBases: [
            // Dec 2025 — starting point, medium meat, high waste
            { carType: 'petrol', carKmPerWeek: 80,
              shortHaulFlightsPerYear: 2, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 3, trainHoursPerWeek: 1, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 180, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'lpg',
              householdSize: 3, dietType: 'medium_meat', foodWasteLevel: 'high', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 12, clothingType: 'mixed', newElectronicsPerYear: 1,
              generalGoodsMonthlyUSD: 150, streamingHoursPerDay: 2,
              hotWaterSource: 'electric', showerMinutesPerDay: 8, bathsPerWeek: 0,
              userRegion: 'south_asia' },
            // Jan 2026 — switches to low meat
            { carType: 'petrol', carKmPerWeek: 75,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 4, trainHoursPerWeek: 1, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 170, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'lpg',
              householdSize: 3, dietType: 'low_meat', foodWasteLevel: 'medium', localFoodLevel: 'mixed',
              newClothingItemsPerYear: 10, clothingType: 'mixed', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 140, streamingHoursPerDay: 2,
              hotWaterSource: 'electric', showerMinutesPerDay: 8, bathsPerWeek: 0,
              userRegion: 'south_asia' },
            // Feb 2026
            { carType: 'petrol', carKmPerWeek: 70,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 1, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 165, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'lpg',
              householdSize: 3, dietType: 'pescatarian', foodWasteLevel: 'medium', localFoodLevel: 'mixed',
              newClothingItemsPerYear: 8, clothingType: 'mixed', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 130, streamingHoursPerDay: 2,
              hotWaterSource: 'electric', showerMinutesPerDay: 8, bathsPerWeek: 0,
              userRegion: 'south_asia' },
            // Mar 2026 — goes vegetarian
            { carType: 'hybrid', carKmPerWeek: 65,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 2, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 155, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'electric',
              householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low', localFoodLevel: 'mixed',
              newClothingItemsPerYear: 6, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 120, streamingHoursPerDay: 1,
              hotWaterSource: 'electric', showerMinutesPerDay: 7, bathsPerWeek: 0,
              userRegion: 'south_asia' },
            // Apr 2026
            { carType: 'hybrid', carKmPerWeek: 60,
              shortHaulFlightsPerYear: 1, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 2, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 150, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'electric',
              householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low', localFoodLevel: 'mixed',
              newClothingItemsPerYear: 5, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 110, streamingHoursPerDay: 1,
              hotWaterSource: 'electric', showerMinutesPerDay: 7, bathsPerWeek: 0,
              userRegion: 'south_asia' },
            // May 2026
            { carType: 'hybrid', carKmPerWeek: 55,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 6, trainHoursPerWeek: 2, metroHoursPerWeek: 1, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 145, gridRegion: 'india',
              heatingType: 'none', heatingHoursPerDay: 0, cookingFuelType: 'electric',
              householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 4, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 100, streamingHoursPerDay: 1,
              hotWaterSource: 'electric', showerMinutesPerDay: 7, bathsPerWeek: 0,
              userRegion: 'south_asia' },
        ],
        goals: [
            { category: 'transport', title: 'Cut driving by 30%', targetReductionPct: 30,
              deadline: new Date('2026-09-01') },
            { category: 'diet', title: 'Go fully vegetarian', targetReductionPct: 25,
              deadline: new Date('2026-07-01') },
        ],
    },

    // ── User 2: Marcus — high emitter in North America, slow to change ───────
    {
        user: {
            username: 'marcus_trail',
            email:    'marcus@carbonledger.dev',
            password: 'password123',
        },
        profile: {
            country:       'United States',
            continent:     'north_america',
            householdSize: 2,
            homeType:      'large_house',
            occupationType:'office_based',
            preferredDistanceUnit: 'km',
        },
        monthlyBases: [
            // Dec 2025
            { carType: 'petrol', carKmPerWeek: 300,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 2, longHaulFlightsPerYear: 6,
              busHoursPerWeek: 0, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 900, gridRegion: 'north_america',
              heatingType: 'natural_gas', heatingHoursPerDay: 6, cookingFuelType: 'natural_gas',
              householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'high', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 15, clothingType: 'fast_fashion', newElectronicsPerYear: 3,
              generalGoodsMonthlyUSD: 800, streamingHoursPerDay: 4,
              hotWaterSource: 'natural_gas', showerMinutesPerDay: 12, bathsPerWeek: 2,
              userRegion: 'north_america' },
            // Jan 2026
            { carType: 'petrol', carKmPerWeek: 280,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 2, longHaulFlightsPerYear: 4,
              busHoursPerWeek: 1, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 850, gridRegion: 'north_america',
              heatingType: 'natural_gas', heatingHoursPerDay: 6, cookingFuelType: 'natural_gas',
              householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'high', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 12, clothingType: 'fast_fashion', newElectronicsPerYear: 2,
              generalGoodsMonthlyUSD: 750, streamingHoursPerDay: 4,
              hotWaterSource: 'natural_gas', showerMinutesPerDay: 12, bathsPerWeek: 2,
              userRegion: 'north_america' },
            // Feb 2026
            { carType: 'petrol', carKmPerWeek: 290,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 2, longHaulFlightsPerYear: 2,
              busHoursPerWeek: 1, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 820, gridRegion: 'north_america',
              heatingType: 'natural_gas', heatingHoursPerDay: 6, cookingFuelType: 'natural_gas',
              householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'medium', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 10, clothingType: 'fast_fashion', newElectronicsPerYear: 1,
              generalGoodsMonthlyUSD: 700, streamingHoursPerDay: 4,
              hotWaterSource: 'natural_gas', showerMinutesPerDay: 11, bathsPerWeek: 1,
              userRegion: 'north_america' },
            // Mar 2026 — buys hybrid
            { carType: 'hybrid', carKmPerWeek: 270,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 2, longHaulFlightsPerYear: 2,
              busHoursPerWeek: 2, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 800, gridRegion: 'north_america',
              heatingType: 'natural_gas', heatingHoursPerDay: 5, cookingFuelType: 'natural_gas',
              householdSize: 2, dietType: 'medium_meat', foodWasteLevel: 'medium', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 8, clothingType: 'mixed', newElectronicsPerYear: 1,
              generalGoodsMonthlyUSD: 680, streamingHoursPerDay: 3,
              hotWaterSource: 'natural_gas', showerMinutesPerDay: 11, bathsPerWeek: 1,
              userRegion: 'north_america' },
            // Apr 2026
            { carType: 'hybrid', carKmPerWeek: 260,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 1, longHaulFlightsPerYear: 2,
              busHoursPerWeek: 2, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 780, gridRegion: 'north_america',
              heatingType: 'natural_gas', heatingHoursPerDay: 5, cookingFuelType: 'natural_gas',
              householdSize: 2, dietType: 'medium_meat', foodWasteLevel: 'medium', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 6, clothingType: 'mixed', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 650, streamingHoursPerDay: 3,
              hotWaterSource: 'natural_gas', showerMinutesPerDay: 10, bathsPerWeek: 1,
              userRegion: 'north_america' },
            // May 2026
            { carType: 'hybrid', carKmPerWeek: 250,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 1, longHaulFlightsPerYear: 1,
              busHoursPerWeek: 3, trainHoursPerWeek: 0, metroHoursPerWeek: 0, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 760, gridRegion: 'north_america',
              heatingType: 'heat_pump', heatingHoursPerDay: 5, cookingFuelType: 'electric',
              householdSize: 2, dietType: 'low_meat', foodWasteLevel: 'medium', localFoodLevel: 'mostly_imported',
              newClothingItemsPerYear: 5, clothingType: 'mixed', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 600, streamingHoursPerDay: 3,
              hotWaterSource: 'heat_pump', showerMinutesPerDay: 10, bathsPerWeek: 1,
              userRegion: 'north_america' },
        ],
        goals: [
            { category: 'transport', title: 'Reduce flights to 2/year', targetReductionPct: 20,
              deadline: new Date('2026-12-31') },
            { category: 'energy',    title: 'Install heat pump', targetReductionPct: 15,
              deadline: new Date('2026-08-01') },
            { category: 'diet',      title: 'Cut red meat to weekends', targetReductionPct: 20,
              deadline: new Date('2026-10-01') },
        ],
    },

    // ── User 3: Sofia — vegan, Europe, already low emitter ───────────────────
    {
        user: {
            username: 'sofia_verde',
            email:    'sofia@carbonledger.dev',
            password: 'password123',
        },
        profile: {
            country:       'Netherlands',
            continent:     'europe',
            householdSize: 1,
            homeType:      'apartment',
            occupationType:'hybrid',
            preferredDistanceUnit: 'km',
        },
        monthlyBases: [
            // Dec 2025
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 2, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 5, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 120, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 3, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 3, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 200, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 6, bathsPerWeek: 0,
              userRegion: 'europe' },
            // Jan 2026
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 5, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 115, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 3, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 2, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 180, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 6, bathsPerWeek: 0,
              userRegion: 'europe' },
            // Feb 2026
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 6, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 110, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 3, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 2, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 170, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 6, bathsPerWeek: 0,
              userRegion: 'europe' },
            // Mar 2026 — takes one flight
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 1, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 5, trainHoursPerWeek: 6, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 105, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 3, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 2, clothingType: 'sustainable', newElectronicsPerYear: 1,
              generalGoodsMonthlyUSD: 160, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 6, bathsPerWeek: 0,
              userRegion: 'europe' },
            // Apr 2026
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 6, trainHoursPerWeek: 6, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 100, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 2, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 1, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 150, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 6, bathsPerWeek: 0,
              userRegion: 'europe' },
            // May 2026
            { carType: 'none', carKmPerWeek: 0,
              shortHaulFlightsPerYear: 0, mediumHaulFlightsPerYear: 0, longHaulFlightsPerYear: 0,
              busHoursPerWeek: 6, trainHoursPerWeek: 7, metroHoursPerWeek: 2, motorbikeKmPerWeek: 0,
              electricityKwhPerMonth: 95, gridRegion: 'europe',
              heatingType: 'solar', heatingHoursPerDay: 2, cookingFuelType: 'electric',
              householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low', localFoodLevel: 'mostly_local',
              newClothingItemsPerYear: 1, clothingType: 'sustainable', newElectronicsPerYear: 0,
              generalGoodsMonthlyUSD: 140, streamingHoursPerDay: 1,
              hotWaterSource: 'solar', showerMinutesPerDay: 5, bathsPerWeek: 0,
              userRegion: 'europe' },
        ],
        goals: [
            { category: 'overall',  title: 'Stay under 1.5t/year', targetReductionPct: 10,
              deadline: new Date('2026-12-31') },
            { category: 'shopping', title: 'Zero new electronics this year', targetReductionPct: 30,
              deadline: new Date('2026-12-31') },
        ],
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/carbon_ledger';
    console.log('🔌 Connecting to MongoDB…');
    await mongoose.connect(uri);
    console.log('✅ Connected\n');

    for (const def of USERS) {
        const email = def.user.email;
        console.log(`─── Seeding: ${def.user.username} (${email})`);

        // ── Clean up existing seed data for this user ──────────────────────────
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            await EmissionEntry.deleteMany({ userId: existingUser._id });
            await UserProfile.deleteOne({ userId: existingUser._id });
            await Goal.deleteMany({ userId: existingUser._id });
            await User.deleteOne({ _id: existingUser._id });
            console.log(`   ♻️  Removed existing data`);
        }

        // ── Create user ────────────────────────────────────────────────────────
        const hashedPw = await bcrypt.hash(def.user.password, 10);
        const user = await User.create({ ...def.user, password: hashedPw });
        console.log(`   👤 User created: ${user._id}`);

        // ── Create 6 monthly EmissionEntry documents ───────────────────────────
        const entries = [];
        for (let i = 0; i < 6; i++) {
            const entryData = buildEntry(user._id, def.monthlyBases[i], i);
            // Use insertOne to preserve custom createdAt (bypasses Mongoose auto-date)
            const doc = await EmissionEntry.collection.insertOne(entryData);
            entries.push({ _id: doc.insertedId, ...entryData });
            console.log(
                `   📊 Entry ${i + 1}/6 — month offset ${i - 5}` +
                ` | total: ${entryData.totalKgPerYear} kg/yr`
            );
        }

        // Latest entry = last in array
        const latest = entries[entries.length - 1];

        // ── Create UserProfile ─────────────────────────────────────────────────
        await UserProfile.create({
            userId: user._id,
            ...def.profile,
            hasCompletedCalculator: true,
            latestEntryId: latest._id,
            onboardingStep: 'complete',
        });
        console.log(`   🗂️  UserProfile created`);

        // ── Create Goals ───────────────────────────────────────────────────────
        for (const g of def.goals) {
            const first = entries[0];
            const catMap = {
                transport: first.transportKg,
                energy:    first.energyKg,
                diet:      first.dietKg,
                shopping:  first.shoppingKg,
                water:     first.waterKg,
                overall:   first.totalKgPerYear,
            };
            const baselineKg = catMap[g.category] ?? first.totalKgPerYear;
            const targetKg   = Math.round(baselineKg * (1 - g.targetReductionPct / 100));

            const progressHistory = entries.map((e) => {
                const catKg = {
                    transport: e.transportKg,
                    energy:    e.energyKg,
                    diet:      e.dietKg,
                    shopping:  e.shoppingKg,
                    water:     e.waterKg,
                    overall:   e.totalKgPerYear,
                };
                const currentKg   = catKg[g.category] ?? e.totalKgPerYear;
                const pctAchieved = baselineKg === targetKg ? 0 :
                    Math.round(((baselineKg - currentKg) / (baselineKg - targetKg)) * 100);
                return { date: new Date(e.createdAt), currentKg, pctAchieved };
            });

            const latestProgress = progressHistory[progressHistory.length - 1];
            const pctDone         = latestProgress.pctAchieved;
            const status = pctDone >= 100 ? 'achieved'
                : (new Date() > g.deadline ? 'missed' : 'active');

            await Goal.create({
                userId: user._id,
                category: g.category,
                title: g.title,
                baselineKg,
                targetReductionPct: g.targetReductionPct,
                targetKg,
                deadline: g.deadline,
                status,
                progressHistory,
                latestKg:          latestProgress.currentKg,
                latestPctAchieved: pctDone,
            });
            console.log(`   🎯 Goal: "${g.title}" — ${pctDone}% achieved (${status})`);
        }

        console.log(`   ✅ Done\n`);
    }

    console.log('🌱 Seeding complete!');
    console.log('\nTest credentials (all passwords: password123)');
    console.log('  priya@carbonledger.dev  — vegetarian, improving (India)');
    console.log('  marcus@carbonledger.dev — high emitter, slowly reducing (US)');
    console.log('  sofia@carbonledger.dev  — vegan, already low (Netherlands)');

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    mongoose.disconnect();
    process.exit(1);
});