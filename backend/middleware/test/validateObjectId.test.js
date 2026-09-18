/**
 * @file middleware/test/validateObjectId.test.js
 * @description Unit tests for the ObjectId validation middleware
 */

const mongoose = require('mongoose');
const validateObjectId = require('../validateObjectId');

describe('Middleware : validateObjectId', () => {
    let req, res, next;
    const validId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        req = { params: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    test('doit passer si tous les IDs sont valides', () => {
        req.params = { id: validId, boutiqueId: validId };
        const mw = validateObjectId('id', 'boutiqueId');
        mw(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('doit passer si un paramètre est absent (id undefined)', () => {
        req.params = {};
        const mw = validateObjectId('id');
        mw(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('doit renvoyer 400 si un ID est invalide', () => {
        req.params = { id: 'abc' };
        const mw = validateObjectId('id');
        mw(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "L'identifiant fourni pour 'id' n'est pas valide."
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('doit identifier le bon paramètre invalide parmi plusieurs', () => {
        req.params = { id: validId, autre: '123' };
        const mw = validateObjectId('id', 'autre');
        mw(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "L'identifiant fourni pour 'autre' n'est pas valide."
        });
        expect(next).not.toHaveBeenCalled();
    });
});