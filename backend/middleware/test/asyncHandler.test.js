/**
 * @file middleware/test/asyncHandler.test.js
 * @description Unit tests for asyncHandler wrapper
 */

const asyncHandler = require('../asyncHandler');

describe('Middleware : asyncHandler', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        // Espionner console.error pour éviter de polluer les logs pendant les tests d'erreurs
        jest.spyOn(console, 'error').mockImplementation(() => {});

        req = {
            method: 'GET',
            originalUrl: '/api/test'
        };
        res = {};
        next = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('doit exécuter la fonction avec succès si aucune erreur n est levée', async () => {
        const mockController = jest.fn().mockResolvedValue('succès');
        const wrappedController = asyncHandler(mockController);

        await wrappedController(req, res, next);

        expect(mockController).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
    });

    test('doit capturer une erreur asynchrone et l envoyer au middleware next(err)', async () => {
        const testError = new Error('Erreur de base de données');
        const mockController = jest.fn().mockRejectedValue(testError);
        const wrappedController = asyncHandler(mockController);

        await wrappedController(req, res, next);

        expect(mockController).toHaveBeenCalledWith(req, res, next);
        expect(console.error).toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(testError);
    });

    test('doit laisser propager une erreur synchrone levée dans le contrôleur', async () => {
        const testError = new Error('Erreur synchrone');
        const mockController = jest.fn().mockImplementation(() => {
            throw testError;
        });
        const wrappedController = asyncHandler(mockController);

        // Une erreur synchrone levée dans le contrôleur se propage avant d être
        // capturée par Promise.resolve().catch() — on vérifie donc le throw direct.
        expect(() => wrappedController(req, res, next)).toThrow('Erreur synchrone');
        expect(next).not.toHaveBeenCalled();
    });
});