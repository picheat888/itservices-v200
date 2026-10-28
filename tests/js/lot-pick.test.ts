// Lot pick preview: oldest lots of the chosen warehouse first, whole-lot flag when a lot is taken out entirely.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickLots } from '../../resources/js/modules/stock/lib/lot-pick.ts';

const fixture = [
    { lot_id: 3, lot_no: 'LOT-20260930-0001', warehouse: 'คลังกลาง IT', received_at: '2026-09-30 09:10:00', remaining: 21 },
    { lot_id: 2, lot_no: 'LOT-20260812-0003', warehouse: 'คลังกลาง IT', received_at: '2026-08-12 09:00:00', remaining: 6 },
    { lot_id: 4, lot_no: 'LOT-20261028-0002', warehouse: 'คลังอาคาร B', received_at: '2026-01-01 09:00:00', remaining: 10 },
];

test('takes the oldest lot first and marks a lot taken whole', () => {
    const picks = pickLots(fixture, 'คลังกลาง IT', 10);
    assert.deepEqual(
        picks.map((p) => ({ lot_no: p.lot_no, take: p.take, whole: p.whole })),
        [
            { lot_no: 'LOT-20260812-0003', take: 6, whole: true },
            { lot_no: 'LOT-20260930-0001', take: 4, whole: false },
        ],
    );
});

test('never picks a lot of another warehouse', () => {
    const picks = pickLots(fixture, 'คลังอาคาร B', 5);
    assert.deepEqual(picks.map((p) => p.lot_no), ['LOT-20261028-0002']);
    assert.equal(pickLots(fixture, 'คลังกลาง IT', 100).every((p) => p.lot_no !== 'LOT-20261028-0002'), true);
});

test('quantity 0 picks nothing', () => {
    assert.deepEqual(pickLots(fixture, 'คลังกลาง IT', 0), []);
});

test('stops when the warehouse runs out and breaks date ties by lot id', () => {
    const tied = [
        { lot_id: 9, lot_no: 'B', warehouse: 'W', received_at: '2026-01-01', remaining: 2 },
        { lot_id: 8, lot_no: 'A', warehouse: 'W', received_at: '2026-01-01', remaining: 2 },
    ];
    assert.deepEqual(pickLots(tied, 'W', 9).map((p) => [p.lot_no, p.take]), [['A', 2], ['B', 2]]);
});
