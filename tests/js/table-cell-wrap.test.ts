// Table cells wrap text too long for them instead of spilling into the next column; only values of a known width stay on one line.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');

test('a data cell breaks a long word rather than spill over its border', () => {
    assert.match(read('shared/components/data-table.tsx'), /'px-\[var\(--row-px\)\] py-\[var\(--row-py\)\] \[overflow-wrap:anywhere\]'/);
});
