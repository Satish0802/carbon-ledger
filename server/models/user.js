const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    // Local accounts have a password. Google accounts don't.
    password: {
      type: String,
      required: function () { return this.authProvider === 'local'; },
    },

    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    // Google's unique account id — only set for authProvider: 'google'
    googleId: { type: String, unique: true, sparse: true },

    role: {
  type: String,
  enum: ['user', 'admin'],
  default: 'user'
}
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;