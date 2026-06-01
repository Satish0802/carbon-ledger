const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/cookies');
const Profile = require('../models/UserProfile'); 

router.get('/:uid', authMiddleware, async (req, res) => {
  if (req.user.userId !== req.params.uid) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const profile = await Profile.findOne({ userId: req.params.uid });
    if (!profile) return res.status(404).json({ error: 'No profile found' });
    res.json(profile);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:uid', authMiddleware, async (req, res) => {
  if (req.user.userId !== req.params.uid) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const profile = await Profile.findOneAndUpdate(
      { userId: req.params.uid },
      { ...req.body, userId: req.params.uid },
      { upsert: true, new: true }
    );
    res.json(profile);
  } catch { res.status(500).json({ error: 'Server error' }); }
}); 

module.exports = router;