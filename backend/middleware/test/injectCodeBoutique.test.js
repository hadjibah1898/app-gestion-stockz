/**
 * @file middleware/test/injectCodeBoutique.test.js
 * @description Unit tests for injectCodeBoutique middleware
 */

const injectCodeBoutique = require('../injectCodeBoutique');

describe('Middleware : injectCodeBoutique', () => {
    let req, res, next;

    beforeEach(() => {
        req = { user: null };
        res = {};
        next = jest.fn();
    });

    test('doit appeler next() même si req.user est absent', () => {
        injectCodeBoutique(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.codeBoutique).toBeUndefined();
    });

    test('doit injecter codeBoutique depuis la boutique peuplée', () => {
        req.user = { boutique: { codeBoutique: 'BTQ-001' } };
        injectCodeBoutique(req, res, next);
        expect(req.codeBoutique).toBe('BTQ-001');
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('doit injecter codeBoutique depuis l utilisateur si la boutique n est pas peuplée', () => {
        req.user = { boutique: null, codeBoutique: 'BTQ-002' };
        injectCodeBoutique(req, res, next);
        expect(req.codeBoutique).toBe('BTQ-002');
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('ne définit pas codeBoutique si aucun champ n est renseigné', () => {
        req.user = { boutique: {}, codeBoutique: '' };
        injectCodeBoutique(req, res, next);
        expect(req.codeBoutique).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });
});