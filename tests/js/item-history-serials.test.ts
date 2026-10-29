// Item history matches serial events to a movement row by movement id first, document only when the id is null.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../../resources/js/modules/stock/pages/item-history.tsx', import.meta.url), 'utf8');

test('a serial event is matched on its movement id', () => {
    assert.match(page, /e\.stock_movement_id === m\.id/);
});

test('the document and reference fallback applies only when the id is null', () => {
    assert.match(page, /e\.stock_movement_id == null/);
    assert.match(page, /e\.doc_no === m\.doc_no/);
});
