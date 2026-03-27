const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateAuth } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Routes publiques (pas besoin d'être authentifié)
router.post('/register', validateAuth, authController.register);
router.post('/login', validateAuth, authController.login);
router.post('/forgot-password', authController.forgotPassword);

router.post('/change-password', protect, authController.changePassword);
// Routes protégées (nécessitent un token JWT)
router.get('/me', protect, authController.getCurrentUser);
router.put('/profile', protect, authController.updateProfile);
router.get('/notifications', protect, authController.getNotifications);
router.put('/notifications/:id/read', protect, validateObjectId('id'), authController.markNotificationRead);
router.put('/notifications/mark-all-read', protect, authController.markAllNotificationsRead);

// --- Routes Admin ---
// Créer un gérant
router.post('/create-manager', protect, authorize('Admin'), validateAuth, authController.createManager);
// Obtenir tous les utilisateurs
router.get('/users', protect, authorize('Admin'), authController.getUsers);
router.get('/users/trash', protect, authorize('Admin'), authController.getDeletedUsers);

// Routes de modification et suppression des gérants
router.put('/managers/:id', protect, authorize('Admin'), validateObjectId('id'), authController.updateManager);
router.put('/managers/:id/restore', protect, authorize('Admin'), validateObjectId('id'), authController.restoreManager);

// Route pour l'historique complet des notifications (Admin)
router.get('/admin/notifications', protect, authorize('Admin'), authController.getAllNotifications);

module.exports = router;
