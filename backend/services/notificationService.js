/**
 * Service de gestion des notifications (Email & In-App)
 * Centralise l'envoi de toutes les alertes du système.
 */
const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');
const RapportCaisse = require('../models/RapportCaisse');

// Configuration du transporteur (Déplacé en haut pour être accessible partout)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Envoie une notification aux admins lorsqu'un gérant demande une remise
 * @param {Object} article - L'article concerné
 * @param {Number} remise - Pourcentage de remise demandé
 * @param {Object} gerant - Utilisateur gérant (doit avoir nom/email)
 */
exports.sendRemiseRequestToAdmins = async (article, remise, gerant, clientNom) => {
    try {
        // On cible uniquement l'Admin qui a créé la boutique de l'article
        const adminId = article.boutique?.createur || article.boutique;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);
        const message = `Le gérant ${gerant.nom} demande une remise de ${remise}% sur l'article "${article.nom}"${clientNom ? ` pour le client "${clientNom}"` : ''}.`;
        const link = `/admin/articles?openEdit=${article._id}`;

        const admins = [admin]; // Définit l'array pour le .map ci-dessous

        // 1. Envoi par email (si des emails sont configurés)
        if (adminEmails.length > 0) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `🔔 Demande de remise à valider : ${article.nom}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #0d6efd; margin-top: 0;">Demande de remise à valider</h2>
                    <p>${message}</p>
                    <p>Merci de valider ou refuser cette demande depuis l'interface d'administration en cliquant sur le lien ci-dessous.</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}${link}" style="background-color: #0d6efd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Voir la demande</a>
                    </div>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`📧 Demande de remise envoyée aux admins pour l'article : ${article.nom}`);
        }

        // 2. Création de la notification in-app
        const notificationPromises = admins.map(admin =>
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'info',
                link: link
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de demande de remise envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de la demande de remise:", error);
    }
};

/**
 * Envoie une alerte par email aux administrateurs si le stock est faible
 * @param {Object} article - L'article concerné (doit avoir les champs nom, quantite, boutique)
 */
exports.sendLowStockAlert = async (article) => {
    try {
        const adminId = article.boutique?.createur || article.boutique;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);
        const message = `Le stock de l'article "${article.nom}" est faible (${article.quantite} restants) dans la boutique "${article.boutique?.nom || 'N/A'}".`;

        const admins = [admin];

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `⚠️ Alerte Stock Faible : ${article.nom}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #dc3545; margin-top: 0;">Alerte Stock Faible</h2>
                    <p>Le stock de l'article suivant est passé sous le seuil critique :</p>
                    <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; list-style: none;">
                        ${article.image ? `<li style="text-align: center; margin-bottom: 15px;"><img src="${article.image}" alt="${article.nom}" style="max-height: 150px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" /></li>` : ''}
                        <li style="margin-bottom: 10px;"><strong>📦 Article :</strong> ${article.nom}</li>
                        <li style="margin-bottom: 10px;"><strong>📉 Quantité restante :</strong> <span style="color: #dc3545; font-weight: bold;">${article.quantite}</span></li>
                        <li><strong>🏪 Boutique :</strong> ${article.boutique?.nom || 'Non assignée'}</li>
                    </ul>
                    <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">Ceci est un message automatique de votre application de gestion de stock.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Alerte stock faible envoyée pour l'article : ${article.nom}`);

        const link = `/admin/dashboard?openTransfer=${article._id}`;

        // Création des notifications in-app pour chaque admin
        const notificationPromises = admins.map(admin => 
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'warning',
                link: link
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de stock faible envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte stock:", error);
    }
};

/**
 * Alerte les admins lorsqu'une dette est accordée par un gérant.
 * @param {Object} gerant - L'utilisateur gérant qui a accordé la dette.
 * @param {Object} client - Le client qui a reçu la dette.
 * @param {Number} montantDette - Le montant de la dette accordée.
 * @param {Number} totalVente - Le montant total de la vente.
 */
exports.sendDebtGrantedAlert = async (gerant, client, montantDette, totalVente) => {
    try {
        const adminId = client.createur;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);
        const message = `Le gérant ${gerant.nom} a accordé une dette de ${montantDette.toLocaleString('fr-FR')} GNF au client ${client.nom} sur une vente de ${totalVente.toLocaleString('fr-FR')} GNF.`;

        const admins = [admin];

        // 1. Email notification
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `🔔 Nouvelle dette accordée par ${gerant.nom}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #ffc107; margin-top: 0;">Nouvelle Dette Accordée</h2>
                    <p>Le gérant <strong>${gerant.nom}</strong> a accordé une nouvelle dette.</p>
                    <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; list-style: none;">
                        <li style="margin-bottom: 10px;"><strong>👤 Client :</strong> ${client.nom}</li>
                        <li style="margin-bottom: 10px;"><strong>💰 Montant de la dette :</strong> <span style="font-weight: bold;">${montantDette.toLocaleString('fr-FR')} GNF</span></li>
                        <li><strong>🛒 Total de la vente :</strong> ${totalVente.toLocaleString('fr-FR')} GNF</li>
                    </ul>
                    <p>Vous pouvez consulter le détail des clients et de leurs dettes dans la section "Gestion Clients & Ouvriers".</p>
                </div>
            `
        });
        console.log(`📧 Alerte dette envoyée aux admins pour le client : ${client.nom}`);

        // 2. In-app notification
        const notificationPromises = admins.map(admin => 
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'warning',
                link: '/admin/clients' // Lien vers la vue des clients
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de dette envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de dette:", error);
    }
};

/**
 * Alerte les admins lorsqu'une remise est appliquée par un gérant.
 * @param {Object} gerant - L'utilisateur gérant qui a appliqué la remise.
 * @param {Array<string>} remises - Tableau des remises appliquées (ex: ["10%", "5%"]).
 * @param {Number} totalVente - Le montant total de la vente.
 * @param {string|null} clientNom - Le nom du client si disponible.
 */
exports.sendDiscountGrantedAlert = async (gerant, remises, totalVente, clientNom) => {
    try {
        const adminId = gerant.createur;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);
        const remisesText = [...new Set(remises)].join(', ');
        const clientText = clientNom ? ` pour le client ${clientNom}` : '';
        const message = `Le gérant ${gerant.nom} a appliqué une remise de ${remisesText} sur une vente de ${totalVente.toLocaleString('fr-FR')} GNF${clientText}.`;

        const admins = [admin];

        // 1. Email notification
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `ℹ️ Remise appliquée par ${gerant.nom}`,
            html: `<p>${message} Vous pouvez consulter le détail dans l'historique des ventes.</p>`
        });
        console.log(`📧 Alerte remise envoyée aux admins.`);

        // 2. In-app notification
        const notificationPromises = admins.map(admin => 
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'info',
                link: '/admin/ventes' // Lien vers l'historique des ventes
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de remise envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de remise:", error);
    }
};

/**
 * Alerte les admins lorsqu'un rapport de caisse est généré.
 * @param {Object} rapport - Le rapport de caisse généré.
 */
exports.sendNewReportAlert = async (rapport) => {
    try {
        // On s'assure d'avoir les infos peuplées pour le message
        const rapportFull = await RapportCaisse.findById(rapport._id).populate('gerant', 'nom').populate('boutique', 'nom');
        if (!rapportFull) return;

        const adminId = rapportFull.boutique?.createur;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);
        // MODIFICATION: Message plus détaillé pour l'interaction
        const hasEcart = rapportFull.ecart !== 0;
        const message = `Rapport de ${rapportFull.gerant.nom} (${rapportFull.boutique.nom}). ${hasEcart ? `Écart de ${rapportFull.ecart.toLocaleString('fr-FR')} GNF. Justification: "${rapportFull.commentairesGérant}"` : 'Aucun écart signalé.'}`;

        const admins = [admin];

        // 1. Email notification
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `📊 Nouveau Rapport de Caisse : ${rapportFull.boutique.nom}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #0d6efd; margin-top: 0;">Nouveau Rapport de Caisse</h2>
                    <p>Le gérant <strong>${rapportFull.gerant.nom}</strong> a clôturé sa caisse.</p>
                    <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; list-style: none;">
                        <li style="margin-bottom: 10px;"><strong>🏪 Boutique :</strong> ${rapportFull.boutique.nom}</li>
                        <li style="margin-bottom: 10px;"><strong>💰 Montant Clôture :</strong> ${rapportFull.montantCloture.toLocaleString('fr-FR')} GNF</li>
                        <li style="margin-bottom: 10px;"><strong>📉 Solde Théorique :</strong> ${rapportFull.soldeTheorique.toLocaleString('fr-FR')} GNF</li>
                        <li style="color: ${hasEcart ? '#dc3545' : '#198754'};"><strong>⚠️ Écart :</strong> ${rapportFull.ecart.toLocaleString('fr-FR')} GNF</li>
                    </ul>
                    ${hasEcart && rapportFull.commentairesGérant ? `
                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px; color: #856404;"><strong>Justification du gérant :</strong></p>
                            <p style="margin: 0; color: #856404;"><em>"${rapportFull.commentairesGérant}"</em></p>
                        </div>
                    ` : ''}
                    <p>Vous pouvez consulter et valider ce rapport dans la section "Finances & Caisse".</p>
                </div>
            `
        });
        console.log(`📧 Alerte rapport envoyée aux admins.`);

        // 2. In-app notification
        const notificationPromises = admins.map(admin => 
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'info',
                link: '/admin/caisse?tab=rapports' // Lien vers l'onglet des rapports
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de rapport envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de rapport:", error);
    }
};

/**
 * Alerte le gérant que son rapport de caisse a été rejeté.
 * @param {Object} rapport - Le rapport de caisse rejeté.
 * @param {Object} admin - L'admin qui a rejeté.
 * @param {String} commentaire - Le motif du rejet.
 */
exports.sendReportRejectedAlert = async (rapport, admin, commentaire) => {
    try {
        const gerant = await User.findById(rapport.gerant);
        if (!gerant) return;

        const message = `Votre rapport de caisse du ${new Date(rapport.createdAt).toLocaleDateString()} a été rejeté par ${admin.nom}. Motif : ${commentaire}`;

        // 1. Email notification
        if (gerant.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: gerant.email,
                subject: `❌ Rapport de Caisse Rejeté`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                        <h2 style="color: #dc3545; margin-top: 0;">Rapport de Caisse Rejeté</h2>
                        <p>Bonjour <strong>${gerant.nom}</strong>,</p>
                        <p>Votre rapport de caisse pour la boutique <strong>${rapport.boutique.nom}</strong> a été rejeté par l'administrateur <strong>${admin.nom}</strong>.</p>
                        <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px; color: #721c24;"><strong>Motif du rejet :</strong></p>
                            <p style="margin: 0; color: #721c24;">${commentaire}</p>
                        </div>
                        <p>Veuillez prendre les mesures nécessaires et contacter l'administration si besoin. Vous pouvez maintenant ouvrir une nouvelle caisse.</p>
                    </div>
                `
            });
            console.log(`📧 Alerte de rejet de rapport envoyée à ${gerant.nom}.`);
        }

        // 2. In-app notification
        await Notification.create({
            recipient: gerant._id,
            message: message,
                type: 'warning', // Changé en warning car ce n'est pas une erreur système, mais une action requise
                link: '/gerant/caisse?action=correction' // Lien incitant à l'action
        });
        console.log(`📲 Notification in-app de rejet de rapport envoyée à ${gerant.nom}.`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de rejet de rapport:", error);
    }
};

/**
 * Alerte le gérant que son rapport de caisse a été validé.
 * @param {Object} rapport - Le rapport de caisse validé.
 * @param {Object} admin - L'admin qui a validé.
 * @param {String} commentaire - Le commentaire optionnel de l'admin.
 */
exports.sendReportValidatedAlert = async (rapport, admin, commentaire) => {
    try {
        const gerant = await User.findById(rapport.gerant);
        if (!gerant) return;

        const message = `✅ Votre rapport de caisse a été validé par ${admin.nom}. ${commentaire ? `Commentaire: "${commentaire}"` : ''}`;

        // 1. Email notification
        if (gerant.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: gerant.email,
                subject: `✅ Rapport de Caisse Validé`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                        <h2 style="color: #198754; margin-top: 0;">Rapport de Caisse Validé</h2>
                        <p>Bonjour <strong>${gerant.nom}</strong>,</p>
                        <p>Votre rapport de caisse pour la boutique <strong>${rapport.boutique.nom}</strong> du ${new Date(rapport.createdAt).toLocaleDateString()} a été validé par l'administrateur <strong>${admin.nom}</strong>.</p>
                        ${commentaire ? `
                            <div style="background-color: #e2e3e5; border-left: 4px solid #6c757d; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0 0 10px;"><strong>Commentaire de l'administrateur :</strong></p>
                                <p style="margin: 0;"><em>"${commentaire}"</em></p>
                            </div>
                        ` : ''}
                        <p>Merci pour votre travail.</p>
                    </div>
                `
            });
            console.log(`📧 Alerte de validation de rapport envoyée à ${gerant.nom}.`);
        }

        // 2. In-app notification
        await Notification.create({
            recipient: gerant._id,
            message: message,
            type: 'success',
            link: '/gerant/caisse?tab=rapports' // Lien vers l'onglet des rapports du gérant
        });
        console.log(`📲 Notification in-app de validation de rapport envoyée à ${gerant.nom}.`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de validation de rapport:", error);
    }
};

/**
 * Alerte les admins qu'un paiement de dette est en attente de validation.
 * @param {Object} gerant - L'utilisateur gérant qui a enregistré le paiement.
 * @param {Object} client - Le client concerné.
 * @param {Number} montant - Le montant du paiement.
 */
exports.sendDebtPaymentPendingAlert = async (gerant, client, montant) => {
    try {
        const admins = await User.find({ role: 'Admin' });
        if (admins.length === 0) return;

        const message = `Le gérant ${gerant.nom} a enregistré un paiement de ${montant.toLocaleString('fr-FR')} GNF de la part de ${client.nom}. Ce paiement est en attente de votre validation.`;

        // In-app notification
        const notificationPromises = admins.map(admin =>
            Notification.create({
                recipient: admin._id,
                message: message,
                type: 'info',
                link: '/admin/creances?tab=validation' // Lien vers l'onglet de validation
            })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification de paiement en attente envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de paiement en attente:", error);
    }
};

/**
 * Notifie un gérant que son paiement de dette a été validé par un admin.
 * @param {string} gerantId - L'ID du gérant à notifier.
 * @param {Object} client - Le client concerné.
 * @param {Number} montant - Le montant du paiement validé.
 */
exports.sendDebtPaymentValidatedAlert = async (gerantId, client, montant) => {
    try {
        const gerant = await User.findById(gerantId);
        if (!gerant) return;

        const message = `✅ Le paiement de ${montant.toLocaleString('fr-FR')} GNF pour le client ${client.nom} a été validé. La dette du client est à jour.`;

        // 1. Email notification (Nouveau)
        if (gerant.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: gerant.email,
                subject: `✅ Paiement de dette validé`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                        <h2 style="color: #198754; margin-top: 0;">Paiement Validé</h2>
                        <p>Bonjour <strong>${gerant.nom}</strong>,</p>
                        <p>L'administrateur a validé le paiement suivant que vous aviez enregistré :</p>
                        <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; list-style: none;">
                            <li style="margin-bottom: 10px;"><strong>👤 Client :</strong> ${client.nom}</li>
                            <li style="margin-bottom: 10px;"><strong>💰 Montant :</strong> <span style="font-weight: bold;">${montant.toLocaleString('fr-FR')} GNF</span></li>
                        </ul>
                    </div>
                `
            });
        }

        // In-app notification
        await Notification.create({
            recipient: gerant._id,
            message: message,
            type: 'success',
            link: '/gerant/creances'
        });
        console.log(`📲 Notification de validation de paiement envoyée à ${gerant.nom}.`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de la notification de validation de paiement:", error);
    }
};

/**
 * Envoie le reçu de paiement de dette par email au client.
 */
exports.sendDebtPaymentReceiptEmail = async (payment, client) => {
    if (!client || !client.email) return;

    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: client.email,
            subject: `📄 Votre reçu de paiement - Boutique ${payment.boutique?.nom || ''}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #0d6efd; margin-top: 0;">Reçu de Paiement</h2>
                    </div>
                    <p>Bonjour <strong>${client.nom}</strong>,</p>
                    <p>Nous vous confirmons la réception de votre versement pour le règlement de votre dette.</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #fcfcfc;">
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 12px; border: 1px solid #eee;"><strong>Date :</strong></td>
                            <td style="padding: 12px; border: 1px solid #eee;">${new Date(payment.datePaiement || payment.createdAt).toLocaleString('fr-FR')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px; border: 1px solid #eee;"><strong>Montant Versé :</strong></td>
                            <td style="padding: 12px; border: 1px solid #eee; color: #198754; font-weight: bold; font-size: 1.1em;">${payment.montant.toLocaleString('fr-FR')} GNF</td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 12px; border: 1px solid #eee;"><strong>Mode de Paiement :</strong></td>
                            <td style="padding: 12px; border: 1px solid #eee;">${payment.modePaiement}</td>
                        </tr>
                        ${payment.transactionRef ? `
                        <tr>
                            <td style="padding: 12px; border: 1px solid #eee;"><strong>Réf. Transaction :</strong></td>
                            <td style="padding: 12px; border: 1px solid #eee;">${payment.transactionRef}</td>
                        </tr>
                        ` : ''}
                    </table>

                    <p style="text-align: center; color: #6c757d; font-size: 0.85em; margin-top: 30px; border-top: 1px solid #eee; pt-20">
                        Merci de votre fidélité.<br/>
                        <strong>${payment.boutique?.nom || 'Votre Boutique'}</strong>
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi du reçu par email:", error);
        throw error;
    }
};

/**
 * Alerte les admins qu'un gérant a confirmé la réception d'un transfert.
 * @param {Object} mouvement - Le mouvement de stock confirmé.
 * @param {Object} gerant - Le gérant qui a validé la réception.
 */
exports.sendTransferReceivedAlert = async (mouvement, gerant) => {
    try {
        // On notifie l'Admin propriétaire de la boutique source (celui qui a expédié)
        const adminId = mouvement.boutiqueSource?.createur;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const adminEmails = [admin.email].filter(Boolean);

        // Assurez-vous que les champs sont peuplés pour le message
        const sourceNom = mouvement.boutiqueSource?.nom || 'Dépôt Principal';
        const destNom = mouvement.boutiqueDestination?.nom || 'Boutique Cible';

        const admins = [admin];

        const message = `🚚 Réception confirmée : Le gérant ${gerant.nom} a validé la réception du transfert #${mouvement._id.toString().slice(-6).toUpperCase()} de ${sourceNom} vers ${destNom}.`;
        const link = `/admin/mouvements?filter=${mouvement._id}`; // Lien vers le mouvement spécifique

        // 1. Envoi par email
        if (adminEmails.length > 0) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: adminEmails,
                subject: `✅ Réception de Transfert Confirmée par ${gerant.nom}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                        <h2 style="color: #198754; margin-top: 0;">Réception de Transfert Confirmée</h2>
                        <p>${message}</p>
                        <p>Vous pouvez consulter le mouvement détaillé en cliquant ci-dessous :</p>
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}${link}" style="background-color: #0d6efd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Voir le Mouvement</a>
                        </div>
                    </div>
                `
            });
            console.log(`📧 Alerte réception transfert envoyée aux admins : ${mouvement._id}`);
        }

        // 2. Création de la notification in-app
        const notificationPromises = admins.map(admin =>
            Notification.create({ recipient: admin._id, message, type: 'success', link })
        );
        await Promise.all(notificationPromises);
        console.log(`📲 Notification in-app de réception transfert envoyée à ${admins.length} admin(s).`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de réception de transfert:", error);
    }
};

/**
 * Alerte l'admin d'une demande d'ajustement de stock (perte/casse)
 */
exports.sendAjustementRequestAlert = async (ajst, article, gerant) => {
    try {
        const adminId = article.boutique?.createur || article.boutique;
        const admin = await User.findById(adminId);
        if (!admin) return;

        const message = `⚠️ Écart déclaré : ${gerant.nom} a signalé une ${ajst.raison} (${ajst.quantite} unités) pour "${article.nom}".`;
        const link = '/admin/articles?tab=adjustments';

        // Notification in-app
        await Notification.create({
            recipient: admin._id,
            message: message,
            type: 'warning',
            link: link
        });

        // Email
        if (admin.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: admin.email,
                subject: `⚠️ Perte/Casse à valider : ${article.nom}`,
                html: `<p>${message}</p><p><strong>Justification :</strong> ${ajst.justification}</p>`
            });
        }
    } catch (error) {
        console.error("Erreur notification ajustement:", error);
    }
};

/**
 * Notifie le gérant du statut final de sa demande d'ajustement
 */
exports.sendAjustementStatusAlert = async (ajst) => {
    try {
        const message = ajst.statut === 'VALIDE' 
            ? `✅ Votre demande d'ajustement pour "${ajst.article.nom}" a été VALIDÉE.` 
            : `❌ Votre demande d'ajustement pour "${ajst.article.nom}" a été REJETÉE.`;
        
        await Notification.create({
            recipient: ajst.gerant,
            message: message + (ajst.commentaireAdmin ? ` Motif : ${ajst.commentaireAdmin}` : ""),
            type: ajst.statut === 'VALIDE' ? 'success' : 'error',
            link: '/gerant/articles?tab=adjustments'
        });
    } catch (error) {
        console.error("Erreur notification statut ajustement:", error);
    }
};

/**
 * Notifie un serveur que sa commande est prête (Prête pour livraison à table).
 * @param {Object} vente - La vente concernée.
 * @param {Object} gérant - L'utilisateur (Gérant/Barman) qui a validé la préparation.
 */
exports.sendOrderReadyAlert = async (vente, gerant) => {
    try {
        const message = `✅ Commande Prête : Table ${vente.numeroTable || 'N/A'} est disponible au bar (Préparée par ${gerant.nom}).`;
        
        await Notification.create({
            recipient: vente.gerant, // Le serveur propriétaire de la commande
            message: message,
            type: 'success',
            link: '/serveur/dashboard'
        });
        console.log(`📲 Notification "Prête" envoyée au serveur : ${vente.gerant}`);
    } catch (error) {
        console.error("❌ Erreur notification Commande Prête :", error);
    }
};

/**
 * Notifie un serveur que sa commande a été annulée par le gérant.
 * @param {Object} vente - La vente annulée.
 * @param {Object} canceller - L'utilisateur qui a annulé la vente.
 */
exports.sendOrderCancelledAlert = async (vente, canceller) => {
    try {
        const message = `🚨 Commande Annulée : Votre commande (Table ${vente.numeroTable || 'N/A'}) a été annulée par ${canceller.nom}.`;
        
        await Notification.create({
            recipient: vente.gerant,
            message: message,
            type: 'error',
            link: '/serveur/dashboard'
        });
        console.log(`📲 Notification d'annulation envoyée au serveur : ${vente.gerant}`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de la notification d'annulation :", error);
    }
};