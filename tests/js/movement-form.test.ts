// Return and transfer forms: per-lot return lines with the over-limit mark, the whole-lot transfer total, and the field a refusal belongs to.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillAllLeft, refusalField, returnLines, transferLots } from '../../resources/js/modules/stock/lib/movement-form.ts';

const drawn = [
    { lot_id: 2, left: 6 },
    { lot_id: 3, left: 4 },
    { lot_id: 5, left: 0 },
];

test('sums the typed quantities and sends only lots with something typed', () => {
    const r = returnLines(drawn, { 3: '3' });
    assert.equal(r.total, 3);
    assert.equal(r.over, false);
    assert.deepEqual(r.payload, [{ lot_id: 3, qty: 3 }]);
});

test('a quantity above what is left marks that lot and blocks the form', () => {
    const r = returnLines(drawn, { 2: '7', 3: '4' });
    assert.equal(r.over, true);
    assert.deepEqual(
        r.lines.map((l) => ({ lot_id: l.lot_id, over: l.over })),
        [
            { lot_id: 2, over: true },
            { lot_id: 3, over: false },
            { lot_id: 5, over: false },
        ],
    );
});

test('nothing typed is a zero total', () => {
    const r = returnLines(drawn, {});
    assert.equal(r.total, 0);
    assert.deepEqual(r.payload, []);
});

test('return everything left fills each lot that still has something out', () => {
    assert.deepEqual(fillAllLeft(drawn), { 2: '6', 3: '4' });
});

const lots = [
    { id: 7, warehouse: 'คลังกลาง IT', qty_remaining: 20, received_at: '2026-09-30 09:00:00' },
    { id: 8, warehouse: 'คลังกลาง IT', qty_remaining: 0, received_at: '2026-08-01 09:00:00' },
    { id: 9, warehouse: 'คลังอาคาร B', qty_remaining: 5, received_at: '2026-07-01 09:00:00' },
    { id: 6, warehouse: 'คลังกลาง IT', qty_remaining: 8, received_at: '2026-10-15 09:00:00' },
];

test('a transfer lists the source warehouse lots that still hold stock, oldest first', () => {
    assert.deepEqual(
        transferLots(lots, 'คลังกลาง IT').map((l) => l.id),
        [7, 6],
    );
    assert.deepEqual(transferLots(lots, ''), []);
});

test('refusal fields fold array entries onto their list field', () => {
    const fail = (errors: Record<string, string[]>) => ({ response: { status: 422, data: { message: 'x', errors } } });
    assert.equal(refusalField(fail({ 'lots.0.qty': ['x'] })), 'lots');
    assert.equal(refusalField(fail({ lot_ids: ['transfer_lot_invalid'] })), 'lot_ids');
    assert.equal(refusalField(fail({ 'serial_ids.1': ['x'] })), 'serial_ids');
    assert.equal(refusalField(fail({ stock_request_id: ['return_request_invalid'] })), 'stock_request_id');
    assert.equal(refusalField({ response: { status: 422, data: { message: 'count_in_progress' } } }), undefined);
    assert.equal(refusalField(new Error('offline')), undefined);
});
