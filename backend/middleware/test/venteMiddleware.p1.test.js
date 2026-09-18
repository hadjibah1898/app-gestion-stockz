/**
 * @file middleware/test/venteMiddleware.p1.test.js
 * @description Unit tests for verifyArticlesBelongToBoutique — sécurité & panier
 */

const mongoose = require('mongoose');
const auditLogService = require('../../services/auditLogService');
const { verifyArticlesBelongToBoutique } = require('../venteMiddleware');

jest.mock('../../services/auditLogService');

// Mock mongoose.model('OuvertureCaisse') utilisé dans le middleware
const mockOuvertureCaisseModel = { findOne: jest.fn() };
jest.spyOn(mongoose, 'model').mockImplementation((name) => {
    if (name === 'OuvertureCaisse') return mockOuvertureCaisseModel;
    throw new Error(`Model inconnu : ${name}`);
});

function makeReq(body, user) {
    return { body, user: user || {}, originalUrl: '/api/ventes', method: 'POST' };
}
function makeRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const validArticleId = new mongoose.Types.ObjectId().toString();
const boutiqueId = new mongoose.Types.ObjectId().toString();
const baseUser = { boutique: boutiqueId, role: 'Gérant', mustChangePassword: false };

describe('verifyArticlesBelongToBoutique — garde-fous', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOuvertureCaisseModel.findOne.mockReset();
    });

    test('bloque si l utilisateur doit changer son mot de passe', async () => {
        const req = makeReq({ panier: [] }, { ...baseUser, mustChangePassword: true });
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(auditLogService.logAction).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('bloque un administrateur (Admin ne fait pas de vente)', async () => {
        const req = makeReq({ panier: [] }, { boutique: boutiqueId, role: 'Admin', mustChangePassword: false });
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un panier vide', async () => {
        const req = makeReq({ panier: [] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si aucune boutique assignée', async () => {
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }] }, { ...baseUser, boutique: null });
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si la caisse de la boutique est fermée', async () => {
        mockOuvertureCaisseModel.findOne.mockResolvedValue(null);
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si l ID client est invalide', async () => {
        mockOuvertureCaisseModel.findOne.mockResolvedValue({ _id: 'caisse1' });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }], clientId: 'bad-id' }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse une date d échéance dans le passé', async () => {
        mockOuvertureCaisseModel.findOne.mockResolvedValue({ _id: 'caisse1' });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }], echeanceDette: '2020-01-01' }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
});