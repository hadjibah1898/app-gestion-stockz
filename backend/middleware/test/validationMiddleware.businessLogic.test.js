/**
 * @file middleware/test/validationMiddleware.businessLogic.test.js
 * @description Unit tests for validateArticleBusinessLogic
 */

const Article = require('../../models/Article');
const Boutique = require('../../models/Boutique');
const { validateArticleBusinessLogic } = require('../validationMiddleware');

jest.mock('../../models/Article');
jest.mock('../../models/Boutique');

function makeReq(body) {
    return { body, params: {}, method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('validateArticleBusinessLogic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('refuse si prixVente < prixAchat', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({ prixVente: 100, prixAchat: 200 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si remise dégradante sous le prix d achat', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({ prixAchat: 90, prixVente: 100, remise: 20 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si la date de péremption est dans le passé', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({
            prixAchat: 90,
            prixVente: 100,
            datePeremption: '2020-01-01'
        }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si promo hors 0-100', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({ prixAchat: 90, prixVente: 100, promo: 120 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('vérifie l existence de la boutique', async () => {
        Boutique.findById.mockResolvedValue(null);
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({
            prixAchat: 90,
            prixVente: 100,
            boutique: 'aaaaaaaaaaaaaaaaaaaaaaaa'
        }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].errors.boutique).toBeDefined();
        expect(next).not.toHaveBeenCalled();
    });

    test('appelle next() quand tout est valide', async () => {
        Boutique.findById.mockResolvedValue({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
        Article.findOne.mockResolvedValue(null);
        const next = jest.fn();
        const res = makeRes();
        await validateArticleBusinessLogic(makeReq({
            prixAchat: 90,
            prixVente: 100,
            boutique: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            nom: 'Cola'
        }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});