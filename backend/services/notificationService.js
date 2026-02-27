/**
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
const User = require('../models/User');

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
        // Récupérer les emails de tous les administrateurs
        const admins = await User.find({ role: 'Admin' }).select('email');
        const adminEmails = admins.map(u => u.email);

        if (adminEmails.length === 0) return;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails, // Envoi groupé aux admins
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
        console.log(`📧 Alerte stock envoyée pour l'article : ${article.nom}`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'alerte stock:", error);
    }
};