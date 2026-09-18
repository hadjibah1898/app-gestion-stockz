/**
 * @file middleware/test/tenantScope.test.js
 * @description Unit tests for the multi-tenant isolation helpers
 */

const Boutique = require('../../models/Boutique');
const ts = require('../tenantScope');

jest.mock('../../models/Boutique');

describe('Middleware : tenantScope', () => {
    const adminId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const otherAdminId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const boutiqueId = 'cccccccccccccccccccccccc';
    const otherBoutiqueId = 'dddddddddddddddddddddddd';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isAdminLike / isSuperAdmin / isStaff', () => {
        test('isAdminLike renvoie true pour Admin et AdminBar', () => {
            expect(ts.isAdminLike({ role: 'Admin' })).toBe(true);
            expect(ts.isAdminLike({ role: 'AdminBar' })).toBe(true);
            expect(ts.isAdminLike({ role: 'Gérant' })).toBe(false);
        });

        test('isSuperAdmin renvoie true uniquement pour SuperAdmin', () => {
            expect(ts.isSuperAdmin({ role: 'SuperAdmin' })).toBe(true);
            expect(ts.isSuperAdmin({ role: 'Admin' })).toBe(false);
        });

        test('isStaff renvoie true pour les rôles de personnel', () => {
            expect(ts.isStaff({ role: 'Gérant' })).toBe(true);
            expect(ts.isStaff({ role: 'Caissier' })).toBe(true);
            expect(ts.isStaff({ role: 'Admin' })).toBe(false);
        });
    });

    describe('getUserBoutiqueIds', () => {
        test('retourne [] si user est null', async () => {
            const ids = await ts.getUserBoutiqueIds(null);
            expect(ids).toEqual([]);
        });

        test('retourne [] pour un SuperAdmin (accès total)', async () => {
            const ids = await ts.getUserBoutiqueIds({ role: 'SuperAdmin' });
            expect(ids).toEqual([]);
            expect(Boutique.find).not.toHaveBeenCalled();
        });

        test('retourne les boutiques appartenant à un Admin', async () => {
            Boutique.find.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([{ _id: boutiqueId }])
                })
            });
            const ids = await ts.getUserBoutiqueIds({ role: 'Admin', id: adminId });
            expect(ids).toEqual([boutiqueId]);
            expect(Boutique.find).toHaveBeenCalledWith({ createur: adminId });
        });

        test('retourne la boutique du staff', async () => {
            const ids = await ts.getUserBoutiqueIds({ role: 'Gérant', boutique: { _id: boutiqueId } });
            expect(ids).toEqual([boutiqueId]);
        });

        test('retourne [] pour un rôle inconnu', async () => {
            const ids = await ts.getUserBoutiqueIds({ role: 'Autre', boutique: { _id: boutiqueId } });
            expect(ids).toEqual([]);
        });
    });

    describe('getTenantFilter', () => {
        test('retourne {} pour un SuperAdmin', async () => {
            const filter = await ts.getTenantFilter({ role: 'SuperAdmin' });
            expect(filter).toEqual({});
        });

        test('retourne un filtre boutique vide si aucun id', async () => {
            Boutique.find.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([])
                })
            });
            const filter = await ts.getTenantFilter({ role: 'Admin', id: adminId });
            expect(filter).toEqual({ boutique: { $in: [] } });
        });

        test('retourne un filtre sur les ids des boutiques', async () => {
            Boutique.find.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([{ _id: boutiqueId }])
                })
            });
            const filter = await ts.getTenantFilter({ role: 'Admin', id: adminId });
            expect(filter).toEqual({ boutique: { $in: [boutiqueId] } });
        });
    });
});