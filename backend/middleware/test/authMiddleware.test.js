/**
 * @file middleware/test/authMiddleware.test.js
 * @description Unit tests for authMiddleware (protect & authorize)
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { protect, authorize } = require('../authMiddleware');
const User = require('../../models/User');

jest.mock('jsonwebtoken');
jest.mock('../../models/User');

describe('Middleware : authMiddleware', () => {
    let req, res, next;

    const mockUserId = new mongoose.Types.ObjectId().toString();
    const mockBoutiqueId = new mongoose.Types.ObjectId().toString();

    // Helper pour mocker la chaîne Mongoose User.findById().select()
    const mockFindByIdSelect = (userData) => {
        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(userData)
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();

        process.env.JWT_SECRET = 'test_secret_key';

        req = {
            headers: {}
        };

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };

        next = jest.fn();
    });

    describe('protect', () => {
        test('doit refuser l accès si le header authorization est absent', async () => {
            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Non autorisé, aucun token fourni.',
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit refuser l accès si le header authorization ne commence pas par Bearer', async () => {
            req.headers.authorization = 'Basic token123';

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Non autorisé, aucun token fourni.',
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit refuser l accès si l utilisateur n existe pas en BDD', async () => {
            req.headers.authorization = 'Bearer token_valide';
            jwt.verify.mockReturnValue({ id: mockUserId });
            mockFindByIdSelect(null);

            await protect(req, res, next);

            expect(User.findById).toHaveBeenCalledWith(mockUserId);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Utilisateur introuvable ou compte supprimé.',
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit refuser l accès si le compte utilisateur est inactif (active: false)', async () => {
            req.headers.authorization = 'Bearer token_valide';
            jwt.verify.mockReturnValue({ id: mockUserId });
            mockFindByIdSelect({
                _id: mockUserId,
                active: false,
                deleted: false,
                role: 'Gérant'
            });

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Votre compte a été suspendu. Veuillez contacter l'administrateur.",
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit refuser l accès si le compte utilisateur est supprimé (deleted: true)', async () => {
            req.headers.authorization = 'Bearer token_valide';
            jwt.verify.mockReturnValue({ id: mockUserId });
            mockFindByIdSelect({
                _id: mockUserId,
                active: true,
                deleted: true,
                role: 'Gérant'
            });

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Votre compte a été suspendu. Veuillez contacter l'administrateur.",
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test.each(['Gérant', 'Caissier', 'GérantBar', 'ServeurBar'])(
            'doit refuser l accès si le rôle %s n a pas de boutique rattachée',
            async (role) => {
                req.headers.authorization = 'Bearer token_valide';
                jwt.verify.mockReturnValue({ id: mockUserId });
                mockFindByIdSelect({
                    _id: mockUserId,
                    id: mockUserId,
                    active: true,
                    deleted: false,
                    role: role,
                    boutique: null
                });

                await protect(req, res, next);

                expect(res.status).toHaveBeenCalledWith(403);
                expect(res.json).toHaveBeenCalledWith({
                    message: `Accès refusé : Votre compte ${role.toLowerCase()} n'est pas rattaché à une boutique.`,
                    redirect: '/login'
                });
                expect(next).not.toHaveBeenCalled();
            }
        );

        test('doit valider l utilisateur et définir skipSocket à true pour Admin et SuperAdmin', async () => {
            req.headers.authorization = 'Bearer token_valide';
            jwt.verify.mockReturnValue({ id: mockUserId });
            mockFindByIdSelect({
                _id: mockUserId,
                active: true,
                deleted: false,
                role: 'Admin'
            });

            await protect(req, res, next);

            expect(req.skipSocket).toBe(true);
            expect(next).toHaveBeenCalledTimes(1);
        });

        test('doit valider l utilisateur et définir skipSocket à false pour un gérant avec boutique', async () => {
            req.headers.authorization = 'Bearer token_valide';
            jwt.verify.mockReturnValue({ id: mockUserId });
            mockFindByIdSelect({
                _id: mockUserId,
                active: true,
                deleted: false,
                role: 'Gérant',
                boutique: mockBoutiqueId
            });

            await protect(req, res, next);

            expect(req.skipSocket).toBe(false);
            expect(req.user.role).toBe('Gérant');
            expect(next).toHaveBeenCalledTimes(1);
        });

        test('doit retourner une erreur 401 si le token a expiré (TokenExpiredError)', async () => {
            req.headers.authorization = 'Bearer token_expire';
            const expiredError = new Error('jwt expired');
            expiredError.name = 'TokenExpiredError';
            jwt.verify.mockImplementation(() => { throw expiredError; });

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Votre session a expiré. Veuillez vous reconnecter.',
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit retourner une erreur 401 pour tout autre type d erreur JWT', async () => {
            req.headers.authorization = 'Bearer token_invalide';
            const invalidError = new Error('invalid signature');
            invalidError.name = 'JsonWebTokenError';
            jwt.verify.mockImplementation(() => { throw invalidError; });

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Session invalide ou corrompue.',
                redirect: '/login'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('authorize', () => {
        test('doit laisser passer si l utilisateur est SuperAdmin même sans le rôle requis', () => {
            req.user = { role: 'SuperAdmin' };
            const authMiddleware = authorize('Admin', 'Gérant');

            authMiddleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        test('doit laisser passer si l utilisateur possède l un des rôles requis', () => {
            req.user = { role: 'Gérant' };
            const authMiddleware = authorize('Admin', 'Gérant');

            authMiddleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        test('doit refuser si req.user n existe pas', () => {
            req.user = undefined;
            const authMiddleware = authorize('Admin');

            authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Accès refusé. Rôle requis : Admin.'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('doit refuser si le rôle de l utilisateur ne fait pas partie des rôles autorisés', () => {
            req.user = { role: 'Caissier' };
            const authMiddleware = authorize('Admin', 'Gérant');

            authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Accès refusé. Rôle requis : Admin ou Gérant.'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
});