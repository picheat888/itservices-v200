// A report's cards and tiles are asked without the filters that narrow only its rows; saved files count only the filters that narrow.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { narrowedFilterCount, VIEW_KEYS, withoutFilters } from '../../resources/js/modules/report/lib/filter-scope.ts';

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

test('counts only filters that narrow the rows', () => {
    const filters = {
        from: '2026-01-01',
        to: '2026-10-30',
        as_of: '2026-10-30',
        department_id: 4,
        status: ['open'],
        search: '',
        tag: [],
        owner: null,
    };
    assert.equal(narrowedFilterCount(filters), 2);
});

test('view settings saved with a file are not filters', () => {
    const filters = { by: 'owner', people_by: 'qty', dept_by: 'value', dead_days: 180, closed: 'year', sort: 'resource', category_id: 2 };
    assert.equal(narrowedFilterCount(filters), 1);
});

test('VIEW_KEYS lists every viewOnly filter the server reports declare', () => {
    const declared = new Set<string>();
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name.endsWith('.php')) {
                for (const match of readFileSync(path, 'utf8').matchAll(/ReportFilter::\w+\('(\w+)'[^;\n]*->viewOnly\(\)/g)) declared.add(match[1]);
            }
        }
    };
    walk('app/Services/Report');
    assert.ok(declared.size > 0);
    assert.deepEqual([...declared].sort(), [...VIEW_KEYS].sort());
});
