/**
 * @file authRoutes.js
 * @description Routes d'authentification : login, register, gestion utilisateurs, notifications.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkMustChangePassword } = require('../middleware/passwordMiddleware');

// Public routes (no authentication required)
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/forgot-password', authController.forgotPassword);

// All routes below this middleware require authentication
router.use(protect);

// Autoriser le changement de mot de passe même si mustChangePassword est vrai
router.put('/change-password', authController.changePassword);

// All routes below this middleware also require password change check
router.use(checkMustChangePassword);

router.get('/me', authController.getCurrentUser);
router.put('/profile', authController.updateProfile);
router.get('/notifications', authController.getNotifications);
router.put('/notifications/:id/read', authController.markNotificationRead);
router.put('/notifications/read-all', authController.markAllNotificationsRead);
router.get('/users', authorize('SuperAdmin', 'Admin', 'AdminBar', 'Gérant', 'GérantBar'), authController.getUsers);
router.post('/users', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), authController.register);
router.put('/users/:id', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), authController.updateManager);
router.delete('/users/:id', authorize('Admin', 'AdminBar'), authController.deleteManager);
router.get('/users/deleted', authorize('SuperAdmin', 'Admin', 'AdminBar'), authController.getDeletedUsers);
router.put('/users/:id/restore', authorize('SuperAdmin', 'Admin', 'AdminBar'), authController.restoreManager);
router.get('/all-notifications', authorize('SuperAdmin', 'Admin', 'AdminBar'), authController.getAllNotifications);
router.post('/create-manager', authorize('Admin', 'AdminBar'), authController.createManager);
router.post('/create-cashier', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), authController.createManager);

// Administrative routes for SuperAdmin
router.put('/users/:id/validate', authorize('SuperAdmin'), authController.validateUser);
router.delete('/users/:id/force', authorize('SuperAdmin'), authController.forceDeleteManager);

module.exports = router;
