// A Report Center tile opens its report at the filters its number was counted with.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withParams } from '../../resources/js/modules/report/lib/with-params.ts';

test('a tile without filters keeps the plain link', () => {
    assert.equal(withParams('/reports/assets-overview', {}), '/reports/assets-overview');
});

test('filters join a link that has no query yet', () => {
    assert.equal(withParams('/reports/contracts-renewals', { within: '30' }), '/reports/contracts-renewals?within=30');
});

test('filters join after the period range', () => {
    assert.equal(withParams('/reports/x?from=2026-09-01&to=2026-09-30', { within: '30' }), '/reports/x?from=2026-09-01&to=2026-09-30&within=30');
});
