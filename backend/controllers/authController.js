const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Boutique = require('../models/Boutique');
const nodemailer = require('nodemailer');

exports.register = async (req, res) => {
    try {
        // On ne récupère JAMAIS le rôle depuis une route publique d'inscription pour des raisons de sécurité.
        // Le rôle par défaut 'Gérant' sera appliqué automatiquement par le modèle.
        const { nom, email, password } = req.body;
        const user = new User({ nom, email, password }); // Le rôle sera appliqué par défaut par le schéma Mongoose
        await user.save();
        res.status(201).json({ message: "Utilisateur créé avec succès" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: "Identifiants invalides" });
        }

        // Vérification du statut actif. 
        if (user.active === false && user.role !== 'Admin') {
            return res.status(403).json({ message: "Votre compte est désactivé. Veuillez contacter l'administrateur." });
        }

        // Création du Token JWT valide pour 24h 
        const token = jwt.sign(
            { id: user._id, role: user.role, boutique: user.boutique }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ token, role: user.role, nom: user.nom, mustChangePassword: user.mustChangePassword });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateManager = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "Gérant introuvable." });
        }

        // Vérifier si la boutique est changée et si elle est déjà prise
        if (req.body.boutique && req.body.boutique !== (user.boutique ? user.boutique.toString() : null)) {
            const boutiqueObj = await Boutique.findById(req.body.boutique);
            if (boutiqueObj && boutiqueObj.type === 'Centrale') {
                return res.status(400).json({ message: "La Boutique Centrale ne peut pas être attribuée à un gérant. Elle sert de stock d'entreprise." });
            }

            const assignedManager = await User.findOne({ 
                boutique: req.body.boutique, 
                _id: { $ne: req.params.id }, // Exclure l'utilisateur actuel
                deleted: { $ne: true } 
            });
            if (assignedManager) {
                return res.status(400).json({ message: `Cette boutique est déjà affectée à ${assignedManager.nom}.` });
            }
        }

        // Update fields
        user.nom = req.body.nom || user.nom;
        user.email = req.body.email || user.email;
        
        if (req.body.boutique !== undefined) {
            user.boutique = req.body.boutique || null;
        }
        if (req.body.active !== undefined) {
            user.active = req.body.active;
        }

        // If password is provided, the pre-save hook will hash it
        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();
        res.status(200).json(updatedUser);

    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Un utilisateur avec cet email existe déjà." });
        if (error.name === 'CastError') return res.status(400).json({ message: "ID invalide." });
        res.status(400).json({ message: error.message });
    }
};

/**
 * @desc    Créer un utilisateur (Gérant) par un Admin
 * @route   POST /api/auth/create-manager
 * @access  Private/Admin
 */
exports.createManager = async (req, res) => {
    try {
        const { nom, email, password, boutique } = req.body;

        // 1. Optionnel : Valider que la boutique existe si elle est fournie
        if (boutique) {
            const boutiqueExists = await Boutique.findById(boutique);
            if (!boutiqueExists) {
                return res.status(404).json({ message: "La boutique spécifiée est introuvable." });
            }
            
            if (boutiqueExists.type === 'Centrale') {
                return res.status(400).json({ message: "La Boutique Centrale ne peut pas être attribuée à un gérant. Elle sert de stock d'entreprise." });
            }

            // Vérifier si un autre gérant a déjà cette boutique
            const assignedManager = await User.findOne({ 
                boutique: boutique, 
                deleted: { $ne: true } 
            });
            if (assignedManager) {
                return res.status(400).json({ message: `Cette boutique est déjà affectée à ${assignedManager.nom}.` });
            }
        }

        // 2. Créer l'utilisateur avec le rôle 'Gérant' et l'affecter à la boutique
        const user = await User.create({
            nom,
            email,
            password,
            role: 'Gérant', // Rôle défini côté serveur, pas par le client
            boutique: boutique || null, // Affectation de la boutique (null si vide)
            mustChangePassword: true // Force le changement de mot de passe à la première connexion
        });

        // 3. Envoyer l'email avec le mot de passe
        // Configuration du transporteur (Nécessite les variables d'environnement EMAIL_USER et EMAIL_PASS)
        const transporter = nodemailer.createTransport({
            service: 'gmail', // Ou autre service SMTP (Outlook, etc.)
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Bienvenue sur StockDash - Vos identifiants',
            text: `Bonjour ${nom},\n\nVotre compte Gérant a été créé avec succès.\n\nVoici vos identifiants :\nEmail : ${email}\nMot de passe : ${password}\n\nVeuillez changer votre mot de passe après la première connexion.\n\nCordialement,\nL'équipe.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                        <h2 style="color: #0d6efd; margin: 0;">StockDash</h2>
                        <p style="color: #6c757d; margin: 5px 0 0;">Gestion de stock simplifiée</p>
                    </div>
                    <div style="padding: 30px 0;">
                        <h3 style="color: #333;">Bonjour ${nom},</h3>
                        <p style="color: #555; line-height: 1.6;">Votre compte <strong>Gérant</strong> a été créé avec succès. Vous pouvez désormais accéder à votre espace de travail.</p>
                        
                        <div style="background-color: #f8f9fa; border-left: 4px solid #0d6efd; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px; color: #555;"><strong>Vos identifiants de connexion :</strong></p>
                            <p style="margin: 5px 0;">📧 <strong>Email :</strong> ${email}</p>
                            <p style="margin: 5px 0;">🔑 <strong>Mot de passe :</strong> ${password}</p>
                        </div>

                        <p style="color: #555; line-height: 1.6;">Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion.</p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/login" style="background-color: #0d6efd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Se connecter</a>
                        </div>
                    </div>
                    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 12px;">
                        <p>&copy; ${new Date().getFullYear()} StockDash. Tous droits réservés.</p>
                        <p>Ceci est un message automatique, merci de ne pas y répondre.</p>
                    </div>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Erreur d'envoi d'email:", error);
            } else {
                console.log('Email envoyé: ' + info.response);
            }
        });

        res.status(201).json({ message: "Compte Gérant créé avec succès. Un email a été envoyé.", userId: user._id });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Un utilisateur avec cet email existe déjà." });
        res.status(400).json({ message: error.message });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        // req.user est ajouté par le middleware protect
        const user = await User.findById(req.user.id).select('-password').populate('boutique');
        if (!user) {
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
             return res.status(404).json({ message: "Utilisateur introuvable." });
        }

        if (!await user.comparePassword(currentPassword)) {
            return res.status(400).json({ message: "Mot de passe actuel incorrect." });
        }

        user.password = newPassword; // Sera haché par le middleware pre-save
        user.mustChangePassword = false; // Désactive l'obligation de changement
        await user.save();

        res.status(200).json({ message: "Mot de passe modifié avec succès." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ deleted: { $ne: true } }).select('-password').populate('boutique'); // On exclut le mot de passe des résultats
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
        res.status(200).json({ message: "Gérant restauré avec succès." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "Aucun utilisateur trouvé avec cet email." });
        }

        // Générer un mot de passe temporaire (8 caractères alphanumériques)
        const tempPassword = Math.random().toString(36).slice(-8);
        
        // Mise à jour de l'utilisateur
        user.password = tempPassword; // Le middleware pre-save va le hacher automatiquement
        user.mustChangePassword = true; // Force le changement à la prochaine connexion
        await user.save();

        // Configuration de l'email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Réinitialisation de mot de passe - StockDash',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                    <h2 style="color: #0d6efd; text-align: center;">Mot de passe oublié ?</h2>
                    <p>Bonjour ${user.nom},</p>
                    <p>Vous avez demandé la réinitialisation de votre mot de passe. Voici votre nouveau mot de passe temporaire :</p>
                    <div style="background-color: #f8f9fa; border-left: 4px solid #0d6efd; padding: 15px; margin: 20px 0; text-align: center;">
                        <span style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">${tempPassword}</span>
                    </div>
                    <p>Utilisez ce mot de passe pour vous connecter. Il vous sera demandé de le changer immédiatement.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999; text-align: center;">Si vous n'êtes pas à l'origine de cette demande, veuillez contacter l'administrateur.</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Erreur d'envoi d'email:", error);
            }
        });

        res.status(200).json({ message: "Un email contenant votre nouveau mot de passe a été envoyé." });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "Utilisateur introuvable." });
        }

        // Mise à jour des champs autorisés
        if (req.body.nom) user.nom = req.body.nom;
        if (req.body.email) user.email = req.body.email;

        await user.save();

        res.status(200).json({ message: "Profil mis à jour avec succès.", user: { nom: user.nom, email: user.email } });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Cet email est déjà utilisé." });
        }
        res.status(500).json({ message: error.message });
    }
};
