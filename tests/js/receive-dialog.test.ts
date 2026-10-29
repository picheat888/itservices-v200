// The receive dialog (option B): one fixed height, a two-by-two top, one work area, a summary beside the press and errors beside the fields.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const drawer = read('resources/js/modules/stock/components/movement-drawer.tsx');
const en = read('resources/js/lang/en/stock.ts');
const th = read('resources/js/lang/th/stock.ts');

test('the form and the receipt share one fixed height, so the frame never jumps between steps', () => {
    const frames = drawer.match(/<FormDialogContent className=\{detailDialogHeightClass\}/g) ?? [];
    assert.equal(frames.length, 2);
});

test('the header no longer repeats the item name, so picking an item does not push the form down', () => {
    assert.doesNotMatch(drawer, /subtitle=\{selected/);
    assert.match(drawer, /isSerial \? t\('stock_serialized'\) : t\('stock_qty_only'\)/);
    assert.doesNotMatch(drawer, /<ShieldCheck/);
});

test('reference, supplier, warehouse and unit cost sit two by two; the work area waits for an item', () => {
    assert.match(drawer, /<div className="grid grid-cols-2 gap-3">\s*<Field name="reference"/);
    for (const name of ['reference', 'supplier', 'to', 'unit_cost']) {
        assert.match(drawer, new RegExp(`<Field name="${name}"[^>]*error=\\{receiveErrors\\.${name}\\}`), name);
    }
    assert.match(drawer, /title=\{t\('stock_receive_area_empty'\)\}/);
});

test('the press stays enabled for a receive; a press with gaps marks them, shakes the banner and focuses the first', () => {
    assert.match(drawer, /disabled=\{!saved && \(\(!isReceive && !canSubmit\) \|\| countedBy !== null\)\}/);
    assert.match(drawer, /setTried\(true\);\s*setTryCount\(\(n\) => n \+ 1\);\s*focusFirstError\(missing/);
    assert.match(drawer, /<FormErrorBanner message=\{t\('stock_receive_missing'\).*shakeKey=\{tryCount\}/);
});

test('missing fields are checked in screen order, so focus lands on the first one shown', () => {
    const order = ['sku', 'reference', 'supplier', 'to', 'unit_cost', 'qty', 'serials'];
    const at = order.map((f) => drawer.indexOf(`missing.${f} =`));
    assert.ok(
        at.every((i) => i > 0),
        'every field is checked',
    );
    assert.deepEqual(
        [...at].sort((a, b) => a - b),
        at,
    );
});

test('the serial list takes the room left and is the only thing that scrolls', () => {
    assert.match(drawer, /<div data-field="serials" className="flex min-h-56 flex-1 flex-col gap-2.5">/);
    assert.match(drawer, /min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-1/);
    assert.doesNotMatch(drawer, /max-h-56 space-y-1.5 overflow-y-auto/);
});

test('quantity has 40px steppers, the footer says what the press will do, and notes wait behind a link', () => {
    assert.match(drawer, /aria-label=\{t\('stock_qty_less'\)\}/);
    assert.match(drawer, /aria-label=\{t\('stock_qty_more'\)\}/);
    assert.match(drawer, /t\('stock_receive_into'\)\.replace\('\{warehouse\}', to\)/);
    assert.match(drawer, /aria-live="polite" className="text-muted-foreground mr-auto line-clamp-2/);
    assert.match(drawer, /t\('stock_add_note'\)/);
});

test('the receipt centres in the fixed frame', () => {
    assert.match(drawer, /<DialogBody className="flex flex-col space-y-0">\s*\{\/\*[^*]*\*\/\}\s*<div className="my-auto space-y-4">/);
});

test('both languages carry the new words and the example placeholder ends with an ellipsis', () => {
    for (const key of ['stock_receive_submit', 'stock_receive_missing', 'stock_receive_summary_empty', 'stock_add_note', 'stock_qty_more']) {
        assert.match(en, new RegExp(`${key}:`), `en ${key}`);
        assert.match(th, new RegExp(`${key}:`), `th ${key}`);
    }
    assert.match(th, /stock_reference_ph: 'เช่น PO-2026-118 หรือ REQ-12…'/);
    assert.match(en, /stock_reference_ph: 'e\.g\. PO-2026-118 or REQ-12…'/);
    assert.match(th, /stock_receive_submit: 'รับเข้า \(\{n\}\)'/);
});
