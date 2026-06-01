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

  flightsPerYear: { type: Number, default: 0 },       // total flights, any length
  flightTypeRatio: {
    type: String,
    enum: ['mostly_short', 'mixed', 'mostly_long'],   // used to weight avg distance
    default: 'mixed',
  },

  publicTransitHoursPerWeek: { type: Number, default: 0 },

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
    enum: ['none', 'natural_gas', 'electric', 'heat_pump', 'renewable'],
    default: 'none',
  },
  householdSize: { type: Number, default: 1 },

  // ── Diet ──────────────────────────────────────────────────────────────────
  dietType: {
    type: String,
    // Annual kg CO2e per person (IPCC AR6 / Poore & Nemecek 2018)
    // heavy_meat: ~3300 | medium_meat: ~2500 | low_meat: ~1900
    // pescatarian: ~1500 | vegetarian: ~1200 | vegan: ~800
    enum: ['heavy_meat', 'medium_meat', 'low_meat', 'pescatarian', 'vegetarian', 'vegan'],
    default: 'medium_meat',
  },
  foodWasteLevel: {
    type: String,
    enum: ['low', 'medium', 'high'], // 0% / +10% / +25% multiplier
    default: 'medium',
  },

  // ── Shopping ──────────────────────────────────────────────────────────────
  monthlySpendUSD: { type: Number, default: 0 },   // general goods + clothing combined
  newElectronicsPerYear: { type: Number, default: 0 },

  // ── Subtotals (kg CO2e / year, calculated server-side) ────────────────────
  transportKg: { type: Number, default: 0 },
  energyKg:    { type: Number, default: 0 },
  dietKg:      { type: Number, default: 0 },
  shoppingKg:  { type: Number, default: 0 },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalKgPerYear:     { type: Number, default: 0 },
  globalAverageKg:    { type: Number, default: 4800 }, // IPCC 2023 global avg
  percentileVsGlobal: { type: Number, default: 0 },    // 0–100, lower = better

  userRegion: { type: String, default: 'global' },

}, { timestamps: true });

emissionEntrySchema.index({ userId: 1, createdAt: -1 });

const EmissionEntry = mongoose.model('EmissionEntry', emissionEntrySchema);
module.exports = EmissionEntry;