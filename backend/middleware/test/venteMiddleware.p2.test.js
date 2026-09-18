/**
 * @file middleware/test/venteMiddleware.p2.test.js
 * @description Unit tests for verifyArticlesBelongToBoutique — articles & validation du panier
 */

const mongoose = require('mongoose');
const Article = require('../../models/Article');
const Client = require('../../models/Client');
const { verifyArticlesBelongToBoutique } = require('../venteMiddleware');

jest.mock('../../models/Article');
jest.mock('../../models/Client');

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

describe('verifyArticlesBelongToBoutique — articles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOuvertureCaisseModel.findOne.mockReset();
        mockOuvertureCaisseModel.findOne.mockResolvedValue({ _id: 'caisse1' });
    });

    test('refuse si le client est introuvable', async () => {
        Client.findById.mockResolvedValue(null);
        const clientId = new mongoose.Types.ObjectId().toString();
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }], clientId }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si la quantité est invalide', async () => {
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 0 }] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un article introuvable', async () => {
        Article.findById.mockResolvedValue(null);
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si l article appartient à une autre boutique (403)', async () => {
        const otherBoutique = new mongoose.Types.ObjectId().toString();
        Article.findById.mockResolvedValue({ _id: validArticleId, nom: 'Produit', boutique: otherBoutique, prixVente: 100, quantite: 10 });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si le stock est insuffisant', async () => {
        Article.findById.mockResolvedValue({ _id: validArticleId, nom: 'Produit', boutique: boutiqueId, prixVente: 100, quantite: 1 });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 5 }] }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse une vente à crédit sans client (montantPaye < total)', async () => {
        Article.findById.mockResolvedValue({ _id: validArticleId, nom: 'Produit', boutique: boutiqueId, prixVente: 100, quantite: 10 });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }], montantPaye: 50 }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('accepte un panier valide et appelle next()', async () => {
        Article.findById.mockResolvedValue({ _id: validArticleId, nom: 'Produit', boutique: boutiqueId, prixVente: 100, quantite: 10 });
        const req = makeReq({ panier: [{ article: validArticleId, quantite: 1 }], montantPaye: 200 }, baseUser);
        const res = makeRes();
        const next = jest.fn();
        await verifyArticlesBelongToBoutique(req, res, next);
        expect(Article.findById).toHaveBeenCalledWith(validArticleId);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});