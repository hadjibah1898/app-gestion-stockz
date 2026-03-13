const AuditLog = require('../models/AuditLog');

/**
 * @desc    Récupérer les journaux d'audit avec filtres
 * @route   GET /api/audit
 * @access  Private/Admin
 */
exports.getLogs = async (req, res) => {
    try {
        const { user, action, startDate, endDate } = req.query;
        const query = {};

        if (user) {
            query.user = user;
        }
        if (action) {
            // Utilise une expression régulière pour une recherche partielle insensible à la casse
            query.action = { $regex: action, $options: 'i' };
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // Inclure toute la journée de fin
                query.createdAt.$lte = end;
            }
        }

        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(1000); // Limite pour éviter de surcharger
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ message: "Erreur interne du serveur lors de la récupération des journaux.", error: error.message });
    }
};