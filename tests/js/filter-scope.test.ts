// A report's cards and tiles are asked without the filters that narrow only its rows (a search they ignore).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutFilters } from '../../resources/js/modules/report/lib/filter-scope.ts';

test('drops the named filters and keeps the rest', () => {
    const filters = { from: '2026-01-01', to: '2026-10-18', search: 'notebook', state: 'active' };
    assert.deepEqual(withoutFilters(filters, ['search']), { from: '2026-01-01', to: '2026-10-18', state: 'active' });
    assert.deepEqual(withoutFilters(filters, ['search', 'state']), { from: '2026-01-01', to: '2026-10-18' });
});

test('typing a search leaves the cards scope unchanged', () => {
    const before = withoutFilters({ from: '2026-01-01' }, ['search']);
    const after = withoutFilters({ from: '2026-01-01', search: 'a b' }, ['search']);
    assert.deepEqual(after, before);
});

test('no names returns the same filters object', () => {
    const filters = { from: '2026-01-01', search: 'x' };
    assert.equal(withoutFilters(filters, []), filters);
});
