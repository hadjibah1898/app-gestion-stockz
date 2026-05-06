const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

/**
 * @desc    Récupérer les journaux d'audit avec filtres
 * @route   GET /api/audit
 * @access  Private/Admin
 */
exports.getLogs = async (req, res) => {
    try {
        const { user, action, startDate, endDate, page = 1, limit = 20 } = req.query;
        const query = {};
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            // L'Admin voit ses logs + ceux des utilisateurs qu'il a créés
            const myUsers = await User.find({ createur: req.user.id }).select('_id');
            const authorizedUserIds = myUsers.map(u => u._id);
            authorizedUserIds.push(req.user.id);

            if (user) {
                query.user = authorizedUserIds.includes(user) ? user : { $in: [] };
            } else {
                query.user = { $in: authorizedUserIds };
            }
        } else if (user) {
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

        const totalLogs = await AuditLog.countDocuments(query);
        let logsQuery = AuditLog.find(query).sort({ createdAt: -1 });

        // Appliquer la pagination seulement si une limite positive est spécifiée
        if (limitNum > 0) {
            const skip = (pageNum - 1) * limitNum;
            logsQuery = logsQuery.skip(skip).limit(limitNum);
        }

        const logs = await logsQuery;

        res.status(200).json({
            logs,
            currentPage: pageNum,
            totalPages: limitNum > 0 ? Math.ceil(totalLogs / limitNum) : 1
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur interne du serveur lors de la récupération des journaux.", error: error.message });
    }
};