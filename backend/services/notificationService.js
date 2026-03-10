/**
 * Service de gestion des notifications (Email & In-App)
 * Centralise l'envoi de toutes les alertes du système.
 * Envoie une notification aux admins lorsqu'un gérant demande une remise
 * @param {Object} article - L'article concerné
 * @param {Number} remise - Pourcentage de remise demandé
 * @param {Object} gerant - Utilisateur gérant (doit avoir nom/email)
 */
exports.sendRemiseRequestToAdmins = async (article, remise, gerant, clientNom) => {
    try {
        const admins = await User.find({ role: 'Admin' }).select('email');
        const adminEmails = admins.map(u => u.email);
        if (adminEmails.length === 0) return;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails,
            subject: `Demande de remise à valider`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
                    <h2 style="color: #0d6efd; margin-top: 0;">Demande de remise à valider</h2>
                    <p>Le gérant <b>${gerant.nom}</b> demande une remise de <b>${remise}%</b> sur l'article <b>${article.nom}</b>${clientNom ? ` pour le client <b>${clientNom}</b>` : ''}.</p>
                    <p>Merci de valider ou refuser cette demande dans l'interface d'administration.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`📧 Demande de remise envoyée aux admins pour l'article : ${article.nom}`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de la demande de remise:", error);
    }
};
const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');
const RapportCaisse = require('../models/RapportCaisse');

// Configuration du transporteur (réutilisation des variables d'environnement existantes)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Envoie une alerte par email aux administrateurs si le stock est faible
 * @param {Object} article - L'article concerné (doit avoir les champs nom, quantite, boutique)
 */
exports.sendLowStockAlert = async (article) => {
    try {
        const admins = await User.find({ role: 'Admin' });
        if (admins.length === 0) return;

        const adminEmails = admins.map(a => a.email);
        const message = `Le stock de l'article "${article.nom}" est faible (${article.quantite} restants) dans la boutique "${article.boutique?.nom || 'N/A'}".`;

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
        const admins = await User.find({ role: 'Admin' });
        if (admins.length === 0) return;

        const adminEmails = admins.map(u => u.email);
        const message = `Le gérant ${gerant.nom} a accordé une dette de ${montantDette.toLocaleString('fr-FR')} GNF au client ${client.nom} sur une vente de ${totalVente.toLocaleString('fr-FR')} GNF.`;

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
        const admins = await User.find({ role: 'Admin' });
        if (admins.length === 0) return;

        const adminEmails = admins.map(u => u.email);
        const remisesText = [...new Set(remises)].join(', ');
        const clientText = clientNom ? ` pour le client ${clientNom}` : '';
        const message = `Le gérant ${gerant.nom} a appliqué une remise de ${remisesText} sur une vente de ${totalVente.toLocaleString('fr-FR')} GNF${clientText}.`;

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
        const admins = await User.find({ role: 'Admin' });
        if (admins.length === 0) return;

        // On s'assure d'avoir les infos peuplées pour le message
        const rapportFull = await RapportCaisse.findById(rapport._id).populate('gerant', 'nom').populate('boutique', 'nom');
        if (!rapportFull) return;

        const adminEmails = admins.map(u => u.email);
        const message = `Nouveau rapport de caisse généré par ${rapportFull.gerant.nom} pour la boutique ${rapportFull.boutique.nom}.`;

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
                        <li><strong>⚠️ Écart :</strong> ${rapportFull.ecart.toLocaleString('fr-FR')} GNF</li>
                    </ul>
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
                link: '/admin/caisse' // Lien vers la vue caisse admin
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
            type: 'error',
            link: '/gerant/caisse' // Lien vers la vue caisse gérant
        });
        console.log(`📲 Notification in-app de rejet de rapport envoyée à ${gerant.nom}.`);

    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte de rejet de rapport:", error);
    }
};