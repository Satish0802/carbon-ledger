const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/cookies'); 
const admin = require('../middleware/admin'); 

const {
  register,
  login,
  logout,
  updateUser,
  deleteUser,
  getAllUsers,
  getProfile
} = require('../controller/auth'); // ✅ Use controller, no logic in routes

// ─── Public routes (no auth needed) ──────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);

// ─── Protected routes (must be logged in) ────────────────────────────────────
router.post('/logout',     authMiddleware, logout);
router.put('/:id',         authMiddleware, updateUser);
router.delete('/:id',      authMiddleware, deleteUser);
router.get('/all', authMiddleware, admin, getAllUsers);
router.get('/profile', authMiddleware, getProfile);

module.exports = router;