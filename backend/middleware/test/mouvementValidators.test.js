/**
 * @file middleware/test/mouvementValidators.test.js
 * @description Unit tests for validatePerte (express-validator chain)
 */

const { validatePerte } = require('../mouvementValidators');

// Exécute la pile de middlewares validatePerte. On n'utilise pas un strict
// compteur de next() car les validateurs express-validator appellent aussi
// next() lors du passage — on vérifie le statut de la réponse.
const runValidatePerte = async (body) => {
    const next = jest.fn();
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    const req = { body, params: {}, route: { path: '/pertes' }, path: '/api/pertes' };

    for (const mw of validatePerte) {
        await mw(req, res, next);
    }
    return { req, res, next };
};

describe('Middleware : validatePerte', () => {
    const validBody = {
        articleId: '507f1f77bcf86cd799439011',
        quantite: '2',
        raison: 'Casse',
        details: 'Bouteille cassée'
    };

    test('accepte un body valide', async () => {
        const { res } = await runValidatePerte(validBody);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('refuse si articleId est requis', async () => {
        const { res } = await runValidatePerte({});
        expect(res.status).toHaveBeenCalledWith(400);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(false);
    });

    test('refuse si articleId est un ObjectId invalide', async () => {
        const { res } = await runValidatePerte({ ...validBody, articleId: 'abc' });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    test('refuse si quantite est négative ou nulle', async () => {
        const { res } = await runValidatePerte({ ...validBody, quantite: '0' });
        expect(res.status).toHaveBeenCalledWith(400);
        const payload = res.json.mock.calls[0][0];
        expect(payload.message).toBe('Erreur de validation des données.');
    });

    test('refuse si raison nest pas une valeur autorisée', async () => {
        const { res } = await runValidatePerte({ ...validBody, raison: 'Inconnue' });
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('accepte details optionnel', async () => {
        const { details, ...rest } = validBody;
        const { res } = await runValidatePerte(rest);
        expect(res.status).not.toHaveBeenCalled();
    });
});