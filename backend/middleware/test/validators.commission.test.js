/**
 * @file middleware/test/validators.commission.test.js
 * @description Unit tests for validateCommission (async, uses Client)
 */

const { validateCommission } = require('../validators');
const Client = require('../../models/Client');

jest.mock('../../models/Client');

function makeReq(body) {
    return { body, path: '/api/test', method: 'POST' };
}

function makeRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('Middleware : validateCommission', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('refuse si workerId est manquant', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateCommission(makeReq({ montant: 50 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si montant est manquant ou invalide', async () => {
        const next = jest.fn();
        const res = makeRes();
        await validateCommission(makeReq({ workerId: 'w1', montant: -3 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('refuse si montant dépasse la commission due', async () => {
        Client.findById.mockResolvedValue({ _id: 'w1', type: 'Ouvrier', commission: 100 });
        const next = jest.fn();
        const res = makeRes();
        await validateCommission(makeReq({ workerId: 'w1', montant: 200 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('accepte si le montant ne dépasse pas la commission', async () => {
        Client.findById.mockResolvedValue({ _id: 'w1', type: 'Ouvrier', commission: 100 });
        const next = jest.fn();
        const res = makeRes();
        await validateCommission(makeReq({ workerId: 'w1', montant: 50 }), res, next);
        expect(Client.findById).toHaveBeenCalledWith('w1');
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('refuse si l ouvrier est introuvable ou mauvais type', async () => {
        Client.findById.mockResolvedValue(null);
        const next = jest.fn();
        const res = makeRes();
        await validateCommission(makeReq({ workerId: 'w1', montant: 50 }), res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });
});