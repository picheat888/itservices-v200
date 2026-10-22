// Fulfil dialog allocation: greedy fill from the largest warehouse, refilled from fresh balances only while the user has not changed it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greedyAlloc, refillAlloc } from '../../resources/js/modules/stock/lib/fulfil-alloc.ts';

test('the fill takes from the largest warehouse first', () => {
    assert.deepEqual(
        greedyAlloc(
            [
                { warehouse: 'A', qty: 3 },
                { warehouse: 'B', qty: 7 },
            ],
            5,
        ),
        { B: 5 },
    );
    assert.deepEqual(
        greedyAlloc(
            [
                { warehouse: 'A', qty: 3 },
                { warehouse: 'B', qty: 4 },
            ],
            5,
        ),
        { B: 4, A: 1 },
    );
    assert.deepEqual(greedyAlloc([{ warehouse: 'A', qty: 0 }], 2), {});
});

test('fresh balances refill an allocation the user has not changed', () => {
    const seed = { A: 5 };
    assert.deepEqual(
        refillAlloc(
            { A: 5 },
            seed,
            [
                { warehouse: 'A', qty: 3 },
                { warehouse: 'B', qty: 7 },
            ],
            5,
        ),
        { B: 5 },
    );
});

test('an allocation the user changed is kept', () => {
    assert.equal(
        refillAlloc(
            { A: 2, B: 3 },
            { A: 5 },
            [
                { warehouse: 'A', qty: 3 },
                { warehouse: 'B', qty: 7 },
            ],
            5,
        ),
        null,
    );
});

test('nothing to do when the fresh fill is the same', () => {
    assert.equal(refillAlloc({ A: 5 }, { A: 5 }, [{ warehouse: 'A', qty: 9 }], 5), null);
});
