/**
 * @file middleware/test/validators.caisse.test.js
 * @description Unit tests for validateOuvertureCaisse / validateFermetureCaisse / validateDepense
 */

const { validateOuvertureCaisse, validateFermetureCaisse, validateDepense } = require('../validators');

function makeReq(body) {
    return { body, path: '/api/test', method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateOuvertureCaisse', () => {
    test('accepte une ouverture de caisse valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateOuvertureCaisse(makeReq({ fondInitial: 1000 }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse une ouverture sans fond initial', () => {
        const next = jest.fn();
        const res = makeRes();
        validateOuvertureCaisse(makeReq({}), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un fond initial négatif', () => {
        const next = jest.fn();
        const res = makeRes();
        validateOuvertureCaisse(makeReq({ fondInitial: -100 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('Middleware : validateFermetureCaisse', () => {
    test('accepte une fermeture de caisse valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateFermetureCaisse(makeReq({ montantCloture: 2000 }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse une clôture avec montant négatif', () => {
        const next = jest.fn();
        const res = makeRes();
        validateFermetureCaisse(makeReq({ montantCloture: -1 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('Middleware : validateDepense', () => {
    test('accepte une dépense valide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateDepense(makeReq({ montant: 500, motif: 'Achat de papier' }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse une dépense avec motif trop court', () => {
        const next = jest.fn();
        const res = makeRes();
        validateDepense(makeReq({ montant: 500, motif: 'Xi' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('refuse un montant nul ou négatif', () => {
        const next = jest.fn();
        const res = makeRes();
        validateDepense(makeReq({ montant: 0, motif: 'Rien' }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});