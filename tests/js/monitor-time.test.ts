// Monitor TV time words: spans, over/left, waited, and the server-clock offset.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitor as en } from '../../resources/js/lang/en/monitor.ts';
import { monitor as th } from '../../resources/js/lang/th/monitor.ts';
import { dueWords, serverNow, spanWords, waitedWords } from '../../resources/js/modules/monitor/lib/monitor-time.ts';

const t = (key: string) => th[key];
const MIN = 60_000;

test('spans read in minutes, then hours, then days', () => {
    assert.equal(spanWords(12 * MIN, t), '12 น.');
    assert.equal(spanWords(72 * MIN, t), '1 ชม. 12 น.');
    assert.equal(spanWords(120 * MIN, t), '2 ชม.');
    assert.equal(spanWords(27 * 60 * MIN, t), '1 วัน 3 ชม.');
    assert.equal(spanWords(48 * 60 * MIN + 30 * MIN, t), '2 วัน');
    assert.equal(spanWords(-38 * MIN, t), '38 น.');
});

test('a deadline reads as over or left', () => {
    const now = Date.UTC(2026, 0, 14, 5, 0, 0);
    assert.equal(dueWords(now - 38 * MIN, now, t), 'เกิน 38 น.');
    assert.equal(dueWords(now + 25 * MIN + 30_000, now, t), 'เหลือ 25 น.');
});

test('a case under a minute old has just come in', () => {
    assert.equal(waitedWords(30_000, t), 'เพิ่งเข้ามา');
    assert.equal(waitedWords(6 * MIN, t), 'รอมา 6 น.');
});

test('the screen counts from server time', () => {
    assert.equal(serverNow(5000, 1000), 6000);
    assert.equal(serverNow(-2000, 10_000), 8000);
});

test('both languages carry every monitor word', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(th).sort());
    assert.equal(
        spanWords(72 * MIN, (key) => en[key]),
        '1 h 12 min',
    );
});
