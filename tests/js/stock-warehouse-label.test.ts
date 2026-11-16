// UAT STK-07-03: stock not yet placed in a warehouse reads "ยังไม่ระบุคลัง" wherever a lot's warehouse is shown, never the sentinel "Unassigned".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stock as th } from '../../resources/js/lang/th/stock.ts';
import { UNASSIGNED_WAREHOUSE, warehouseLabel } from '../../resources/js/modules/stock/lib/warehouse-label.ts';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js/modules/stock', rel), 'utf8');

test("the sentinel reads in the reader's words and a real warehouse keeps its name", () => {
    assert.equal(UNASSIGNED_WAREHOUSE, 'Unassigned');
    assert.equal(warehouseLabel('Unassigned', th.stock_lot_unassigned), 'ยังไม่ระบุคลัง');
    assert.equal(warehouseLabel('คลังโรงงาน 1', th.stock_lot_unassigned), 'คลังโรงงาน 1');
});

test('the return form and the request detail both use it', () => {
    assert.match(read('components/return-request-fields.tsx'), /\{warehouseLabel\(lot\.warehouse, t\('stock_lot_unassigned'\)\)\}/);
    assert.doesNotMatch(read('components/return-request-fields.tsx'), /<td className=\{CELL\}>\{lot\.warehouse\}<\/td>/);
    const detail = read('components/request-detail-dialog.tsx');
    assert.match(detail, /warehouseLabel\(/);
    assert.doesNotMatch(detail, /const UNASSIGNED = 'Unassigned';/);
});
