const mongoose = require('mongoose');

// Sane upper bounds — generous enough for real users, tight enough to block
// garbage/malicious payloads (e.g. carKmPerWeek: 999999999) from ever reaching
// the calculation layer. Mongoose enforces these at the DB layer regardless of
// what the frontend sends.
const BOUNDS = {
  kmPerWeek:        2_000,  // ~286 km/day — generous even for long commutes
  flightsPerYear:   100,
  hoursPerWeek:     100,    // can't exceed hours in a week realistically
  kwhPerMonth:      10_000,
  heatingHoursDay:  24,
  householdSize:    20,
  pct:              100,
  clothingItems:    500,
  electronicsItems: 50,
  monthlyUSD:       100_000,
  hoursPerDay:      24,
  showerMinDay:     180,
  bathsPerWeek:     50,
};

const emissionEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // ── Transport ──────────────────────────────────────────────────────────────
  carType: {
    type: String,
    enum: ['none', 'petrol', 'diesel', 'hybrid', 'electric'],
    default: 'none',
  },
  carKmPerWeek: { type: Number, default: 0, min: 0, max: BOUNDS.kmPerWeek },

  shortHaulFlightsPerYear:  { type: Number, default: 0, min: 0, max: BOUNDS.flightsPerYear },
  mediumHaulFlightsPerYear: { type: Number, default: 0, min: 0, max: BOUNDS.flightsPerYear },
  longHaulFlightsPerYear:   { type: Number, default: 0, min: 0, max: BOUNDS.flightsPerYear },

  busHoursPerWeek:       { type: Number, default: 0, min: 0, max: BOUNDS.hoursPerWeek },
  trainHoursPerWeek:     { type: Number, default: 0, min: 0, max: BOUNDS.hoursPerWeek },
  metroHoursPerWeek:     { type: Number, default: 0, min: 0, max: BOUNDS.hoursPerWeek },
  motorbikeKmPerWeek:    { type: Number, default: 0, min: 0, max: BOUNDS.kmPerWeek },

  // ── Home Energy ────────────────────────────────────────────────────────────
  electricityKwhPerMonth: { type: Number, default: 0, min: 0, max: BOUNDS.kwhPerMonth },
  gridRegion: {
    type: String,
    enum: [
      'global_average', 'europe', 'north_america', 'latin_america',
      'china', 'india', 'southeast_asia', 'middle_east', 'africa', 'oceania',
    ],
    default: 'global_average',
  },
  heatingType: {
    type: String,
    enum: ['none', 'natural_gas', 'electric', 'heat_pump', 'renewable', 'lpg', 'oil', 'wood', 'district', 'solar'],
    default: 'none',
  },
  heatingHoursPerDay: { type: Number, default: 0, min: 0, max: BOUNDS.heatingHoursDay },
  cookingFuelType: {
    type: String,
    enum: ['electric', 'natural_gas', 'lpg', 'biomass'],
    default: 'electric',
  },
  householdSize: { type: Number, default: 1, min: 1, max: BOUNDS.householdSize },

  // ── Diet ──────────────────────────────────────────────────────────────────
  dietType: {
    type: String,
    enum: ['heavy_meat', 'medium_meat', 'low_meat', 'pescatarian', 'vegetarian', 'vegan'],
    default: 'medium_meat',
  },
  foodWasteLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  localFoodPct: { type: Number, default: 30, min: 0, max: BOUNDS.pct },

  // ── Shopping ──────────────────────────────────────────────────────────────
  newClothingItemsPerYear: { type: Number, default: 0, min: 0, max: BOUNDS.clothingItems },
  clothingType: {
    type: String,
    enum: ['fast_fashion', 'mixed', 'sustainable'],
    default: 'mixed',
  },
  newElectronicsPerYear: { type: Number, default: 0, min: 0, max: BOUNDS.electronicsItems },
  generalGoodsMonthlyUSD: { type: Number, default: 0, min: 0, max: BOUNDS.monthlyUSD },
  streamingHoursPerDay: { type: Number, default: 0, min: 0, max: BOUNDS.hoursPerDay },

  // ── Water ─────────────────────────────────────────────────────────────────
  hotWaterSource: {
    type: String,
    enum: ['electric', 'natural_gas', 'solar', 'heat_pump'],
    default: 'electric',
  },
  showerMinutesPerDay: { type: Number, default: 0, min: 0, max: BOUNDS.showerMinDay },
  bathsPerWeek: { type: Number, default: 0, min: 0, max: BOUNDS.bathsPerWeek },

  // ── Subtotals (kg CO2e / year, calculated server-side) ────────────────────
  transportKg: { type: Number, default: 0, min: 0 },
  energyKg:    { type: Number, default: 0, min: 0 },
  dietKg:      { type: Number, default: 0, min: 0 },
  shoppingKg:  { type: Number, default: 0, min: 0 },
  waterKg:     { type: Number, default: 0, min: 0 },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalKgPerYear:     { type: Number, default: 0, min: 0 },
  globalAverageKg:    { type: Number, default: 4800 }, // IPCC 2023 global avg
  percentileVsGlobal: { type: Number, default: 0, min: 0, max: 100 },

  userRegion: { type: String, default: 'global' },

}, { timestamps: true });

emissionEntrySchema.index({ userId: 1, createdAt: -1 });

const EmissionEntry = mongoose.model('EmissionEntry', emissionEntrySchema);
module.exports = EmissionEntry;