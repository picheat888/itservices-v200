// How often a bar chart labels its bars so the labels never overlap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { edgeTicks, labelStep } from '../../resources/js/modules/report/components/axis-labels.ts';

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

test('edge ticks label every edge when each fits', () => {
    assert.deepEqual(edgeTicks(6, 1), [0, 1, 2, 3, 4, 5, 6]);
});

test('edge ticks always keep the start and the end of the range', () => {
    assert.deepEqual(edgeTicks(14, 2), [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('an edge too close to the end gives way to the end', () => {
    assert.deepEqual(edgeTicks(13, 2), [0, 2, 4, 6, 8, 10, 13]);
});

test('a range narrower than one step keeps only its start', () => {
    assert.deepEqual(edgeTicks(1, 2), [0]);
    assert.deepEqual(edgeTicks(0, 1), []);
});
