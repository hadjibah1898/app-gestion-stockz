const Client = require('../models/Client');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const Vente = require('../models/Vente');

/**
 * @desc    Service centralisé pour la gestion des commissions des ouvriers
 */

/**
 * Exécute la logique transactionnelle de base pour un paiement
 * (Déduction du solde + Création de la dépense)
 */
const processPayment = async ({ workerId, montant, gerantId, boutiqueId, ouvertureCaisseId }) => {
    const amountToPay = parseFloat(montant);

    if (isNaN(amountToPay) || amountToPay <= 0) {
        const error = new Error("Montant de commission invalide.");
        error.statusCode = 400;
        throw error;
    }

    const worker = await Client.findById(workerId);
    if (!worker || worker.type !== 'Ouvrier') {
        const error = new Error("Ouvrier introuvable.");
        error.statusCode = 404;
        throw error;
    }

    if (amountToPay > worker.commission) {
        const error = new Error(`Le montant (${amountToPay.toLocaleString()} GNF) dépasse la commission due (${worker.commission.toLocaleString()} GNF).`);
        error.statusCode = 400;
        throw error;
    }

    // 1. Mise à jour du solde de l'ouvrier
    worker.commission -= amountToPay;
    await worker.save();

    // 2. Création de la dépense pour la session de caisse
    const depense = await Depense.create({
        montant: amountToPay,
        motif: `Paiement commission: ${worker.nom}`,
        ouvertureCaisse: ouvertureCaisseId,
        gerant: gerantId,
        boutique: boutiqueId,
        date: new Date()
    });

    return { worker, depense };
};

/**
 * Gère un paiement manuel initié par le gérant depuis son interface
 */
const payManualCommission = async ({ workerId, montant, gerantId, boutiqueId }) => {
    // Vérifier si une caisse est ouverte
    const currentCaisse = await OuvertureCaisse.findOne({ gerant: gerantId, statut: 'OUVERTE' });
    if (!currentCaisse) {
        const error = new Error("Aucune caisse ouverte. Veuillez ouvrir votre caisse d'abord.");
        error.statusCode = 400;
        throw error;
    }

    // Effectuer le traitement atomique
    const { worker } = await processPayment({ workerId, montant, gerantId, boutiqueId, ouvertureCaisseId: currentCaisse._id });

    // Mise à jour du total des dépenses de la caisse pour maintenir le solde théorique à jour
    currentCaisse.totalDepenses = (currentCaisse.totalDepenses || 0) + parseFloat(montant);
    await currentCaisse.save();

    return { success: true, message: "Commission payée avec succès.", newCommission: worker.commission };
};

/**
 * Calcule le rapport des commissions générées par mois pour tous les ouvriers
 */
const getMonthlyCommissionsReport = async (month, year) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return await Vente.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                isCancelled: false,
                client: { $ne: null }
            }
        },
        {
            $lookup: {
                from: 'clients',
                localField: 'client',
                foreignField: '_id',
                as: 'clientInfo'
            }
        },
        { $unwind: '$clientInfo' },
        { $match: { 'clientInfo.type': 'Ouvrier' } },
        {
            $group: {
                _id: '$client',
                nom: { $first: '$clientInfo.nom' },
                tauxCommission: { $first: '$clientInfo.tauxCommission' },
                totalVentes: { $sum: '$prixTotal' },
                commissionGeneree: {
                    $sum: {
                        $divide: [
                            { $multiply: ['$prixTotal', '$clientInfo.tauxCommission'] },
                            100
                        ]
                    }
                }
            }
        },
        { $sort: { commissionGeneree: -1 } }
    ]);
};

module.exports = {
    processPayment,
    payManualCommission,
    getMonthlyCommissionsReport
};