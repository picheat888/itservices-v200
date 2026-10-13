// How often a bar chart labels its bars so the labels never overlap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelStep } from '../../resources/js/modules/report/components/axis-labels.ts';

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
