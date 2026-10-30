// The Report Center's period gives the same days the server counts (ReportSnapshotService::range).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate, periodRange } from '../../resources/js/modules/report/lib/period-range.ts';

const today = new Date(2026, 9, 30, 15, 45);

test('a preset counts back from today, today included', () => {
    assert.deepEqual(periodRange({ period: '7d' }, today), { from: '2026-10-24', to: '2026-10-30' });
    assert.deepEqual(periodRange({ period: '30d' }, today), { from: '2026-10-01', to: '2026-10-30' });
    assert.deepEqual(periodRange({ period: '90d' }, today), { from: '2026-08-02', to: '2026-10-30' });
});

test('a preset crosses the year boundary', () => {
    assert.deepEqual(periodRange({ period: '7d' }, new Date(2027, 0, 3)), { from: '2026-12-28', to: '2027-01-03' });
});

test("custom keeps the reader's own dates", () => {
    assert.deepEqual(periodRange({ period: 'custom', from: '2026-01-01', to: '2026-03-31' }, today), { from: '2026-01-01', to: '2026-03-31' });
});

test('isoDate pads month and day from local time', () => {
    assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
