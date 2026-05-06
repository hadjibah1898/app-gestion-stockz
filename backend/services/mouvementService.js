const Mouvement = require('../models/Mouvement');
const Boutique = require('../models/Boutique');

exports.listerMouvements = async (filter = {}, user = null) => {
    const { page, limit, statutTransfert, type, boutiqueSource, boutiqueDestination, boutiqueDestinationType, ...restFilters } = filter;
    const query = { ...restFilters };

    // SÉCURITÉ MULTI-TENANT
    if (user) {
        if (user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id.toString());

            // If a specific boutique is requested, ensure it belongs to the admin
            if (boutiqueSource && !myBoutiqueIds.includes(boutiqueSource.toString())) {
                throw new Error("Accès refusé : La boutique source ne vous appartient pas.");
            }
            if (boutiqueDestination && !myBoutiqueIds.includes(boutiqueDestination.toString())) {
                throw new Error("Accès refusé : La boutique destination ne vous appartient pas.");
            }

            // If no specific boutique filter, restrict to admin's boutiques
            if (!boutiqueSource && !boutiqueDestination) {
                query.$or = [
                    { boutiqueSource: { $in: myBoutiques.map(b => b._id) } },
                    { boutiqueDestination: { $in: myBoutiques.map(b => b._id) } }
                ];
            } else {
                if (boutiqueSource) query.boutiqueSource = boutiqueSource;
                if (boutiqueDestination) query.boutiqueDestination = boutiqueDestination;
            }
        } else if (['Gérant', 'Serveur'].includes(user.role)) {
            // Gérants/Serveurs only see movements related to their assigned boutique
            const userBoutiqueId = user.boutique?._id || user.boutique;
            if (!userBoutiqueId) {
                query.$or = [{ boutiqueSource: null }, { boutiqueDestination: null }]; // No boutique assigned, no movements
            } else {
                query.$or = [
                    { boutiqueSource: userBoutiqueId },
                    { boutiqueDestination: userBoutiqueId }
                ];
            }
        }
    }

    if (statutTransfert) query.statutTransfert = statutTransfert;
    if (type) query.type = type; // Add this filter to handle the 'type' parameter

    // Handle boutiqueDestinationType filter (requires population)
    if (boutiqueDestinationType) {
        let destinationBoutiquesQuery = { type: boutiqueDestinationType };
        // If user is Admin, ensure destination boutiques belong to them
        if (user && user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            destinationBoutiquesQuery._id = { $in: myBoutiques.map(b => b._id) };
        }
        const destinationBoutiques = await Boutique.find(destinationBoutiquesQuery).select('_id');
        query.boutiqueDestination = { $in: destinationBoutiques.map(b => b._id) };
    }

    const limitNum = parseInt(limit) || 15;
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Mouvement.countDocuments(query);
    const mouvements = await Mouvement.find(query)
        .populate('boutiqueSource', 'nom type createur')
        .populate('boutiqueDestination', 'nom type createur')
        .populate('fournisseur', 'nom')
        .populate('operateur', 'nom')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    return {
        data: mouvements,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum
    };
};