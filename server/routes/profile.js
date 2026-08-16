const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const authMiddleware = require('../middleware/cookies');
const { uploadAvatar, AVATAR_DIR } = require('../middleware/upload');
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
    const { userId: _ignored, _id: __ignored, avatar: _avatarIgnored, ...updates } = req.body;
    const profile = await Profile.findOneAndUpdate(
      { userId: req.params.uid },
      { $set: updates, $setOnInsert: { userId: req.params.uid } },
      { upsert: true, new: true }
    );
    res.json(profile);
  } catch { res.status(500).json({ error: 'Server error' }); }
}); 

router.post('/:uid/avatar', authMiddleware, (req, res) => {
  if (req.user.userId !== req.params.uid) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  uploadAvatar.single('avatar')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Could not upload image' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received' });
    }

    try {
      const previous = await Profile.findOne({ userId: req.params.uid });
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      const profile = await Profile.findOneAndUpdate(
        { userId: req.params.uid },
        { $set: { avatar: avatarUrl }, $setOnInsert: { userId: req.params.uid } },
        { upsert: true, new: true }
      );

      if (previous?.avatar && previous.avatar.startsWith('/uploads/avatars/')) {
        const oldPath = path.join(AVATAR_DIR, path.basename(previous.avatar));
        fs.unlink(oldPath, () => {});
      }

      res.json(profile);
    } catch {
      res.status(500).json({ error: 'Server error saving avatar' });
    }
  });
});

module.exports = router;