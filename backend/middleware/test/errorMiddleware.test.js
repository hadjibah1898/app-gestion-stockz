/**
 * @file middleware/test/errorMiddleware.test.js
 * @description Unit tests for the global error handler
 */

const errorHandler = require('../errorMiddleware');

describe('Middleware : errorHandler', () => {
    let req, res, next;

    beforeEach(() => {
        process.env.NODE_ENV = 'development';
        res = {
            statusCode: 200,
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        req = { method: 'POST', url: '/api/test' };
        next = jest.fn();
    });

    test('doit renvoyer 500 et le stack en mode développement si le status n est pas défini', () => {
        const err = new Error('Erreur serveur');
        err.stack = 'stack trace';

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: 'Erreur serveur',
            stack: 'stack trace'
        });
    });

    test('doit masquer le stack et renvoyer null en production', () => {
        process.env.NODE_ENV = 'production';
        const err = new Error('Erreur serveur');
        err.stack = 'stack trace';

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: 'Erreur serveur',
            stack: null
        });
    });

    test('doit conserver le statusCode déjà défini (ex : 400)', () => {
        res.statusCode = 400;
        const err = new Error('Bad request');

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('doit logger une erreur serveur en console', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        res.statusCode = 200;
        const err = new Error('Boom');
        err.message = 'Boom';

        errorHandler(err, req, res, next);

        expect(console.error).toHaveBeenCalled();
        spy.mockRestore();
    });
});