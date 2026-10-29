// STK-8 browser eye-check fixes: Thai words keep a space before a warehouse name, and the SKU history tables stay inside a 768 screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stock as th } from '../../resources/js/lang/th/stock.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Thai "อยู่ที่" is followed by a space before the warehouse name', () => {
    assert.equal(th.stock_lot_head_at, 'อยู่ที่ {warehouse}');
    assert.match(th.stock_transfer_note, /อยู่ที่ \{warehouse\}/);
    for (const [key, value] of Object.entries(th)) {
        assert.doesNotMatch(String(value), /อยู่ที่\{/, key);
    }
});

test('the SKU history summary grid lets its wide tables scroll instead of widening the page', () => {
    const summary = read('resources/js/modules/stock/components/history-summary.tsx');
    assert.match(summary, /className="mb-6 grid grid-cols-1 gap-6"/);
});
