const { flushBoutiqueCache } = require('../utils/cache');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * @desc    Vider manuellement le cache des boutiques (Maintenance Admin)
 * @route   DELETE /api/cache/boutiques
 */
exports.flushBoutiqueCacheManually = asyncHandler(async (req, res) => {
    flushBoutiqueCache();
    
    await auditHelper.logSuccess(req, req.user, 'FLUSH_BOUTIQUE_CACHE', 'Cache', null, { 
        message: 'Boutique cache manually flushed by Admin' 
    });

    res.status(200).json({ success: true, message: 'Cache des boutiques vidé avec succès.' });
});