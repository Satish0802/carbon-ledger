const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // Which emission category this goal targets
    category: {
        type: String,
        enum: ['transport', 'energy', 'diet', 'shopping', 'water', 'overall'],
        required: true,
    },

    // Human-readable title e.g. "Cut driving by 20%"
    title: { type: String, required: true, maxlength: 120 },

    // Baseline value (kg CO2e) taken from the EmissionEntry at goal creation time
    baselineKg: { type: Number, required: true },

    // Target reduction as a percentage (e.g. 20 = reduce by 20%)
    targetReductionPct: { type: Number, required: true, min: 1, max: 100 },

    // Derived: what the user needs to reach (kg CO2e)
    targetKg: { type: Number, required: true },

    // Deadline
    deadline: { type: Date, required: true },

    // Status
    status: {
        type: String,
        enum: ['active', 'achieved', 'missed', 'cancelled'],
        default: 'active',
    },

    // Progress snapshots — updated each time the user submits a new EmissionEntry
    progressHistory: [{
        date:       { type: Date,   default: Date.now },
        currentKg:  { type: Number, required: true },
        pctAchieved: { type: Number, required: true }, // 0–100+
    }],

    // Latest progress shortcut (denormalised for quick reads)
    latestKg: { type: Number, default: null },
    latestPctAchieved: { type: Number, default: 0 },

}, { timestamps: true });

goalSchema.index({ userId: 1, status: 1 });

const Goal = mongoose.model('Goal', goalSchema);
module.exports = Goal;