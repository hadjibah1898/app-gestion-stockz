/**
 * @file middleware/test/validators.stock.test.js
 * @description Unit tests for validateTransfert / validateVente
 */

const { validateTransfert, validateVente } = require('../validators');

function makeReq(body, path = '/api/test') {
    return { body, path, method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateTransfert', () => {
    test('accepte un transfert valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ sourceId: 'a1', targetId: 'b1', articles: [{ articleId: 'x', quantite: 2 }] }, '/api/articles/transfer'),
            res,
            next
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse si les boutiques source/destination manquent pour /transfer', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ articles: [{ articleId: 'x', quantite: 2 }] }, '/api/articles/transfer'),
            res,
            next
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('accepte un restock avec targetId seul', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ targetId: 'b1', articles: [{ articleId: 'x', quantite: 2 }] }, '/api/articles/restock'),
            res,
            next
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un restock sans targetId', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ articles: [{ articleId: 'x', quantite: 2 }] }, '/api/articles/restock'),
            res,
            next
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse une quantité invalide dans les articles', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ sourceId: 'a1', targetId: 'b1', articles: [{ articleId: 'x', quantite: -1 }] }, '/api/articles/transfer'),
            res,
            next
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse si la liste d articles est vide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateTransfert(
            makeReq({ sourceId: 'a1', targetId: 'b1', articles: [] }, '/api/articles/transfer'),
            res,
            next
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('Middleware : validateVente', () => {
    test('accepte une vente valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateVente(makeReq({ panier: [{ article: 'x1', quantite: 2 }], montantPaye: 500 }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un panier vide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateVente(makeReq({ panier: [] }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse un article manquant dans le panier', () => {
        const next = jest.fn();
        const res = makeRes();
        validateVente(makeReq({ panier: [{ quantite: 1 }] }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse un montant négatif', () => {
        const next = jest.fn();
        const res = makeRes();
        validateVente(makeReq({ panier: [{ article: 'x1', quantite: 1 }], montantPaye: -5 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse une date échéance invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateVente(makeReq({ panier: [{ article: 'x1', quantite: 1 }], echeanceDette: 'pas-une-date' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});