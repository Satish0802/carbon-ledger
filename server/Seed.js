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
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const User         = require('./models/user');
const EmissionEntry = require('./models/EmissionEntry');
const UserProfile  = require('./models/UserProfile');
const Goal         = require('./models/Goal');

// ─── Emission factor helpers (mirrors emissionFactors.js) ─────────────────────

const GRID   = { global_average: 0.436, europe: 0.258, north_america: 0.369,
                 latin_america: 0.218,  china: 0.537,  india: 0.708,
                 southeast_asia: 0.529, middle_east: 0.618, africa: 0.548, oceania: 0.521 };
const DIET_KG = { heavy_meat: 3300, medium_meat: 2500, low_meat: 1900,
                  pescatarian: 1500, vegetarian: 1200, vegan: 800 };
const WASTE  = { low: 1.00, medium: 1.10, high: 1.25 };
const CAR    = { none: 0, petrol: 0.192, diesel: 0.171, hybrid: 0.111, electric: 0.053 };
const FLIGHT_RATIO = { mostly_short: 255, mixed: 583, mostly_long: 1020 };
const HEATING_KG   = { none: 0, natural_gas: 0.203, electric: null, heat_pump: 0.048, renewable: 0.010 };
const ELECTRIC_HEATER_KW = 2.0;

function calcTransportKg(d) {
  const carKg     = CAR[d.carType] * d.carKmPerWeek * 52;
  const flightKg  = d.flightsPerYear * FLIGHT_RATIO[d.flightTypeRatio];
  const transitKg = d.publicTransitHoursPerWeek * 52 * 0.089 * 30; // bus avg
  return Math.round(carKg + flightKg + transitKg);
}

function calcEnergyKg(d) {
  const grid      = GRID[d.gridRegion] ?? GRID.global_average;
  const elecKg    = d.electricityKwhPerMonth * 12 * grid;
  let   heatKg    = 0;
  if (d.heatingType === 'electric') {
    heatKg = ELECTRIC_HEATER_KW * 4 * 365 * grid; // ~4 hrs/day
  } else if (HEATING_KG[d.heatingType]) {
    heatKg = ELECTRIC_HEATER_KW * 4 * 365 * HEATING_KG[d.heatingType];
  }
  return Math.round((elecKg + heatKg) / Math.max(d.householdSize, 1));
}

function calcDietKg(d) {
  return Math.round(DIET_KG[d.dietType] * WASTE[d.foodWasteLevel]);
}

function calcShoppingKg(d) {
  const goodsKg       = d.monthlySpendUSD * 12 * 0.50;
  const electronicsKg = d.newElectronicsPerYear * 70;
  return Math.round(goodsKg + electronicsKg);
}

function calcPercentile(totalKg) {
  if (totalKg <= 2000) return Math.round((totalKg / 2000) * 10);
  if (totalKg <= 4800) return Math.round(10 + ((totalKg - 2000) / 2800) * 40);
  if (totalKg <= 8000) return Math.round(50 + ((totalKg - 4800) / 3200) * 30);
  return Math.min(Math.round(80 + ((totalKg - 8000) / 4000) * 20), 99);
}

function buildEntry(userId, baseData, monthOffset) {
  // Apply a small realistic variation per month (±5–15%)
  const jitter = (base, pct = 0.10) =>
    Math.round(base * (1 + (Math.random() * 2 - 1) * pct));

  const d = {
    ...baseData,
    carKmPerWeek:              jitter(baseData.carKmPerWeek),
    electricityKwhPerMonth:    jitter(baseData.electricityKwhPerMonth, 0.12),
    publicTransitHoursPerWeek: jitter(baseData.publicTransitHoursPerWeek, 0.15),
    monthlySpendUSD:           jitter(baseData.monthlySpendUSD, 0.20),
  };

  const transportKg = calcTransportKg(d);
  const energyKg    = calcEnergyKg(d);
  const dietKg      = calcDietKg(d);
  const shoppingKg  = calcShoppingKg(d);
  const totalKgPerYear = transportKg + energyKg + dietKg + shoppingKg;

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
    totalKgPerYear,
    globalAverageKg:    4800,
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
    // Base lifestyle — improving diet & energy month by month
    monthlyBases: [
      // Dec 2025 — starting point, medium meat, high waste
      { carType: 'petrol', carKmPerWeek: 80,  flightsPerYear: 2, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 5, electricityKwhPerMonth: 180, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'medium_meat', foodWasteLevel: 'high',
        monthlySpendUSD: 150, newElectronicsPerYear: 1, userRegion: 'south_asia' },
      // Jan 2026 — switches to low meat
      { carType: 'petrol', carKmPerWeek: 75,  flightsPerYear: 0, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 6, electricityKwhPerMonth: 170, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'low_meat', foodWasteLevel: 'medium',
        monthlySpendUSD: 140, newElectronicsPerYear: 0, userRegion: 'south_asia' },
      // Feb 2026
      { carType: 'petrol', carKmPerWeek: 70,  flightsPerYear: 0, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 7, electricityKwhPerMonth: 165, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'pescatarian', foodWasteLevel: 'medium',
        monthlySpendUSD: 130, newElectronicsPerYear: 0, userRegion: 'south_asia' },
      // Mar 2026 — goes vegetarian
      { carType: 'hybrid', carKmPerWeek: 65,  flightsPerYear: 0, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 8, electricityKwhPerMonth: 155, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low',
        monthlySpendUSD: 120, newElectronicsPerYear: 0, userRegion: 'south_asia' },
      // Apr 2026
      { carType: 'hybrid', carKmPerWeek: 60,  flightsPerYear: 1, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 8, electricityKwhPerMonth: 150, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low',
        monthlySpendUSD: 110, newElectronicsPerYear: 0, userRegion: 'south_asia' },
      // May 2026
      { carType: 'hybrid', carKmPerWeek: 55,  flightsPerYear: 0, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 9, electricityKwhPerMonth: 145, gridRegion: 'india',
        heatingType: 'none', householdSize: 3, dietType: 'vegetarian', foodWasteLevel: 'low',
        monthlySpendUSD: 100, newElectronicsPerYear: 0, userRegion: 'south_asia' },
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
      { carType: 'petrol', carKmPerWeek: 300, flightsPerYear: 8, flightTypeRatio: 'mostly_long',
        publicTransitHoursPerWeek: 0, electricityKwhPerMonth: 900, gridRegion: 'north_america',
        heatingType: 'natural_gas', householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'high',
        monthlySpendUSD: 800, newElectronicsPerYear: 3, userRegion: 'north_america' },
      // Jan 2026
      { carType: 'petrol', carKmPerWeek: 280, flightsPerYear: 6, flightTypeRatio: 'mostly_long',
        publicTransitHoursPerWeek: 1, electricityKwhPerMonth: 850, gridRegion: 'north_america',
        heatingType: 'natural_gas', householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'high',
        monthlySpendUSD: 750, newElectronicsPerYear: 2, userRegion: 'north_america' },
      // Feb 2026
      { carType: 'petrol', carKmPerWeek: 290, flightsPerYear: 4, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 1, electricityKwhPerMonth: 820, gridRegion: 'north_america',
        heatingType: 'natural_gas', householdSize: 2, dietType: 'heavy_meat', foodWasteLevel: 'medium',
        monthlySpendUSD: 700, newElectronicsPerYear: 1, userRegion: 'north_america' },
      // Mar 2026 — buys hybrid
      { carType: 'hybrid', carKmPerWeek: 270, flightsPerYear: 4, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 2, electricityKwhPerMonth: 800, gridRegion: 'north_america',
        heatingType: 'natural_gas', householdSize: 2, dietType: 'medium_meat', foodWasteLevel: 'medium',
        monthlySpendUSD: 680, newElectronicsPerYear: 1, userRegion: 'north_america' },
      // Apr 2026
      { carType: 'hybrid', carKmPerWeek: 260, flightsPerYear: 3, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 2, electricityKwhPerMonth: 780, gridRegion: 'north_america',
        heatingType: 'natural_gas', householdSize: 2, dietType: 'medium_meat', foodWasteLevel: 'medium',
        monthlySpendUSD: 650, newElectronicsPerYear: 0, userRegion: 'north_america' },
      // May 2026
      { carType: 'hybrid', carKmPerWeek: 250, flightsPerYear: 2, flightTypeRatio: 'mixed',
        publicTransitHoursPerWeek: 3, electricityKwhPerMonth: 760, gridRegion: 'north_america',
        heatingType: 'heat_pump', householdSize: 2, dietType: 'low_meat', foodWasteLevel: 'medium',
        monthlySpendUSD: 600, newElectronicsPerYear: 0, userRegion: 'north_america' },
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
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 2, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 10, electricityKwhPerMonth: 120, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 200, newElectronicsPerYear: 0, userRegion: 'europe' },
      // Jan 2026
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 0, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 10, electricityKwhPerMonth: 115, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 180, newElectronicsPerYear: 0, userRegion: 'europe' },
      // Feb 2026
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 0, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 11, electricityKwhPerMonth: 110, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 170, newElectronicsPerYear: 0, userRegion: 'europe' },
      // Mar 2026 — takes one flight
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 1, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 11, electricityKwhPerMonth: 105, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 160, newElectronicsPerYear: 1, userRegion: 'europe' },
      // Apr 2026
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 0, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 12, electricityKwhPerMonth: 100, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 150, newElectronicsPerYear: 0, userRegion: 'europe' },
      // May 2026
      { carType: 'none', carKmPerWeek: 0,  flightsPerYear: 0, flightTypeRatio: 'mostly_short',
        publicTransitHoursPerWeek: 12, electricityKwhPerMonth: 95, gridRegion: 'europe',
        heatingType: 'renewable', householdSize: 1, dietType: 'vegan', foodWasteLevel: 'low',
        monthlySpendUSD: 140, newElectronicsPerYear: 0, userRegion: 'europe' },
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
      // Baseline from first entry's relevant category
      const first    = entries[0];
      const catMap = {
        transport: first.transportKg,
        energy:    first.energyKg,
        diet:      first.dietKg,
        shopping:  first.shoppingKg,
        overall:   first.totalKgPerYear,
        water:     0,
      };
      const baselineKg        = catMap[g.category] ?? first.totalKgPerYear;
      const targetKg          = Math.round(baselineKg * (1 - g.targetReductionPct / 100));
      

      // Build progressHistory from each monthly entry
      const progressHistory = entries.map((e) => {
        const catKg = {
          transport: e.transportKg,
          energy:    e.energyKg,
          diet:      e.dietKg,
          shopping:  e.shoppingKg,
          overall:   e.totalKgPerYear,
          water:     0,
        };
        const currentKg   = catKg[g.category] ?? e.totalKgPerYear;
        const pctAchieved = baselineKg === targetKg ? 0 :
          Math.round(((baselineKg - currentKg) / (baselineKg - targetKg)) * 100);
        return { date: new Date(e.createdAt), currentKg, pctAchieved };
      });

      const latestProgress  = progressHistory[progressHistory.length - 1];
      const pctDone         = latestProgress.pctAchieved;
      const status          = pctDone >= 100 ? 'achieved'
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