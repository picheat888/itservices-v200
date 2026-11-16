// UAT STK-21-01: each SKU-history table on screen ends with a totals row ("รวม" under the quantity), as the PDF does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stock as th } from '../../resources/js/lang/th/stock.ts';

const page = readFileSync(join(import.meta.dirname, '../../resources/js/modules/stock/pages/item-history.tsx'), 'utf8');

test('every view hands the table a totals row under its quantity column', () => {
    assert.match(page, /total=\{\{ label: t\('stock_mv_total'\), column: headers\.indexOf\(t\('stock_qty'\)\), value: totalText \}\}/);
    assert.equal((page.match(/t\('stock_qty'\),/g) || []).length, 5, 'each of the five views has the quantity column');
    assert.equal(th.stock_mv_total, 'รวม');
});

test('the count & adjust view signs its rows and its total, so the total adds up', () => {
    assert.match(page, /const signed = view === 'adjust';/);
    assert.match(page, /signed && m\.type === 'adjust_down' \? -m\.qty : m\.qty/);
    assert.match(page, /signed \? `\$\{total >= 0 \? '\+' : '−'\}\$\{fmtN\(Math\.abs\(total\)\)\}` : fmtN\(total\)/);
});

test('the table draws the totals row only when it has rows, styled like the summary totals', () => {
    const table = page.slice(page.indexOf('function Table('));
    assert.match(table, /\{total && rows\.length > 0 && \(/);
    assert.match(table, /className="border-border bg-muted\/40 border-t font-semibold"/);
});
