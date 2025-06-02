const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  updateUserProfile, 
  getUsers,
  activateAccount,
  uploadProfilePicture,
  deleteOwnAccount,
  resetPasswordRequest,
  resetPassword
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Öffentliche Routen
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/aktivieren/:token', activateAccount);
router.post('/reset-password-request', resetPasswordRequest);
router.post('/reset-password', resetPassword);

// Geschützte Routen
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/profile/picture', protect, upload.single('file'), uploadProfilePicture);

// Admin-Routen
router.get('/', protect, admin, getUsers);

// Eigener Account löschen
router.delete('/me', protect, deleteOwnAccount);

module.exports = router; 