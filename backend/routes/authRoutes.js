const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateAuth } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Routes publiques
router.post('/register', validateAuth, authController.register);
router.post('/login', validateAuth, authController.login);
router.post('/forgot-password', authController.forgotPassword);

// Routes protégées
router.post('/change-password', protect, authController.changePassword);
router.get('/me', protect, authController.getCurrentUser);
router.put('/profile', protect, authController.updateProfile);
router.get('/notifications', protect, authController.getNotifications);
router.put('/notifications/:id/read', protect, validateObjectId('id'), authController.markNotificationRead);
router.put('/notifications/mark-all-read', protect, authController.markAllNotificationsRead);

// --- Routes Admin ---
router.post('/create-manager', protect, authorize('Admin'), validateAuth, authController.createManager);
router.get('/users/trash', protect, authorize('Admin'), authController.getDeletedUsers);
router.put('/managers/:id', protect, authorize('Admin'), validateObjectId('id'), authController.updateManager);
router.put('/managers/:id/restore', protect, authorize('Admin'), validateObjectId('id'), authController.restoreManager);
router.delete('/managers/:id', protect, authorize('SuperAdmin', 'Admin'), validateObjectId('id'), authController.deleteManager);

router.get('/admin/notifications', protect, authorize('Admin'), authController.getAllNotifications);
router.get('/users', protect, authorize('Admin', 'Gérant'), authController.getUsers);
router.post('/users', protect, authorize('Admin', 'Gérant'), authController.register);

module.exports = router;
