const cron = require('node-cron');
const Client = require('../models/Client');
const nodemailer = require('nodemailer');
const articleService = require('./articleService');

const sendDebtReminders = async () => {
    console.log('⏰ [CRON] Vérification quotidienne des échéances de dettes...');
    try {
        // Trouver les clients avec une dette > 0, une échéance définie et un email valide
        const clients = await Client.find({
            dette: { $gt: 0 },
            echeanceDette: { $exists: true, $ne: null },
            email: { $exists: true, $ne: '' }
        });

        if (clients.length === 0) return;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const today = new Date();
        // On normalise 'today' à minuit pour comparer des dates entières sans l'heure
        today.setHours(0, 0, 0, 0);

        for (const client of clients) {
            const echeance = new Date(client.echeanceDette);
            echeance.setHours(0, 0, 0, 0);

            // Calcul de la différence en millisecondes puis conversion en jours
            const diffTime = echeance - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Vérification des intervalles demandés : 10, 5, 2, 1 jours avant l'échéance
            if ([10, 5, 2, 1].includes(diffDays)) {
                console.log(`📧 Envoi rappel dette à ${client.nom} (${diffDays} jours restants)`);

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: client.email,
                    subject: `⚠️ Rappel : Échéance de votre dette dans ${diffDays} jour(s)`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                            <h2 style="color: #dc3545; text-align: center;">Rappel d'Échéance</h2>
                            <p>Bonjour <strong>${client.nom}</strong>,</p>
                            <p>Nous vous rappelons que l'échéance de votre dette arrive bientôt à son terme.</p>
                            
                            <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; border: 1px solid #ffeeba;">
                                <p style="margin: 0; font-size: 1.1em;">Montant restant : <strong>${client.dette.toLocaleString('fr-FR')} GNF</strong></p>
                                <p style="margin: 5px 0 0;">Date limite : <strong>${echeance.toLocaleDateString('fr-FR')}</strong></p>
                                <p style="margin: 10px 0 0; font-weight: bold; color: #dc3545;">Il vous reste ${diffDays} jour(s) pour régulariser.</p>
                            </div>

                            <p>Merci de bien vouloir respecter vos engagements vis-à-vis de cette dette.</p>
                            <p style="font-style: italic; font-size: 0.9em;">Si vous avez déjà effectué ce paiement, veuillez ignorer ce message.</p>
                            
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">StockDash - Service Recouvrement</p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
            }
        }
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi des rappels automatiques:", error);
    }
};

const checkExpiredPromotions = async () => {
    console.log('⏰ [CRON] Vérification des promotions expirées...');
    try {
        const count = await articleService.desactiverPromotionsExpirees();
        if (count > 0) console.log(`✅ [CRON] ${count} promotion(s) expirée(s) ont été désactivées.`);
    } catch (error) {
        console.error("❌ [CRON] Erreur lors de la désactivation des promotions expirées:", error);
    }
};

const initReminderService = () => {
    // Planification : Tous les jours à 9h00 du matin
    // Format cron: minute heure jour mois jour-semaine
    cron.schedule('0 9 * * *', () => {
        sendDebtReminders();
        checkExpiredPromotions();
    });
    console.log('✅ Service de rappel de dettes activé (Vérification quotidienne à 09:00).');
};

module.exports = initReminderService;
