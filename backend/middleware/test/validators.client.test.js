/**
 * @file middleware/test/validators.client.test.js
 * @description Unit tests for validateClient / validateFournisseur / validateBoutique
 */

const { validateClient, validateFournisseur, validateBoutique } = require('../validators');

function makeReq(body) {
    return { body, path: '/api/test', method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateClient', () => {
    test('accepte un client valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'Jean', telephone: '+224620000000' }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un nom trop court', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'J' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un email invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'Jean', email: 'bad' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse un type invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateClient(makeReq({ nom: 'Jean', type: 'VIP' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('Middleware : validateFournisseur', () => {
    test('accepte un fournisseur valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateFournisseur(makeReq({ nom: 'Soc', telephone: '+224625000000' }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse si le téléphone est manquant', () => {
        const next = jest.fn();
        const res = makeRes();
        validateFournisseur(makeReq({ nom: 'Soc', telephone: '' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse un format de téléphone invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateFournisseur(makeReq({ nom: 'Soc', telephone: 'abc' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('Middleware : validateBoutique', () => {
    test('accepte une boutique valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateBoutique(makeReq({ nom: 'Boutique A', adresse: 'Conakry Centre', type: 'Secondaire' }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un nom et une adresse incomplets', () => {
        const next = jest.fn();
        const res = makeRes();
        validateBoutique(makeReq({ nom: 'B', adresse: 'X' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un type invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateBoutique(makeReq({ nom: 'Boutique A', adresse: 'Conakry Centre', type: 'CentraleX' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});