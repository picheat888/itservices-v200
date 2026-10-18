// summaryColumns: report KPI rows leave no empty slot on iPad portrait (2 columns) or landscape (1024px).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summaryColumns } from '../../resources/js/modules/report/components/summary-columns.ts';

test('five tiles: three over two at 1024px, five across from 1280px', () => {
    const classes = summaryColumns(5).split(' ');
    assert.ok(classes.includes('lg:grid-cols-6'));
    assert.ok(classes.includes('xl:grid-cols-5'));
    assert.ok(classes.includes('lg:max-xl:[&>*]:col-span-2'));
    assert.ok(classes.includes('lg:max-xl:[&>:nth-child(n+4)]:col-span-3'));
});

test('an odd last tile spans both columns below 1024px only', () => {
    for (const tiles of [2, 3, 4, 5]) {
        assert.ok(summaryColumns(tiles).split(' ').includes('max-lg:[&>:last-child:nth-child(odd)]:col-span-2'));
    }
});

test('other counts keep their wide-screen columns', () => {
    assert.ok(summaryColumns(2).startsWith('lg:grid-cols-2 '));
    assert.ok(summaryColumns(3).startsWith('lg:grid-cols-3 '));
    assert.ok(summaryColumns(4).startsWith('lg:grid-cols-4 '));
    assert.ok(summaryColumns(7).startsWith('lg:grid-cols-4 '));
});
