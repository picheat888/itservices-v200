// useTableFitsWidth: measures only after the table swaps, and observes border-box sizes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('resources/js/shared/hooks/use-table-fits-width.ts', 'utf8');

test('follow() returns early when the table did not change', () => {
    assert.match(source, /if \(current === table\) return;/);
});

test('sizes are observed as border-box', () => {
    assert.match(source, /box: 'border-box'/);
});
