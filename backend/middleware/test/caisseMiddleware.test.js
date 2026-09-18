/**
 * @file middleware/test/caisseMiddleware.test.js
 * @description Unit tests for checkCaisseOuverte & checkAucunRapportEnAttente
 */

const OuvertureCaisse = require('../../models/OuvertureCaisse');
const RapportCaisse = require('../../models/RapportCaisse');
const { checkCaisseOuverte, checkAucunRapportEnAttente } = require('../caisseMiddleware');

jest.mock('../../models/OuvertureCaisse');
jest.mock('../../models/RapportCaisse');

function makeReq(user) {
    return {
        user: user || null,
        originalUrl: '/api/sales',
        method: 'POST'
    };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

const mockFindOneLean = (model, result) => {
    model.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(result) });
};

describe('checkCaisseOuverte', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const boutiqueId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

    test('refuse si req.user est absent (401)', async () => {
        const next = jest.fn();
        const res = makeRes();
        await checkCaisseOuverte(makeReq(null), res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si aucune boutique rattachée (403)', async () => {
        const next = jest.fn();
        const res = makeRes();
        await checkCaisseOuverte(makeReq({ role: 'Gérant', id: userId, boutique: null }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si aucune caisse ouverte pour un Gérant (403)', async () => {
        mockFindOneLean(OuvertureCaisse, null);
        const next = jest.fn();
        const res = makeRes();
        await checkCaisseOuverte(makeReq({ role: 'Gérant', id: userId, boutique: boutiqueId }), res, next);
        expect(OuvertureCaisse.findOne).toHaveBeenCalledWith({
            boutique: boutiqueId,
            statut: 'OUVERTE',
            gerant: userId,
            type: 'GERANT'
        });
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si aucune caisse ouverte pour un Serveur avec message dédié', async () => {
        mockFindOneLean(OuvertureCaisse, null);
        const next = jest.fn();
        const res = makeRes();
        await checkCaisseOuverte(makeReq({ role: 'Serveur', id: userId, boutique: boutiqueId }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].message).toContain("Demandez au gérant de l'ouvrir.");
        expect(next).not.toHaveBeenCalled();
    });

    test('injecte la caisse ouverte et appelle next()', async () => {
        mockFindOneLean(OuvertureCaisse, { _id: 'cccccccccccccccccccccccc', statut: 'OUVERTE' });
        const req = makeReq({ role: 'Gérant', id: userId, boutique: boutiqueId });
        const next = jest.fn();
        const res = makeRes();
        await checkCaisseOuverte(req, res, next);
        expect(req.ouvertureCaisse).toEqual({ _id: 'cccccccccccccccccccccccc', statut: 'OUVERTE' });
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('checkAucunRapportEnAttente', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

    test('refuse si req.user est absent (401)', async () => {
        const next = jest.fn();
        const res = makeRes();
        await checkAucunRapportEnAttente(makeReq(null), res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('autorise si aucun rapport en attente', async () => {
        mockFindOneLean(RapportCaisse, null);
        const next = jest.fn();
        const res = makeRes();
        await checkAucunRapportEnAttente(makeReq({ id: userId }), res, next);
        expect(RapportCaisse.findOne).toHaveBeenCalledWith({ gerant: userId, statut: 'EN_ATTENTE' });
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('bloque si un rapport est en attente (403)', async () => {
        mockFindOneLean(RapportCaisse, { _id: 'cccccccccccccccccccccccc' });
        const next = jest.fn();
        const res = makeRes();
        await checkAucunRapportEnAttente(makeReq({ id: userId }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});