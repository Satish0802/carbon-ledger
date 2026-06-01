const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

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

// Update user — only allows updating own account
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Prevent users from updating other accounts
    if (req.user.userId !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { username, email, password } = req.body;
    const updates = { username, email };

    if (password) {
      updates.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

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