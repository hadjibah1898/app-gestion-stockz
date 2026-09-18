/**
 * @file middleware/test/rateLimitMiddleware.test.js
 * @description Unit tests for the in-memory rate limiter
 */

const rateLimiter = require('../rateLimitMiddleware');

// NB : le module partage un Map global en mémoire (non exporté). Pour éviter
// toute contamination entre tests, chaque test utilise une IP unique.

let counter = 0;

describe('Middleware : rateLimiter', () => {
    let req, res, next;

    beforeEach(() => {
        counter += 1;
        req = { ip: `192.168.1.${counter}`, connection: { remoteAddress: '' } };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    test('doit laisser passer la première requête', () => {
        const limiter = rateLimiter();
        limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('doit laisser passer tant qu on reste sous la limite', () => {
        const limiter = rateLimiter(3, 10000);
        for (let i = 0; i < 3; i++) {
            limiter(req, res, next);
        }
        expect(next).toHaveBeenCalledTimes(3);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('doit renvoyer 429 une fois la limite dépassée', () => {
        const limiter = rateLimiter(3, 10000);
        for (let i = 0; i < 4; i++) {
            limiter(req, res, next);
        }
        expect(next).toHaveBeenCalledTimes(3);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({
            message: "Trop de requêtes. Veuillez réessayer dans 15 minutes."
        });
    });
});