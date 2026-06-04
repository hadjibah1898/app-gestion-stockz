const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Boutique = require('../models/Boutique');
const { transporter } = require('../services/notificationService'); // Importer le transporteur centralisé
const Notification = require('../models/Notification');
const { syncLocalDataToCloud } = require('../services/syncService'); // Importer le service de sync
const { logAction } = require('../services/auditLogService');

exports.register = async (req, res) => {
    try {
        const { nom, email, boutique } = req.body;
        let { password, role } = req.body;
        
        let userRole = role || 'Gérant';
        let userBoutique = boutique || null;

        // SÉCURITÉ : Vérifier que seul un SuperAdmin peut créer un autre Admin
        if (role === 'Admin' && (!req.user || req.user.role !== 'SuperAdmin')) {
            return res.status(403).json({ success: false, message: "Action refusée : Seul un SuperAdmin peut créer un compte Administrateur." });
        }

        // SÉCURITÉ : Si l'utilisateur connecté est un Gérant, il crée forcément un Serveur
        // rattaché à SA propre boutique.
        if (req.user && req.user.role === 'Gérant') {
            userRole = 'Serveur';
            // On s'assure de récupérer l'ID (ObjectId ou String)
            userBoutique = req.user.boutique?._id || req.user.boutique;
        } else if (!userBoutique && boutique) {
            userBoutique = boutique;
        }

        // SÉCURITÉ : Générer un mot de passe aléatoire s'il n'est pas fourni (évite l'erreur 400)
        if (!password) {
            password = Math.random().toString(36).slice(-8);
        }

        // SÉCURITÉ MULTI-TENANT : 
        // 1. Si Admin crée : createur = Admin. 
        // 2. Si Gérant crée un Serveur : createur = Créateur du Gérant (l'Admin).
        const user = new User({
            nom,
            email,
            password,
            role: userRole,
            boutique: userBoutique,
            createur: req.user?.id, // Le créateur est l'utilisateur connecté (Admin ou Gérant)
            mustChangePassword: true
        });
        await user.save();

        // --- OPTIMISATION : Utilisation du service de notification centralisé ---
        const roleLabel = userRole === 'Admin' ? 'Administrateur' : (userRole === 'Serveur' ? 'Serveur' : 'Gérant'); // Déplacer cette ligne
        const mailOptions = { // Renommer emailContent en mailOptions pour la clarté
            to: email,
            subject: `Vos identifiants StockDash (Compte ${roleLabel})`,
            html: `<p>Bonjour ${nom}, votre compte ${roleLabel.toLowerCase()} a été créé. <br/> Email: ${email} <br/> Mot de passe temporaire: <b>${password}</b></p>`
        };
        
        transporter.sendMail(mailOptions).catch(err => console.error("Erreur email:", err));
        syncLocalDataToCloud(user._id).catch(err => console.error("Erreur lors de la synchronisation immédiate de l'utilisateur:", err));

        res.status(201).json({ message: "Utilisateur créé avec succès", user, tempPassword: password });
    } catch (error) {
        // Gérer le cas de l'email déjà utilisé
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

        if (user.active === false && user.role !== 'Admin') {
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

        await logAction({
            req,
            user,
            action: 'LOGIN_SUCCESS',
            entity: 'User',
            status: 'SUCCESS'
        });

        res.json({ 
            token, 
            id: user._id, // Ajouter l'ID de l'utilisateur ici
            role: user.role, 
            nom: user.nom, 
            boutique: user.boutique, 
            mustChangePassword: user.mustChangePassword 
        });
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

        // SÉCURITÉ MULTI-TENANT : Un Admin ne peut modifier que les gérants qu'il a créés
        if (req.user?.role === 'Admin' && user.role === 'Gérant' && user.createur?.toString() !== req.user.id.toString()) {
            return res.status(403).json({ message: "Accès refusé : Vous ne pouvez modifier que les gérants que vous avez créés." });
        }

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
            createur: req.user.id, // L'Admin connecté est le créateur de ce gérant
            mustChangePassword: true
        });

        await logAction({
            req, user: req.user, action: 'CREATE_USER', entity: 'User', entityId: user._id,
            details: { createdUser: { nom: user.nom, email: user.email } }, status: 'SUCCESS'
        });

        // --- OPTIMISATION : Centralisation de l'envoi d'identifiants ---
        const emailContent = {
            to: email,
            subject: 'Vos identifiants StockDash',
            html: `<p>Bonjour ${nom}, votre compte a été créé. Email: ${email}, Passe: ${password}</p>`
        };

        // Forcer la synchronisation immédiate de ce nouvel utilisateur
        syncLocalDataToCloud(user._id).catch(err => console.error("Erreur lors de la synchronisation immédiate de l'utilisateur:", err));

        res.status(201).json({ message: "Compte Gérant créé avec succès.", user });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Email déjà utilisé." });
        res.status(400).json({ message: error.message });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password')
            .populate('boutique')
            .populate('createur', 'nom'); // On récupère le nom de l'admin créateur
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

// Nouvelle méthode pour supprimer/désactiver un compte (Audit inclus)
exports.deleteManager = async (req, res) => {
    try {
        // On privilégie une désactivation active: false pour préserver l'intégrité de l'audit
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
            html: `<p>Bonjour, votre mot de passe a été réinitialisé. <br/> Nouveau mot de passe temporaire : <b>${tempPassword}</b></p>`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: "Un nouveau mot de passe temporaire a été envoyé par email." });
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
        let query = {};
        
        // SÉCURITÉ MULTI-TENANT
        if (req.user?.role === 'Admin') {
            const myUsers = await User.find({ createur: req.user.id }).select('_id');
            const authorizedUserIds = myUsers.map(u => u._id);
            authorizedUserIds.push(req.user.id);
            query.recipient = { $in: authorizedUserIds };
        } else if (req.user?.role !== 'SuperAdmin') {
            // SÉCURITÉ : Un gérant ou serveur ne doit voir que ses propres notifications
            query.recipient = req.user.id;
        }

        const notifications = await Notification.find(query).populate('recipient', 'nom email role').sort({ createdAt: -1 }).limit(100);
        
        // Ajout d'un header pour éviter les problèmes de cache (304) lors du switch d'utilisateur
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getUsers = async (req, res) => {
    try {
        let query = {};

        // SÉCURITÉ : Ne jamais exposer les autres SuperAdmin, même au SuperAdmin lui-même 
        // pour éviter toute modification accidentelle du compte racine par l'UI
        query.role = { $ne: 'SuperAdmin' };

        // SÉCURITÉ : Si c'est un gérant, il ne peut voir que les serveurs de SA boutique
        if (req.user?.role === 'Gérant') {
            // Le gérant voit tous les utilisateurs rattachés à sa boutique (Gérants et Serveurs)
            query.boutique = req.user.boutique?._id || req.user.boutique;
            query.role = 'Serveur';
        } else if (req.user?.role === 'Admin') {
            // L'Admin voit : 
            // 1. Les utilisateurs rattachés à ses boutiques
            // 2. Les gérants qu'il a créés mais pas encore assignés
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id);

            query.$or = [
                { boutique: { $in: myBoutiqueIds } },
                { createur: req.user.id }
            ];
            query.role = { $in: ['Gérant', 'Serveur'] };
        }

        const users = await User.find(query).populate('boutique', 'nom');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
