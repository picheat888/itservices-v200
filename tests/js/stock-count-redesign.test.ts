// Stock count redesign: the reason words and how a movement's note is chosen from reason and notes.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stock as en } from '../../resources/js/lang/en/stock.ts';
import { stock as th } from '../../resources/js/lang/th/stock.ts';
import { movementNote } from '../../resources/js/modules/stock/lib/movement-note.ts';

const tOf = (dict: Record<string, string>) => ((key: string) => dict[key] ?? key) as never;

test('a non-custom reason shows its translated words', () => {
    assert.equal(movementNote({ reason: 'used', notes: null }, tOf(th)), 'เบิกไปแล้วไม่ได้บันทึก');
    assert.equal(movementNote({ reason: 'lost', notes: 'ignored' }, tOf(en)), 'Lost');
});

test('a custom reason shows the typed notes', () => {
    assert.equal(movementNote({ reason: 'custom', notes: 'Box dropped' }, tOf(th)), 'Box dropped');
});

test('no reason shows the notes as stored', () => {
    assert.equal(movementNote({ reason: null, notes: 'Stock count adjustment' }, tOf(th)), 'Stock count adjustment');
    assert.equal(movementNote({ notes: null }, tOf(th)), null);
});

test('every reason and the found event have words in both languages', () => {
    for (const k of ['lost', 'broken', 'used', 'inbound', 'returned', 'miscount', 'custom']) {
        assert.ok(th[`stock_count_reason_${k}`] && en[`stock_count_reason_${k}`], k);
    }
    assert.equal(th.stock_serial_event_found, 'เจอคืนจากการนับ');
    assert.equal(en.stock_serial_event_found, 'Found in a count');
});

// Count sheet words
const countKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => /^stock_(count|refusal_count)_/.test(k)).sort();

test('th and en have the same count keys', () => {
    assert.deepEqual(countKeys(th), countKeys(en));
});

test('no th lang file says the old count words', () => {
    const dir = new URL('../../resources/js/lang/th/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        const text = readFileSync(new URL(file, dir), 'utf8');
        assert.ok(!text.includes('รอบนับ'), `${file} still says รอบนับ`);
        assert.ok(!text.includes('ตรวจสอบ serial'), `${file} still says ตรวจสอบ serial`);
    }
});

test('the approved Thai count sheet words are exact', () => {
    const expected: Record<string, string> = {
        stock_count_new: 'นับสต็อกใหม่',
        stock_count_start: 'เริ่มนับ ({n} รายการ)',
        stock_count_sheet: 'ใบนับสต็อก',
        stock_count_wh_hint: 'หนึ่งใบนับได้คลังเดียว ยืนยันแล้วยอดจะปรับที่คลังนี้',
        stock_count_freeze_note: 'สินค้า {n} รายการในใบนี้ รับเข้า เบิก หรือย้ายที่{warehouse}ไม่ได้ จนกว่าจะยืนยันหรือยกเลิกใบนับ',
        stock_count_serial_title: 'ตรวจ Serial',
        stock_count_missing_note: 'ขาด {n} ตัว ระบบจะบันทึกตัวที่ไม่ได้ติ๊กว่าหาย',
        stock_count_review_desc: 'กดยืนยันแล้ว ระบบจะปรับยอดที่{warehouse}ตามรายการนี้ทันที',
        stock_count_kpi_sum_short: 'รวม −{n}',
        stock_count_recount: 'นับซ้ำรายการที่ยอดไม่ตรง ({n})',
        stock_refusal_count_reason_missing: '{sku} ยอดไม่ตรงแต่ยังไม่ได้เลือกเหตุผล',
        stock_refusal_count_reason_note_missing: '{sku} เลือก "ระบุเอง" แล้ว ต้องพิมพ์เหตุผล',
        stock_refusal_count_needs_warehouse: 'ใบนับนี้ไม่มีคลัง ยืนยันไม่ได้',
        stock_refusal_count_serial_missing_mismatch: 'Serial ที่ติ๊กไว้ของ {sku} ไม่ตรงกับของในคลังแล้ว เปิดตรวจ Serial ของรายการนี้อีกครั้ง',
    };
    for (const [key, value] of Object.entries(expected)) {
        assert.equal(th[key], value, key);
    }
});

test('refusal words use only placeholders the server sends', () => {
    assert.ok(!th.stock_refusal_count_needs_warehouse.includes('{'));
    assert.ok(!en.stock_refusal_count_needs_warehouse.includes('{'));
    for (const dict of [th, en]) {
        assert.ok(!dict.stock_refusal_count_serial_missing_mismatch.includes('{need}'));
    }
});

// Sheet logic (count-sheet.ts)
import { filterLines, lineNeedsReason, OVER_REASONS, reasonAfterQtyChange, SHORT_REASONS, sheetSummary } from '../../resources/js/modules/stock/lib/count-sheet.ts';

const sheetLine = (sku: string, system_qty: number, counted_qty: number | null, reason: never = null as never, reason_note: string | null = null) => ({
    sku,
    name: `Item ${sku}`,
    system_qty,
    counted_qty,
    reason,
    reason_note,
});

test('a reason is kept only while it still fits the variance', () => {
    assert.equal(reasonAfterQtyChange('lost', 2), null);
    assert.equal(reasonAfterQtyChange('miscount', 2), 'miscount');
    assert.equal(reasonAfterQtyChange('custom', -1), 'custom');
    assert.equal(reasonAfterQtyChange('used', 0), null);
    assert.equal(reasonAfterQtyChange('used', null), null);
    assert.equal(reasonAfterQtyChange('inbound', -1), null);
    assert.equal(reasonAfterQtyChange('used', -1), 'used');
    assert.deepEqual(SHORT_REASONS, ['lost', 'broken', 'used', 'miscount', 'custom']);
    assert.deepEqual(OVER_REASONS, ['inbound', 'returned', 'miscount', 'custom']);
});

test('a differing line needs a reason, a custom one needs a note too', () => {
    assert.equal(lineNeedsReason(sheetLine('A', 5, 3)), true);
    assert.equal(lineNeedsReason(sheetLine('A', 5, 3, 'lost' as never)), false);
    assert.equal(lineNeedsReason(sheetLine('A', 5, 3, 'custom' as never, '   ')), true);
    assert.equal(lineNeedsReason(sheetLine('A', 5, 3, 'custom' as never, 'dropped')), false);
    assert.equal(lineNeedsReason(sheetLine('A', 5, 5)), false);
    assert.equal(lineNeedsReason(sheetLine('A', 5, null)), false);
});

test('the sheet summary counts matches, shorts, overs and the missing reasons', () => {
    const lines = [sheetLine('A', 3, 3), sheetLine('B', 5, 3), sheetLine('C', 1, 2), sheetLine('D', 4, null)];
    const s = sheetSummary(lines);
    assert.deepEqual({ ...s, noReason: undefined }, { total: 4, counted: 3, same: 1, short: 1, over: 1, shortQty: 2, overQty: 1, noReason: undefined });
    assert.equal(s.noReason, 2);
});

test('chips and search narrow the lines', () => {
    const lines = [sheetLine('A', 3, 3), sheetLine('B', 5, 3, 'lost' as never), sheetLine('C', 1, 2), sheetLine('D', 4, null)];
    assert.deepEqual(filterLines(lines, 'no_reason', '').map((l) => l.sku), ['C']);
    assert.deepEqual(filterLines(lines, 'pending', '').map((l) => l.sku), ['D']);
    assert.deepEqual(filterLines(lines, 'short', '').map((l) => l.sku), ['B']);
    assert.deepEqual(filterLines(lines, 'over', '').map((l) => l.sku), ['C']);
    assert.deepEqual(filterLines(lines, 'same', '').map((l) => l.sku), ['A']);
    assert.equal(filterLines(lines, 'all', '').length, 4);
    assert.deepEqual(filterLines(lines, 'all', 'item b').map((l) => l.sku), ['B']);
});
