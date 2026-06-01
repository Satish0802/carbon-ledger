const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); 
require('dotenv').config();

const userRoutes     = require('./routes/user');
const emissionRoutes = require('./routes/emissions');
const goalRoutes     = require('./routes/goals');
const profileRoutes  = require('./routes/profile'); 
const connectDB      = require('./db/connect');

const app  = express();
const port = process.env.PORT || 8000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://carbon-ledger-phi.vercel.app'
  ],
  credentials: true,  // ✅ Required for cookies to be sent cross-origin
}));
app.use(express.json());
app.use(cookieParser()); // ✅ ADD THIS — must be before your routes

// ─── DB ───────────────────────────────────────────────────────────────────────
connectDB();

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/users',     userRoutes);
app.use('/emissions', emissionRoutes);
app.use('/goals',     goalRoutes);
app.use('/profile',   profileRoutes); 

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`Carbon Ledger server running on port ${port}`);
});