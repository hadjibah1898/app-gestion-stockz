/**
 * @file middleware/test/validators.article.test.js
 * @description Unit tests for validateArticle (pure-JS validator)
 */

const { validateArticle } = require('../validators');

function makeReq(body, method = 'POST') {
    return { body, method, path: '/api/test' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateArticle', () => {
    const valid = { nom: 'Cola', prixAchat: 100, prixVente: 150, quantite: 5 };

    test('accepte un article valide en POST', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq(valid), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse si nom manquant en POST', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({ ...valid, nom: '' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si prixVente <= prixAchat', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({ ...valid, prixAchat: 200, prixVente: 150 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un prix d achat négatif', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({ ...valid, prixAchat: -5 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('accepte une mise à jour partielle (PUT sans nom et sans prix)', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({ quantite: 10 }, 'PUT'), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});