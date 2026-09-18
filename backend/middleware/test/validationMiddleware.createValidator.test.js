/**
 * @file middleware/test/validationMiddleware.createValidator.test.js
 * @description Unit tests for createValidator & validated schema helpers
 */

const {
    createValidator,
    validateArticle,
    validateClient
} = require('../validationMiddleware');

function makeReq(body) {
    return { body, params: {}, method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('createValidator', () => {
    const schema = {
        nom: { type: 'string', required: true, min: 2, max: 5 },
        montant: { type: 'number', min: 0 },
        actif: { type: 'boolean' }
    };
    const mw = createValidator(schema);

    test('accepte des données valides', () => {
        const next = jest.fn();
        const res = makeRes();
        mw(makeReq({ nom: 'Jean', montant: 10, actif: true }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('refuse un champ requis manquant', () => {
        const next = jest.fn();
        const res = makeRes();
        mw(makeReq({ montant: 10 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].errors.nom).toBeDefined();
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse une longueur min non respectée', () => {
        const next = jest.fn();
        const res = makeRes();
        mw(makeReq({ nom: 'J' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un type nombre invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        mw(makeReq({ nom: 'Jean', montant: 'abc' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un bolléen invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        mw(makeReq({ nom: 'Jean', actif: 'oui' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('validateArticle (schéma objectId)', () => {
    test('refuse un boutique ID invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({
            nom: 'Cola',
            prixAchat: 100,
            prixVente: 150,
            boutique: '123'
        }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].errors.boutique).toBeDefined();
        expect(next).not.toHaveBeenCalled();
    });

    test('accepte un boutique ID valide (24 hex)', () => {
        const next = jest.fn();
        const res = makeRes();
        validateArticle(makeReq({
            nom: 'Cola',
            prixAchat: 100,
            prixVente: 150,
            boutique: 'aaaaaaaaaaaaaaaaaaaaaaaa'
        }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('validateClient (schéma)', () => {
    test('accepte un client valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'Jean', type: 'Client', commission: 0 }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un type invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'Jean', type: 'VIP' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
});