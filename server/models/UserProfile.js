const mongoose = require('mongoose');

// Stores extra context about the user that isn't part of auth
// One document per user — created after first calculator submission

const userProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,   // one profile per user
    },

    // Location context — used for display and grid region suggestion only
    // (We don't gate factors on country — all factors are global IPCC defaults)
    country: { type: String, default: '' },
    continent: {
        type: String,
        enum: ['africa', 'asia', 'europe', 'north_america', 'south_america', 'oceania', 'prefer_not_to_say'],
        default: 'prefer_not_to_say',
    },

    // Household
    householdSize: { type: Number, default: 1, min: 1, max: 20 },
    homeType: {
        type: String,
        enum: ['apartment', 'small_house', 'large_house', 'shared'],
        default: 'apartment',
    },

    // Lifestyle context (informational, shown on profile)
    occupationType: {
        type: String,
        enum: ['office_based', 'remote', 'hybrid', 'outdoor', 'student', 'other'],
        default: 'other',
    },

    // Units preference
    preferredDistanceUnit: {
        type: String,
        enum: ['km', 'miles'],
        default: 'km',
    },

    // Whether the user has completed at least one calculator submission
    hasCompletedCalculator: { type: Boolean, default: false },

    // Reference to their most recent EmissionEntry (for quick dashboard load)
    latestEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmissionEntry',
        default: null,
    },

    // Onboarding step tracking
    onboardingStep: {
        type: String,
        enum: ['pending', 'calculator', 'goals', 'complete'],
        default: 'pending',
    },

}, { timestamps: true });

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
module.exports = UserProfile;