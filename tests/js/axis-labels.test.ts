// How often a bar chart labels its bars so the labels never overlap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitAxisFont, labelStep, weekDays } from '../../resources/js/modules/report/components/axis-labels.ts';

test('short labels in wide slots label every bar', () => {
    assert.equal(labelStep(['16/7', '20/7', '27/7'], 60), 1);
});

test('a label wider than its slot skips bars until it fits', () => {
    // 14 weeks over 566 units: about 40 units a slot, and "16 ก.ค." needs about 45 with its gap.
    const labels = Array.from({ length: 14 }, () => '16 ก.ค.');
    assert.equal(labelStep(labels, 566 / 14), 2);
});

test('long labels in narrow slots skip more', () => {
    assert.equal(labelStep(['16 กรกฎาคม'], 20), 4);
});

test('no labels or no room still gives a usable step', () => {
    assert.equal(labelStep([], 40), 1);
    assert.equal(labelStep(['16 ก.ค.'], 0), 1);
});

test('a week cut by the range start counts from the range start', () => {
    assert.deepEqual(weekDays('2026-09-14', '2026-09-17', '2026-10-21'), { start: '2026-09-17', end: '2026-09-20', days: '17–20' });
});

test('a whole week runs Monday to Sunday, across a month end too', () => {
    assert.deepEqual(weekDays('2026-09-28', '2026-09-17', '2026-10-21'), { start: '2026-09-28', end: '2026-10-04', days: '28–4' });
});

test('a week cut by the range end stops at the range end', () => {
    assert.deepEqual(weekDays('2026-10-19', '2026-09-17', '2026-10-21'), { start: '2026-10-19', end: '2026-10-21', days: '19–21' });
});

test('a one-day week shows one day', () => {
    assert.deepEqual(weekDays('2026-10-12', '2026-10-13', '2026-10-13'), { start: '2026-10-13', end: '2026-10-13', days: '13' });
});

test('labels that fit keep the full axis font', () => {
    assert.equal(fitAxisFont(['21–27'], 566 / 6), 10.5);
    assert.equal(fitAxisFont([], 40), 10.5);
});

test('denser bars shrink the font until the labels fit', () => {
    // 18 weeks: about 31 units a slot, too tight for "17–20" at 10.5.
    const size = fitAxisFont(['17–20'], 566 / 18);
    assert.ok(size < 10.5 && size > 8, `got ${size}`);
    assert.equal(labelStep(['17–20'], 566 / 18, size), 1);
});

test('the font never shrinks past its floor; labels skip bars from there', () => {
    const size = fitAxisFont(['17–20'], 566 / 53);
    assert.equal(size, 8);
    assert.equal(labelStep(['17–20'], 566 / 53, size), 3);
});
