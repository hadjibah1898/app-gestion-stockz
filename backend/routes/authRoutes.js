const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Routes publiques (pas besoin d'être authentifié)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);

router.post('/change-password', protect, authController.changePassword);
// Routes protégées (nécessitent un token JWT)
router.get('/me', protect, authController.getCurrentUser);
router.put('/profile', protect, authController.updateProfile);

// --- Routes Admin ---
// Créer un gérant
router.post('/create-manager', protect, authorize('Admin'), authController.createManager);
// Obtenir tous les utilisateurs
router.get('/users', protect, authorize('Admin'), authController.getUsers);
router.get('/users/trash', protect, authorize('Admin'), authController.getDeletedUsers);

// Routes de modification et suppression des gérants
router.put('/managers/:id', protect, authorize('Admin'), authController.updateManager);
router.put('/managers/:id/restore', protect, authorize('Admin'), authController.restoreManager);

module.exports = router;
