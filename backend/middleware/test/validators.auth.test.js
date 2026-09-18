/**
 * @file middleware/test/validators.auth.test.js
 * @description Unit tests for validateAuth
 */

const { validateAuth } = require('../validators');

function makeReq(body, path = '/api/test') {
    return { body, path, method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateAuth', () => {
    test('accepte un email et un mot de passe valides', () => {
        const next = jest.fn();
        const res = makeRes();
        validateAuth(makeReq({ email: 'a@b.com', password: 'secret123' }, '/login'), res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse un email invalide', () => {
        const next = jest.fn();
        const res = makeRes();
        validateAuth(makeReq({ email: 'mauvais', password: 'secret123' }, '/login'), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, errors: ["L'adresse email est invalide."] });
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un mot de passe trop court lors d une inscription', () => {
        const next = jest.fn();
        const res = makeRes();
        validateAuth(makeReq({ email: 'a@b.com', password: '123', nom: 'Jean' }, '/register'), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse un nom absent lors d une inscription', () => {
        const next = jest.fn();
        const res = makeRes();
        validateAuth(makeReq({ email: 'a@b.com', password: 'secret123', nom: '' }, '/register'), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
});