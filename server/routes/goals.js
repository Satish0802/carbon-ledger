const express = require('express');
const router = express.Router();
const Goal = require('../models/goal');
const auth = require('../middleware/cookies');

// POST /goals — create a new goal
router.post('/', async (req, res) => {
    try {
        const { userId, category, title, baselineKg, targetReductionPct, deadline } = req.body;

        if (!userId || !category || !baselineKg || !targetReductionPct || !deadline) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const targetKg = baselineKg * (1 - targetReductionPct / 100);

        const goal = new Goal({
            userId, category, title, baselineKg,
            targetReductionPct, targetKg,
            deadline: new Date(deadline),
        });

        await goal.save();
        res.status(201).json({ message: 'Goal created', goal });
    } catch (error) {
        res.status(500).json({ error: 'Error creating goal' });
    }
});

// GET /goals/:userId — all active goals for a user
router.get('/:userId', async (req, res) => {
    try {
        const goals = await Goal
            .find({ userId: req.params.userId, status: 'active' })
            .sort({ deadline: 1 });
        res.json(goals);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching goals' });
    }
});

// PATCH /goals/:id/progress — update progress after new emission entry
router.patch('/:id/progress', async (req, res) => {
    try {
        const { currentKg } = req.body;
        const goal = await Goal.findById(req.params.id);
        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        const pctAchieved = Math.round(
            ((goal.baselineKg - currentKg) / (goal.baselineKg - goal.targetKg)) * 100
        );

        goal.progressHistory.push({ currentKg, pctAchieved });
        goal.latestKg = currentKg;
        goal.latestPctAchieved = pctAchieved;

        if (currentKg <= goal.targetKg) goal.status = 'achieved';
        else if (new Date() > goal.deadline) goal.status = 'missed';

        await goal.save();
        res.json({ message: 'Progress updated', goal });
    } catch (error) {
        res.status(500).json({ error: 'Error updating goal progress' });
    }
});

// DELETE /goals/:id
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Goal.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Goal not found' });
        res.json({ message: 'Goal deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting goal' });
    }
});

module.exports = router;