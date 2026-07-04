const mongoose = require('mongoose');

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
  carKmPerWeek: { type: Number, default: 0 },

  shortHaulFlightsPerYear:  { type: Number, default: 0 },
  mediumHaulFlightsPerYear: { type: Number, default: 0 },
  longHaulFlightsPerYear:   { type: Number, default: 0 },

  busHoursPerWeek:       { type: Number, default: 0 },
  trainHoursPerWeek:     { type: Number, default: 0 },
  metroHoursPerWeek:     { type: Number, default: 0 },
  motorbikeKmPerWeek:    { type: Number, default: 0 },

  // ── Home Energy ────────────────────────────────────────────────────────────
  electricityKwhPerMonth: { type: Number, default: 0 },
  gridRegion: {
    type: String,
    enum: [
      'global_average', // 436 g/kWh
      'europe',         // 258 g/kWh
      'north_america',  // 369 g/kWh
      'latin_america',  // 218 g/kWh
      'china',          // 537 g/kWh
      'india',          // 708 g/kWh
      'southeast_asia', // 529 g/kWh
      'middle_east',    // 618 g/kWh
      'africa',         // 548 g/kWh
      'oceania',        // 521 g/kWh
    ],
    default: 'global_average',
  },
  heatingType: {
    type: String,
    enum: ['none', 'natural_gas', 'electric', 'heat_pump', 'renewable', 'lpg', 'oil', 'wood', 'district', 'solar'],
    default: 'none',
  },
  heatingHoursPerDay: { type: Number, default: 0 },
  cookingFuelType: {
    type: String,
    enum: ['electric', 'natural_gas', 'lpg', 'biomass'],
    default: 'electric',
  },
  householdSize: { type: Number, default: 1 },

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
  localFoodPct: { type: Number, default: 30 },

  // ── Shopping ──────────────────────────────────────────────────────────────
  newClothingItemsPerYear: { type: Number, default: 0 },
  clothingType: {
    type: String,
    enum: ['fast_fashion', 'mixed', 'sustainable'],
    default: 'mixed',
  },
  newElectronicsPerYear: { type: Number, default: 0 },
  generalGoodsMonthlyUSD: { type: Number, default: 0 },
  streamingHoursPerDay: { type: Number, default: 0 },

  // ── Water ─────────────────────────────────────────────────────────────────
  hotWaterSource: {
    type: String,
    enum: ['electric', 'natural_gas', 'solar', 'heat_pump'],
    default: 'electric',
  },
  showerMinutesPerDay: { type: Number, default: 0 },
  bathsPerWeek: { type: Number, default: 0 },

  // ── Subtotals (kg CO2e / year, calculated server-side) ────────────────────
  transportKg: { type: Number, default: 0 },
  energyKg:    { type: Number, default: 0 },
  dietKg:      { type: Number, default: 0 },
  shoppingKg:  { type: Number, default: 0 },
  waterKg:     { type: Number, default: 0 },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalKgPerYear:     { type: Number, default: 0 },
  globalAverageKg:    { type: Number, default: 4800 }, // IPCC 2023 global avg
  percentileVsGlobal: { type: Number, default: 0 },    // 0–100, lower = better

  userRegion: { type: String, default: 'global' },

}, { timestamps: true });

emissionEntrySchema.index({ userId: 1, createdAt: -1 });

const EmissionEntry = mongoose.model('EmissionEntry', emissionEntrySchema);
module.exports = EmissionEntry;