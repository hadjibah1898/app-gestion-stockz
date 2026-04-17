const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Boutique = require('../models/Boutique');
const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const { logAction } = require('../services/auditLogService');

exports.register = async (req, res) => {
    try {
        const { nom, email, password } = req.body;
        const user = new User({ nom, email, password });
        await user.save();
        res.status(201).json({ message: "Utilisateur créé avec succès" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select('+password');
        
        if (!user || !(await user.comparePassword(password))) {
            await logAction({
                req,
                user: { _id: '000000000000000000000000', nom: 'Système' },
                action: 'LOGIN_FAILURE',
                entity: 'User',
                details: { email: email, reason: 'Identifiants invalides' },
                status: 'FAILURE',
                errorMessage: 'Identifiants invalides'
            });
            return res.status(401).json({ message: "Identifiants invalides" });
        }

        if (user.active === false && user.role !== 'Admin') {
            await logAction({ req, user, action: 'LOGIN_FAILURE', entity: 'User', details: { email: email, reason: 'Compte désactivé' }, status: 'FAILURE', errorMessage: 'Compte désactivé' });
            return res.status(403).json({ message: "Votre compte est désactivé. Veuillez contacter l'administrateur." });
        }

        if (user.role === 'Gérant' && !user.boutique) {
            await logAction({ req, user, action: 'LOGIN_FAILURE', entity: 'User', details: { email: email, reason: 'Aucune boutique associée' }, status: 'FAILURE', errorMessage: 'Aucune boutique associée' });
            return res.status(403).json({ message: "Accès refusé : Aucune boutique n'est associée à ce compte." });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, boutique: user.boutique }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        user.lastLogin = new Date();
        await user.save();

        await logAction({
            req,
            user,
            action: 'LOGIN_SUCCESS',
            entity: 'User',
            status: 'SUCCESS'
        });

        res.json({ token, role: user.role, nom: user.nom, mustChangePassword: user.mustChangePassword });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id }).sort({ createdAt: -1 }).limit(20);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.markNotificationRead = async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.status(200).json({ message: "Notification marquée comme lue" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, read: false },
            { $set: { read: true } }
        );
        res.status(200).json({ message: "Toutes les notifications lues." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- FONCTION CORRIGÉE POUR PLUSIEURS GÉRANTS ---
exports.updateManager = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "Gérant introuvable." });

        const beforeUpdate = user.toObject();

        if (req.body.boutique && req.body.boutique !== (user.boutique ? user.boutique.toString() : null)) {
            const boutiqueObj = await Boutique.findById(req.body.boutique);
            if (boutiqueObj && boutiqueObj.type === 'Centrale') {
                return res.status(400).json({ message: "Le Dépôt Principal ne peut pas être attribué à un gérant." });
            }
            // Suppression de la vérification "assignedManager" pour autoriser plusieurs gérants
        }

        user.nom = req.body.nom || user.nom;
        user.email = req.body.email || user.email;
        
        if (req.body.boutique !== undefined) user.boutique = req.body.boutique || null;
        if (req.body.active !== undefined) user.active = req.body.active;
        if (req.body.password) user.password = req.body.password;

        const updatedUser = await user.save();

        await logAction({
            req, user: req.user, action: 'UPDATE_USER', entity: 'User', entityId: updatedUser._id,
            details: { before: beforeUpdate, after: updatedUser.toObject() }, status: 'SUCCESS'
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Cet email est déjà utilisé." });
        res.status(400).json({ message: error.message });
    }
};

// --- FONCTION CORRIGÉE POUR PLUSIEURS GÉRANTS ---
exports.createManager = async (req, res) => {
    try {
        const { nom, email, boutique } = req.body;
        let { password } = req.body;

        if (!password) password = Math.random().toString(36).slice(-8);
 
        if (boutique) {
            const boutiqueExists = await Boutique.findById(boutique);
            if (!boutiqueExists) return res.status(404).json({ message: "Boutique introuvable." });
            
            if (boutiqueExists.type === 'Centrale') {
                return res.status(400).json({ message: "Le Dépôt Principal ne peut pas être attribué à un gérant." });
            }
            // On ne bloque plus si un autre gérant est déjà dans cette boutique
        }

        const user = await User.create({
            nom, email, password, role: 'Gérant',
            boutique: boutique || null,
            mustChangePassword: true
        });

        await logAction({
            req, user: req.user, action: 'CREATE_USER', entity: 'User', entityId: user._id,
            details: { createdUser: { nom: user.nom, email: user.email } }, status: 'SUCCESS'
        });

        // Envoi Email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Vos identifiants StockDash',
            html: `<p>Bonjour ${nom}, votre compte a été créé. Email: ${email}, Passe: ${password}</p>`
        };

        transporter.sendMail(mailOptions).catch(err => console.error("Email error:", err));

        res.status(201).json({ message: "Compte Gérant créé avec succès.", user });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Email déjà utilisé." });
        res.status(400).json({ message: error.message });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password').populate('boutique');
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        if (!user || !await user.comparePassword(currentPassword)) {
            return res.status(400).json({ message: "Mot de passe actuel incorrect." });
        }
        user.password = newPassword;
        user.mustChangePassword = false;
        await user.save();
        res.status(200).json({ message: "Mot de passe modifié." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const { search, role } = req.query;
        const query = { deleted: { $ne: true } };
        if (role) query.role = role;
        if (search) {
            query.$or = [
                { nom: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        const users = await User.find(query).select('-password').populate('boutique').sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDeletedUsers = async (req, res) => {
    try {
        const users = await User.find({ deleted: true }).select('-password').populate('boutique');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.restoreManager = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { deleted: false });
        res.status(200).json({ message: "Gérant restauré." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "Email non trouvé." });

        const tempPassword = Math.random().toString(36).slice(-8);
        user.password = tempPassword;
        user.mustChangePassword = true;
        await user.save();

        res.status(200).json({ message: "Email de réinitialisation envoyé." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (req.body.nom) user.nom = req.body.nom;
        if (req.body.email) user.email = req.body.email;
        await user.save();
        res.status(200).json({ message: "Profil mis à jour." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find().populate('recipient', 'nom email role').sort({ createdAt: -1 }).limit(100);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};