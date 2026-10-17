// An item in a draft stock count takes no movement on the counted shelf; the form names the count that holds it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countLockFor } from '../../resources/js/modules/stock/lib/count-lock.ts';

const item = (counting: { reference: string; warehouse: string | null }[]) => ({ counting });

test('a one-warehouse count locks only its own warehouse', () => {
    const held = item([{ reference: 'SC-2026-003', warehouse: 'Main' }]);
    assert.equal(countLockFor(held, ['Main']), 'SC-2026-003');
    assert.equal(countLockFor(held, ['Branch']), null);
    assert.equal(countLockFor(held, ['Branch', 'Main']), 'SC-2026-003');
});

test('an all-warehouse count locks every warehouse', () => {
    assert.equal(countLockFor(item([{ reference: 'SC-2026-004', warehouse: null }]), ['Branch']), 'SC-2026-004');
});

test('no count, or no item yet, locks nothing', () => {
    assert.equal(countLockFor(item([]), ['Main']), null);
    assert.equal(countLockFor(undefined, ['Main']), null);
    assert.equal(countLockFor({}, ['Main']), null);
});
