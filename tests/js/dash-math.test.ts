// Dashboard pure figures: bar shares and the chart axis.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { niceAxis, sharePieces } from '../../resources/js/modules/dashboard/lib/dash-math.ts';

test('shares are percents of the sum, zero pieces dropped', () => {
    assert.deepEqual(
        sharePieces([
            { key: 'a', value: 3, className: 'x' },
            { key: 'b', value: 0, className: 'y' },
            { key: 'c', value: 1, className: 'z' },
        ]),
        [
            { key: 'a', percent: 75, className: 'x' },
            { key: 'c', percent: 25, className: 'z' },
        ],
    );
});

test('nothing to draw when every value is zero', () => {
    assert.deepEqual(sharePieces([{ key: 'a', value: 0, className: 'x' }]), []);
});

test('the axis tops out on a round step of whole cases', () => {
    assert.deepEqual(niceAxis(17), { top: 20, ticks: [0, 5, 10, 15, 20] });
    assert.deepEqual(niceAxis(3), { top: 4, ticks: [0, 1, 2, 3, 4] });
    assert.deepEqual(niceAxis(130), { top: 200, ticks: [0, 50, 100, 150, 200] });
    assert.deepEqual(niceAxis(0), { top: 4, ticks: [0, 1, 2, 3, 4] });
});
