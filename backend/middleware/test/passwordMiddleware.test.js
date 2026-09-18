/**
 * @file middleware/test/passwordMiddleware.test.js
 * @description Unit tests for checkMustChangePassword middleware
 */

const { checkMustChangePassword } = require('../passwordMiddleware');
const auditLogService = require('../../services/auditLogService');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

describe('Middleware : checkMustChangePassword', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            user: null,
            originalUrl: '/api/sales',
            method: 'POST',
            connection: { remoteAddress: '127.0.0.1' }
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    test('doit laisser passer si req.user est absent', async () => {
        await checkMustChangePassword(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('doit laisser passer si mustChangePassword est false', async () => {
        req.user = { _id: 'u1', mustChangePassword: false };
        await checkMustChangePassword(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(auditLogService.logAction).not.toHaveBeenCalled();
    });

    test('doit bloquer et journaliser si mustChangePassword est true', async () => {
        req.user = { _id: 'u1', nom: 'Test', mustChangePassword: true };
        await checkMustChangePassword(req, res, next);

        expect(auditLogService.logAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ACCESS_BLOCKED_PWD_CHANGE_REQUIRED',
            user: req.user,
            status: 'FAILURE'
        }));
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: "Accès refusé : Vous devez changer votre mot de passe par défaut avant de pouvoir effectuer cette opération.",
            mustChangePassword: true
        });
        expect(next).not.toHaveBeenCalled();
    });
});