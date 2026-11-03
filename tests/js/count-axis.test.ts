// Guide lines on the month bar chart: the rounded axis top and its ticks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { countAxis } from '../../resources/js/shared/lib/count-axis.ts';

const root = join(import.meta.dirname, '../../resources/js');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

test('a peak of 9 rounds up to 10 with a line at 5', () => {
    assert.deepEqual(countAxis(9), { top: 10, ticks: [0, 5, 10] });
});

test('small peaks count by one', () => {
    assert.deepEqual(countAxis(1), { top: 1, ticks: [0, 1] });
    assert.deepEqual(countAxis(3), { top: 3, ticks: [0, 1, 2, 3] });
    assert.deepEqual(countAxis(4), { top: 4, ticks: [0, 1, 2, 3, 4] });
});

test('never more than four steps above zero', () => {
    for (const peak of [5, 7, 12, 19, 33, 48, 99, 240, 999, 4321]) {
        const { top, ticks } = countAxis(peak);
        assert.ok(ticks.length - 1 <= 4, `peak ${peak} has ${ticks.length - 1} steps`);
        assert.ok(top >= peak, `peak ${peak} sits above the top ${top}`);
        assert.equal(ticks.at(-1), top);
    }
    assert.deepEqual(countAxis(12), { top: 15, ticks: [0, 5, 10, 15] });
    assert.deepEqual(countAxis(100), { top: 100, ticks: [0, 50, 100] });
});

test('zero or fractional peaks still give a one-step axis', () => {
    assert.deepEqual(countAxis(0), { top: 1, ticks: [0, 1] });
    assert.deepEqual(countAxis(0.4), { top: 1, ticks: [0, 1] });
});

test('only the hiring trend turns guide lines on', () => {
    assert.match(read('modules/employee/components/hires-trend-card.tsx'), /<MonthBarChart[\s\S]*?\bguides\b/);
    assert.doesNotMatch(read('modules/asset/components/asset-activity-card.tsx'), /\bguides\b/);
});
