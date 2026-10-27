// Stock count redesign: the reason words and how a movement's note is chosen from reason and notes.
import assert from 'node:assert/strict';
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
