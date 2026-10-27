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

// Sheet draft (edits laid over the saved lines)
import { draftLine, linePatch, parseQty } from '../../resources/js/modules/stock/lib/count-sheet.ts';

const savedLine = (over: Partial<Parameters<typeof draftLine>[0]> = {}) => ({
    sku: 'A',
    name: 'Item A',
    system_qty: 5,
    counted_qty: null as number | null,
    reason: null,
    reason_note: null as string | null,
    track_serial: false,
    missing_serial_ids: [] as number[],
    found_serial_ids: [] as number[],
    ...over,
});

test('typed quantities parse to a capped whole number or nothing', () => {
    assert.equal(parseQty(''), null);
    assert.equal(parseQty('  '), null);
    assert.equal(parseQty('007'), 7);
    assert.equal(parseQty('99999999'), 1_000_000);
});

test('a draft line lays the edits over the saved line', () => {
    const line = savedLine({ counted_qty: 5 });
    assert.equal(draftLine(line, undefined), line);
    const typed = draftLine(line, { qty: '3', reason: 'custom', note: 'dropped' });
    assert.deepEqual([typed.counted_qty, typed.reason, typed.reason_note], [3, 'custom', 'dropped']);
    const serial = draftLine(savedLine({ track_serial: true }), { missing: [1, 2], found: [9] });
    assert.equal(serial.counted_qty, 4);
});

test('the save patch carries only what differs from the saved line', () => {
    const line = savedLine({ counted_qty: 4, reason: 'lost' as never });
    assert.equal(linePatch(line, draftLine(line, { qty: '4' })), null);
    assert.deepEqual(linePatch(line, draftLine(line, { qty: '6', reason: null })), { counted_qty: 6, reason: null, reason_note: null });
    assert.deepEqual(linePatch(line, draftLine(line, { qty: '' })), { counted_qty: null });
    assert.deepEqual(linePatch(line, draftLine(line, { reason: 'custom', note: 'x' })), { reason: 'custom', reason_note: 'x' });
    const serial = savedLine({ track_serial: true, counted_qty: 5 });
    assert.deepEqual(linePatch(serial, draftLine(serial, { missing: [3], found: [] })), { missing_serial_ids: [3], found_serial_ids: [] });
    assert.equal(linePatch(serial, draftLine(serial, { missing: [], found: [] })), null);
});

// Sheet, review and confirmed dialogs (source checks)
const src = (rel: string) => readFileSync(new URL(`../../resources/js/${rel}`, import.meta.url), 'utf8');
const COUNT_DIR = 'modules/stock/components/count/';

test('the counting tab is the list and its wiring only', () => {
    const tab = src('modules/stock/pages/tabs/counting-tab.tsx');
    assert.ok(!tab.includes('stock_count_mode_label'));
    assert.ok(!tab.includes("key: 'adjust_mode'"));
    assert.ok(tab.includes('stock_count_mode_badge_manual'));
    for (const part of ['<CountOpenDialog', '<CountSheetDialog', '<CountDoneDialog']) assert.ok(tab.includes(part), part);
});

test('each count dialog keeps its standard size', () => {
    assert.ok(src(`${COUNT_DIR}count-sheet-dialog.tsx`).includes('focusDialogContentClass'));
    assert.ok(src(`${COUNT_DIR}count-review-dialog.tsx`).includes('<FormDialogContent'));
    assert.ok(src(`${COUNT_DIR}count-done-dialog.tsx`).includes('largeDialogContentClass'));
});

test('the sheet asks for reasons the agreed way', () => {
    const sheet = src(`${COUNT_DIR}count-sheet-dialog.tsx`) + src(`${COUNT_DIR}count-sheet-row.tsx`) + src('modules/stock/lib/count-sheet.ts');
    for (const part of [
        'SHORT_REASONS',
        'OVER_REASONS',
        'reasonAfterQtyChange',
        'lineNeedsReason',
        '<select',
        'rows={2}',
        'useDiscardGuard(',
        'useConfirm(',
        "'no_reason'",
    ]) {
        assert.ok(sheet.includes(part), part);
    }
});

test('the confirmed sheet prints through the PDF link and the KPI cards keep the approved figure style', () => {
    const done = src(`${COUNT_DIR}count-done-dialog.tsx`);
    assert.ok(done.includes('stockCountApi.pdfUrl('));
    assert.ok(done.includes('{!manual && ('), 'a manual sheet has no print button');
    assert.ok(done.includes('target="_blank"'));
    assert.ok(src(`${COUNT_DIR}count-kpi-cards.tsx`).includes('text-xl font-bold tabular-nums'));
});

test('no stock module file says รอบนับ', () => {
    const walk = (dir: URL): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir).pathname],
        );
    for (const file of walk(new URL('../../resources/js/modules/stock/', import.meta.url))) {
        assert.ok(!readFileSync(decodeURIComponent(file.replace(/^\/([A-Za-z]:)/, '$1')), 'utf8').includes('รอบนับ'), file);
    }
});

test('the retired mode words are gone from both languages', () => {
    for (const dict of [th, en]) {
        const left = Object.keys(dict).filter(
            (k) =>
                (k.startsWith('stock_count_mode_') && k !== 'stock_count_mode_badge_manual') ||
                k === 'stock_count_all_wh' ||
                k === 'stock_refusal_count_serial_needs_auto',
        );
        assert.deepEqual(left, []);
    }
});

// Final fix wave: filter snapshot, picked reasons and the qty cap
import { clampQtyText, filterIds, linesByIds } from '../../resources/js/modules/stock/lib/count-sheet.ts';

test('the filter snapshot keeps a row in view while it is being edited', () => {
    const lines = [savedLine({ sku: 'A', system_qty: 5 }), savedLine({ sku: 'B', system_qty: 3, counted_qty: 3 }), savedLine({ sku: 'C', system_qty: 2 })].map(
        (l, i) => ({ ...l, id: i + 1 }),
    );
    const ids = filterIds(lines, 'pending', '');
    assert.deepEqual(ids, [1, 3]);
    // Typing the first digit on a pending row no longer matches the chip, but the snapshot still shows it with the new value
    const edited = lines.map((l) => (l.id === 1 ? draftLine(l, { qty: '1' }) : l));
    assert.deepEqual(filterIds(edited, 'pending', ''), [3]);
    const shown = linesByIds(edited, ids);
    assert.deepEqual(
        shown.map((l) => [l.id, l.counted_qty]),
        [
            [1, 1],
            [3, null],
        ],
    );
    assert.deepEqual(filterIds(lines, 'all', 'item c'), [3]);
});

test('a picked reason survives the qty being retyped', () => {
    const line = savedLine({ system_qty: 10 });
    let edit = { qty: '8', reason: 'lost' as const } as Parameters<typeof draftLine>[1] & object;
    for (const raw of ['', '7']) edit = { ...edit, qty: raw };
    const shown = draftLine(line, edit);
    assert.equal(shown.counted_qty, 7);
    assert.equal(shown.reason, 'lost');
    assert.deepEqual(linePatch(line, shown), { counted_qty: 7, reason: 'lost', reason_note: null });
});

test('a picked reason that no longer fits is sent as null', () => {
    const line = savedLine({ system_qty: 10 });
    const shown = draftLine(line, { qty: '12', reason: 'lost' });
    assert.equal(shown.reason, null);
    assert.deepEqual(linePatch(line, shown), { counted_qty: 12 });
    const saved = savedLine({ system_qty: 10, counted_qty: 8, reason: 'lost' as never });
    assert.deepEqual(linePatch(saved, draftLine(saved, { qty: '12' })), { counted_qty: 12, reason: null, reason_note: null });
    assert.equal(draftLine(saved, { qty: '9' }).reason, 'lost');
});

test('a typed count shows no more than the cap', () => {
    assert.equal(clampQtyText('9999999'), '1000000');
    assert.equal(clampQtyText('1000000'), '1000000');
    assert.equal(clampQtyText('12a'), '12');
    assert.equal(clampQtyText(''), '');
    assert.equal(clampQtyText('007'), '007');
});

test('the sheet stays read only while it saves, and a recount replaces the confirmed sheet', () => {
    const sheet = src(`${COUNT_DIR}count-sheet-dialog.tsx`);
    assert.ok(sheet.includes('<tbody inert={busy !== null}'));
    assert.ok(sheet.includes('read.isError'));
    assert.ok(src('modules/stock/pages/tabs/counting-tab.tsx').includes('onOpenCount={swapSheet}'));
});

test('the serial count button says its count', () => {
    for (const dict of [th, en]) assert.ok(dict.stock_count_tick_serials.includes('{n}'));
    assert.ok(src(`${COUNT_DIR}count-sheet-row.tsx`).includes(".replace('{n}', countedText)"));
});
