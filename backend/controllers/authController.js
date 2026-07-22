/**
 * @file authController.js
 * @description Contrôleur d'authentification : register, login, gestion utilisateurs, validation SuperAdmin.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Boutique = require('../models/Boutique');
const { transporter } = require('../services/notificationService');
const Notification = require('../models/Notification');
const { syncLocalDataToCloud } = require('../services/syncService');
const { logAction } = require('../services/auditLogService');

exports.register = async (req, res) => {
    try {
        const { nom, email, telephone, accountType, entrepriseNom, ville, registreCommerce, nombreServeursEstime, deviseParDefaut } = req.body;
        let { password, role, boutique } = req.body; // Extract password, role, and boutique as let variables

        let userRole = role || 'Gérant';
        let userBoutique = boutique || null;

        // SÉCURITÉ : Vérifier que seul un SuperAdmin peut créer un autre Admin
        if ((role === 'Admin' || role === 'AdminBar') && (!req.user || req.user.role !== 'SuperAdmin')) {
            return res.status(403).json({ success: false, message: "Action refusée : Seul un SuperAdmin peut créer un compte Administrateur." });
        }

        // Déterminer le rôle et typeCompte selon le type de compte
        let finalRole = role || 'Admin';
        let finalTypeCompte = 'Marchand';
        if (accountType === 'Bar') {
            finalRole = role || 'AdminBar';
            finalTypeCompte = 'Bar';
        }

        // SÉCURITÉ : Si l'utilisateur connecté est un Gérant, il crée forcément un Serveur rattaché à SA boutique
        if (req.user && req.user.role === 'Gérant') {
            userRole = 'Serveur';
            userBoutique = req.user.boutique?._id || req.user.boutique;
        } else if (!userBoutique && boutique) {
            userBoutique = boutique;
        }

        // SÉCURITÉ : Validation du type de boutique pour les Gérants/Serveurs
        if (userBoutique && ['Gérant', 'Serveur'].includes(userRole)) {
            const boutiqueExists = await Boutique.findById(userBoutique);
            if (!boutiqueExists) return res.status(404).json({ message: "Boutique introuvable." });
            if (boutiqueExists.type === 'Centrale') {
                return res.status(400).json({ message: "Le Dépôt Principal ne peut pas être attribué à un gérant ou un serveur." });
            }
        }

        // Générer un mot de passe aléatoire s'il n'est pas fourni
        if (!password) {
            password = Math.random().toString(36).slice(-8);
        }

        const user = new User({
            nom,
            email,
            password,
            telephone,
            businessType: accountType,
            role: finalRole, // Admin pour Marchand, AdminBar pour Bar
            typeCompte: finalTypeCompte,
            boutique: null,
            createur: req.user?._id || req.user?.id,
            mustChangePassword: true,
            active: false
        });
        await user.save();

        // Validation des champs obligatoires pour la création de boutique
        const villeNettoyee = ville ? ville.trim() : '';
        const entrepriseNomNettoye = entrepriseNom ? entrepriseNom.trim() : '';
        if (!villeNettoyee) {
            return res.status(400).json({ 
                success: false, 
                message: "La ville est obligatoire pour créer un établissement." 
            });
        }
        if (!entrepriseNomNettoye) {
            return res.status(400).json({ 
                success: false, 
                message: "Le nom de l'établissement est obligatoire." 
            });
        }

        // Création automatique de la boutique par défaut
        let defaultBoutiqueType;
        let defaultBoutiqueName;
        let defaultBoutiqueAdresse;
        let defaultBoutiqueVille;

        if (accountType === 'Marchand') {
            defaultBoutiqueType = 'Centrale';
            defaultBoutiqueName = entrepriseNomNettoye;
            defaultBoutiqueAdresse = `${villeNettoyee} (Siège)`;
            defaultBoutiqueVille = villeNettoyee;
        } else if (accountType === 'Bar') {
            defaultBoutiqueType = 'Bar';
            defaultBoutiqueName = entrepriseNomNettoye;
            defaultBoutiqueAdresse = `${villeNettoyee} (Établissement)`;
            defaultBoutiqueVille = villeNettoyee;
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Type de compte invalide. Choisissez 'Marchand' ou 'Bar'." 
            });
        }

        // Génération d'un code unique pour la boutique avec vérification
        let generatedCodeBoutique;
        let isUniqueCode = false;
        while (!isUniqueCode) {
            generatedCodeBoutique = `BTQ-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const duplicateCode = await Boutique.findOne({ codeBoutique: generatedCodeBoutique });
            if (!duplicateCode) isUniqueCode = true;
        }

        const defaultBoutique = await Boutique.create({
            nom: defaultBoutiqueName,
            adresse: defaultBoutiqueAdresse,
            ville: defaultBoutiqueVille, // Utilisation du nouveau champ ville
            type: defaultBoutiqueType,
            createur: user._id, // L'utilisateur est le créateur de cette boutique
            codeBoutique: generatedCodeBoutique // Utilisation du code unique généré
        });

        // Lier la boutique créée à l'utilisateur
        user.boutique = defaultBoutique._id;
        await user.save();

        // LOG D'AUDIT SYSTEMATIQUE
        await logAction({
            req,
            user: req.user || { _id: user._id, nom: user.nom },
            action: 'CREATE_USER',
            entity: 'User',
            entityId: user._id,
            details: { createdUser: { nom: user.nom, email: user.email, role: user.role } },
            status: 'SUCCESS'
        });

        // NOTIFICATIONS & SYNC (Sécurisés avec await ou catch isolés)
        const roleLabel = userRole === 'Admin' ? 'Administrateur' : (userRole === 'Serveur' ? 'Serveur' : 'Gérant');
        const mailOptions = {
            to: email, // Correction: Utiliser l'email du nouvel utilisateur
            subject: `Vos identifiants StockDash (Compte ${roleLabel})`,
            html: `<p>Bonjour ${nom}, <br/>Votre compte <b>${roleLabel.toLowerCase()}</b> a été créé avec succès sur StockDash.<br/><br/>Email : <b>${email}</b><br/>Mot de passe temporaire : <b>${password}</b></p>`
        };

        // On attend l'envoi de l'email pour garantir sa distribution avant la fin du cycle de requête
        await transporter.sendMail(mailOptions).catch(err => console.error("Erreur envoi email inscription:", err));

        // La synchronisation cloud reste en tâche de fond (si activée)
        syncLocalDataToCloud(user._id).catch(err => console.error("Erreur lors de la synchronisation immédiate de l'utilisateur:", err));

        res.status(201).json({ message: "Utilisateur créé avec succès", user, tempPassword: password });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Cet email est déjà utilisé par un autre compte." });
        }
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

        // SÉCURITÉ : Personne ne peut se connecter si le compte est inactif (sauf SuperAdmin pour maintenance)
        if (user.active === false && user.role !== 'SuperAdmin') {
            await logAction({ req, user, action: 'LOGIN_FAILURE', entity: 'User', details: { email: email, reason: 'Compte désactivé' }, status: 'FAILURE', errorMessage: 'Compte désactivé' });
            return res.status(403).json({ message: "Votre compte est désactivé. Veuillez contacter l'administrateur." });
        }

        if (['Gérant', 'Serveur'].includes(user.role) && !user.boutique) {
            await logAction({ req, user, action: 'LOGIN_FAILURE', entity: 'User', details: { email: email, reason: 'Aucune boutique associée' }, status: 'FAILURE', errorMessage: 'Aucune boutique associée' });
            return res.status(403).json({ message: `Accès refusé : Aucune boutique n'est associée à votre compte ${user.role.toLowerCase()}.` });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, boutique: user.boutique },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        user.lastLogin = new Date();
        await user.save();

        await logAction({ req, user, action: 'LOGIN_SUCCESS', entity: 'User', status: 'SUCCESS' });

        res.json({
            token,
            id: user._id,
            role: user.role,
            nom: user.nom,
            boutique: user.boutique,
            mustChangePassword: user.mustChangePassword,
            businessType: user.businessType // Ajout du type d'activité
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id || req.user.id }).sort({ createdAt: -1 }).limit(20);
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
            { recipient: req.user._id || req.user.id, read: false },
            { $set: { read: true } }
        );
        res.status(200).json({ message: "Toutes les notifications lues." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateManager = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

        // SÉCURITÉ MULTI-TENANT
        if (req.user?.role === 'Admin' && user.role === 'Gérant' && user.createur?.toString() !== (req.user._id || req.user.id).toString()) {
            return res.status(403).json({ message: "Accès refusé : Vous ne pouvez modifier que les gérants que vous avez créés." });
        }

        const beforeUpdate = user.toObject();

        if (req.body.boutique && req.body.boutique !== (user.boutique ? user.boutique.toString() : null)) {
            const boutiqueObj = await Boutique.findById(req.body.boutique);
            if (boutiqueObj && boutiqueObj.type === 'Centrale') {
                return res.status(400).json({ message: "Le Dépôt Principal ne peut pas être attribué à un gérant." });
            }
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

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user._id || req.user.id)
            .select('-password')
            .populate('boutique')
            .populate('createur', 'nom');
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id || req.user.id);
        if (!user || !await user.comparePassword(currentPassword)) {
            return res.status(400).json({ message: "Mot de passe actuel incorrect." });
        }
        user.password = newPassword;
        user.mustChangePassword = false;
        await user.save();
        res.status(200).json({ message: "Mot de passe modifié avec succès." });
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
        res.status(200).json({ message: "Utilisateur restauré." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteManager = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { active: false, deleted: true }, { new: true });

        if (user) {
            await logAction({
                req,
                user: req.user,
                action: 'DELETE_USER',
                entity: 'User',
                entityId: user._id,
                details: { deletedUser: { nom: user.nom, email: user.email, role: user.role } },
                status: 'SUCCESS'
            });
        }

        res.status(200).json({ success: true, message: "Compte utilisateur supprimé/désactivé avec succès." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "Email non trouvé." });

        const tempPassword = Math.random().toString(36).slice(-8);
        user.password = tempPassword;
        user.mustChangePassword = true;
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Réinitialisation de votre mot de passe StockDash',
            html: `<p>Bonjour, <br/>Votre mot de passe a été réinitialisé.<br/> Nouveau mot de passe temporaire : <b>${tempPassword}</b></p>`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: "Un nouveau mot de passe temporaire a été envoyé par email." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id || req.user.id);
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
        let query = {};
        const currentUserId = req.user._id || req.user.id;

        if (req.user?.role === 'Admin') {
            const myUsers = await User.find({ createur: currentUserId }).select('_id');
            const authorizedUserIds = myUsers.map(u => u._id);
            authorizedUserIds.push(currentUserId);
            query.recipient = { $in: authorizedUserIds };
        } else if (req.user?.role !== 'SuperAdmin') {
            query.recipient = currentUserId;
        }

        const notifications = await Notification.find(query).populate('recipient', 'nom email role').sort({ createdAt: -1 }).limit(100);

        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUsers = async (req, res) => {
    try {
        let query = {};
        const currentUserId = req.user._id || req.user.id;
        const userRole = (req.user?.role || '').toUpperCase();

        query.role = { $ne: 'SuperAdmin' };

        if (userRole === 'SUPERADMIN') {
            // Le Super Admin voit tout, pas de filtres supplémentaires
        } else if (req.user?.role === 'Gérant') {
            query.boutique = req.user.boutique?._id || req.user.boutique;
            query.role = { $in: ['Serveur', 'Caissier'] };
        } else if (req.user?.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: currentUserId }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id);

            query.$or = [
                { boutique: { $in: myBoutiqueIds } },
                { createur: currentUserId }
            ];
            query.role = { $in: ['Gérant', 'Serveur'] };
        }

        const users = await User.find(query).populate('boutique', 'nom');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Valide un compte Admin (Nouvelle Entreprise)
 * Réservé au Super Admin
 */
exports.validateUser = async (req, res) => {
    try {
        if (req.user.role?.toUpperCase() !== 'SUPERADMIN') {
            return res.status(403).json({ success: false, message: "Accès refusé." });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

        // Vérification et tentative de récupération de la boutique pour les Admins (Marchand et Bar)
        if (['Admin', 'AdminBar'].includes(user.role) && !user.boutique) {
            // On cherche si une boutique a été créée par cet utilisateur mais n'a pas été liée
            const existingBoutique = await Boutique.findOne({ createur: user._id });

            if (existingBoutique) {
                // On répare le lien
                user.boutique = existingBoutique._id;
            } else {
                return res.status(400).json({ success: false, message: "Impossible d'activer : cet administrateur n'a pas de boutique rattachée et aucune boutique n'a été trouvée pour ce compte." });
            }
        }

        user.active = true;
        await user.save();

        // Log d'audit
        await logAction({
            req,
            user: req.user,
            action: 'UPDATE_USER',
            entity: 'User',
            entityId: user._id,
            details: { action: 'VALIDATION_COMPTE', email: user.email },
            status: 'SUCCESS'
        });

        // Notification optionnelle par email ici pour prévenir l'Admin qu'il est validé

        res.status(200).json({ success: true, message: "Compte validé avec succès." });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            const messages = Object.values(error.errors).map(err => err.message);
            console.error("Mongoose Validation Error during user validation:", error.errors);
            return res.status(400).json({ message: `Erreur de validation: ${messages.join(', ')}` });
        }
        res.status(500).json({ message: error.message || "Une erreur interne du serveur est survenue." });
    }
};

/**
 * Supprime définitivement un utilisateur (ex: rejet de compte)
 * Réservé au Super Admin
 */
exports.forceDeleteManager = async (req, res) => {
    try {
        if (req.user.role?.toUpperCase() !== 'SUPERADMIN') {
            return res.status(403).json({ success: false, message: "Accès refusé." });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

        await logAction({
            req,
            user: req.user,
            action: 'DELETE_USER',
            entity: 'User',
            entityId: user._id,
            details: { action: 'FORCE_DELETE', email: user.email },
            status: 'SUCCESS'
        });

        res.status(200).json({ success: true, message: "Utilisateur supprimé définitivement." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Crée un Gérant (ou Serveur) rattaché à une boutique existante.
 * Réservé aux Admins. Contrairement à register(), cette route
 * n'essaie pas de créer une boutique — elle utilise une boutique existante.
 */
exports.createManager = async (req, res) => {
    try {
        const { nom, email, password: rawPassword, boutique, role } = req.body;
        const adminId = req.user._id || req.user.id;

        console.log('[createManager] Tentative création:', { nom, email, role, boutique, adminId });

        if (!nom || !email) {
            return res.status(400).json({ success: false, message: "Le nom et l'email sont obligatoires." });
        }

        // SÉCURITÉ : Refuser la création d'Admins via cet endpoint
        // Les Admins ne peuvent créer que des Gérants, Serveurs ou Caissiers
        if (role === 'Admin') {
            return res.status(403).json({ success: false, message: "Action refusée : Seul un SuperAdmin peut créer un compte Administrateur." });
        }

        // Validation boutique si fournie
        if (boutique) {
            const boutiqueExists = await Boutique.findById(boutique);
            if (!boutiqueExists) {
                return res.status(404).json({ success: false, message: "Boutique introuvable." });
            }
            if (boutiqueExists.type === 'Centrale') {
                return res.status(400).json({ success: false, message: "Le Dépôt Principal ne peut pas être attribué à un gérant ou caissier." });
            }
        }

        // Générer un mot de passe aléatoire si non fourni
        const password = rawPassword || Math.random().toString(36).slice(-8);
        const userRole = role || 'Gérant';

        console.log('[createManager] Création utilisateur:', { nom, email, userRole, boutique });

        const user = new User({
            nom,
            email,
            password,
            role: userRole,
            boutique: boutique || null,
            createur: adminId,
            mustChangePassword: true,
            active: true
        });
        
        await user.save();
        console.log('[createManager] Utilisateur créé avec succès:', user._id);

        // LOG D'AUDIT
        await logAction({
            req,
            user: req.user,
            action: 'CREATE_USER',
            entity: 'User',
            entityId: user._id,
            details: { createdUser: { nom: user.nom, email: user.email, role: user.role } },
            status: 'SUCCESS'
        });

        // Notification par email
        const roleLabel = userRole === 'Caissier' ? 'Caissier' : userRole.toLowerCase();
        const mailOptions = {
            to: email,
            subject: `Vos identifiants StockDash (Compte ${roleLabel})`,
            html: `<p>Bonjour ${nom},<br/>Votre compte <b>${roleLabel}</b> a été créé par votre administrateur sur StockDash.<br/><br/>Email : <b>${email}</b><br/>Mot de passe temporaire : <b>${password}</b><br/><br/>Vous devrez changer ce mot de passe à votre première connexion.</p>`
        };
        await transporter.sendMail(mailOptions).catch(err => console.error("Erreur envoi email:", err));

        const message = userRole === 'Caissier' ? "Caissier créé avec succès." : "Gérant créé avec succès.";
        console.log('[createManager] Succès:', message);
        res.status(201).json({ success: true, message, data: user });
    } catch (error) {
        console.error('[createManager] Erreur:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Cet email est déjà utilisé par un autre compte." });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};
