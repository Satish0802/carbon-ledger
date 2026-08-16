const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user');
const UserProfile = require('../models/UserProfile');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const SALT_ROUNDS = 10;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Register
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    res.status(500).json({ error: 'Error registering user' });
  }
};

// Login — signs JWT and sets secure cookie
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' }); 
    }
    if (!user.password) {
      return res.status(401).json({ error: 'This account signs in with Google. Use "Sign in with Google" instead.' });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ✅ Sign the JWT
    const token = jwt.sign(
  { userId: user._id, username: user.username, role: user.role }, 
  process.env.JWT_SECRET,
  { expiresIn: '7d', algorithm: 'HS256' }
);

    // ✅ Set secure cookie
    res.cookie('token', token, COOKIE_OPTIONS);

    const { password: _, ...userWithoutPassword } = user._doc;
    res.json({ message: 'Login successful', user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
};

// Logout — clears the cookie
exports.logout = (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Logged out successfully' });
};

// Google sign-in — verifies the ID token from the "Sign in with Google"
// button, then finds or creates a matching user and signs the same
// httpOnly JWT cookie the local login flow uses.
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Google sign-in is not configured' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // Derive a unique username from the Google name/email
      let base = (name || email.split('@')[0]).replace(/\s+/g, '').toLowerCase() || 'user';
      let username = base;
      let suffix = 0;
      while (await User.exists({ username })) {
        suffix += 1;
        username = `${base}${suffix}`;
      }

      user = await User.create({
        username,
        email,
        authProvider: 'google',
        googleId,
      });
    } else if (!user.googleId) {
      // Existing local account signing in with Google for the first time
      user.googleId = googleId;
      await user.save();
    }

    // Seed the profile avatar from Google's picture the first time only —
    // $set so an existing profile's other fields are never touched.
    if (picture) {
      const existingProfile = await UserProfile.findOne({ userId: user._id });
      if (!existingProfile) {
        await UserProfile.create({ userId: user._id, avatar: picture });
      } else if (!existingProfile.avatar) {
        await UserProfile.updateOne({ userId: user._id }, { $set: { avatar: picture } });
      }
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );
    res.cookie('token', token, COOKIE_OPTIONS);

    const { password: _, ...userWithoutPassword } = user._doc;
    res.json({ message: 'Login successful', user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Error signing in with Google' });
  }
};

// Update user — only allows updating own account
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.userId !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { username, currentPassword, newPassword } = req.body;
    const updates = {};

    if (username) updates.username = username;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to set a new one' });
      }
      const user = await User.findById(id);
      if (!user.password) {
        return res.status(400).json({ error: 'This account signs in with Google and has no password to change' });
      }
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      updates.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    const { password: _, ...userWithoutPassword } = updatedUser._doc;
    res.json({ message: 'User updated successfully', user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Error updating user' });
  }
};

// Delete user — only allows deleting own account
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Prevent users from deleting other accounts
    if (req.user.userId !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.clearCookie('token', COOKIE_OPTIONS);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting user' });
  }
};

// Get all users — admin only
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
};

// Get own profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching profile' });
  }
};