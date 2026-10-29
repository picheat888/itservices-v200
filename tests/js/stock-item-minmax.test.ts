// Stock item form: Min and Max start empty, are required, and Max must be at least 1 (STK-11).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const modal = read('modules/stock/components/stock-item-modal.tsx');

test('the empty form leaves Min and Max empty', () => {
    assert.match(modal, /min_stock: null,\s*max_stock: null/);
});

test('both fields are required and use the new placeholders and error words', () => {
    assert.match(modal, /<Field[^>]*label=\{t\('stock_min_stock'\)\}[^>]*required/);
    assert.match(modal, /<Field[^>]*label=\{t\('stock_max_stock'\)\}[^>]*required/);
    for (const key of ['stock_min_ph', 'stock_max_ph', 'stock_min_required', 'stock_max_required', 'stock_max_at_least_one']) {
        assert.ok(modal.includes(`'${key}'`), key);
    }
});

test('Save validation covers empty and a Max below 1', () => {
    assert.match(modal, /form\.min_stock != null/);
    assert.match(modal, /form\.max_stock != null/);
    assert.match(modal, /maxTooLow/);
});

test('the lang files carry the five keys in both languages', () => {
    for (const lang of ['en', 'th']) {
        const file = read(`lang/${lang}/stock.ts`);
        for (const key of ['stock_min_required', 'stock_max_required', 'stock_max_at_least_one', 'stock_min_ph', 'stock_max_ph']) {
            assert.ok(file.includes(`${key}:`), `${lang} ${key}`);
        }
    }
});
