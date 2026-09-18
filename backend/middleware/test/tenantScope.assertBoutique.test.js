/**
 * @file middleware/test/tenantScope.assertBoutique.test.js
 * @description Unit tests for assertBoutiqueBelongsToAdmin / assertArticleInTenant
 */

const Boutique = require('../../models/Boutique');
const ts = require('../tenantScope');

jest.mock('../../models/Boutique');

describe('tenantScope : assertBoutiqueBelongsToAdmin / assertArticleInTenant', () => {
    const adminId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const otherAdminId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const boutiqueId = 'cccccccccccccccccccccccc';
    const otherBoutiqueId = 'dddddddddddddddddddddddd';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('assertBoutiqueBelongsToAdmin', () => {
        test('lève une erreur 400 si pas de boutiqueId', async () => {
            await expect(ts.assertBoutiqueBelongsToAdmin({ role: 'Admin' }, null))
                .rejects.toMatchObject({ statusCode: 400 });
        });

        test('ne fait rien pour un SuperAdmin', async () => {
            await expect(ts.assertBoutiqueBelongsToAdmin({ role: 'SuperAdmin' }, boutiqueId))
                .resolves.toBeUndefined();
            expect(Boutique.findById).not.toHaveBeenCalled();
        });

        test('autorise le staff sur sa propre boutique', async () => {
            await expect(
                ts.assertBoutiqueBelongsToAdmin(
                    { role: 'Gérant', boutique: { _id: boutiqueId } },
                    boutiqueId
                )
            ).resolves.toBeUndefined();
        });

        test('refuse le staff sur une autre boutique (403)', async () => {
            await expect(
                ts.assertBoutiqueBelongsToAdmin(
                    { role: 'Gérant', boutique: { _id: boutiqueId } },
                    otherBoutiqueId
                )
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        test('lève 404 si la boutique n existe pas', async () => {
            Boutique.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
            await expect(
                ts.assertBoutiqueBelongsToAdmin({ role: 'Admin', _id: adminId }, otherBoutiqueId)
            ).rejects.toMatchObject({ statusCode: 404 });
        });

        test('refuse un Admin qui n est pas propriétaire (403)', async () => {
            Boutique.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: boutiqueId, createur: otherAdminId }) });
            await expect(
                ts.assertBoutiqueBelongsToAdmin({ role: 'Admin', _id: adminId }, boutiqueId)
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        test('autorise un Admin propriétaire de la boutique', async () => {
            Boutique.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: boutiqueId, createur: adminId }) });
            await expect(
                ts.assertBoutiqueBelongsToAdmin({ role: 'Admin', _id: adminId }, boutiqueId)
            ).resolves.toBeUndefined();
        });
    });

    describe('assertArticleInTenant', () => {
        test('lève 404 si pas d article', async () => {
            await expect(ts.assertArticleInTenant({ role: 'Admin' }, null))
                .rejects.toMatchObject({ statusCode: 404 });
        });

        test('ne fait rien pour un SuperAdmin', async () => {
            const article = { boutique: boutiqueId };
            await expect(ts.assertArticleInTenant({ role: 'SuperAdmin' }, article))
                .resolves.toBeUndefined();
        });

        test('utilise la boutique de l article pour la vérification', async () => {
            Boutique.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: boutiqueId, createur: adminId }) });
            const article = { boutique: boutiqueId };
            await expect(
                ts.assertArticleInTenant({ role: 'Admin', _id: adminId }, article)
            ).resolves.toBeUndefined();
            expect(Boutique.findById).toHaveBeenCalledWith(boutiqueId);
        });
    });
});