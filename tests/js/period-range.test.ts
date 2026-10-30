// The Report Center's period gives the same days the server counts (ReportSnapshotService::range).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isoDate, MAX_RANGE_DAYS, periodRange, rangeDays } from '../../resources/js/modules/report/lib/period-range.ts';

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

test('rangeDays counts both ends, across a leap day', () => {
    assert.equal(rangeDays('2026-10-30', '2026-10-30'), 1);
    assert.equal(rangeDays('2025-09-25', '2026-09-25'), 366);
    assert.equal(rangeDays('2027-03-01', '2028-02-29'), 366);
});

test('the cap matches the Ticket & SLA report the tiles open', () => {
    const php = readFileSync('app/Http/Requests/Report/TicketOverviewReportRequest.php', 'utf8');
    assert.equal(Number(php.match(/MAX_RANGE_DAYS = (\d+);/)?.[1]), MAX_RANGE_DAYS);
});

test('the Report Center picker passes the cap to the calendar', () => {
    const source = readFileSync('resources/js/modules/report/components/period-switch.tsx', 'utf8');
    assert.match(source, /maxDays=\{MAX_RANGE_DAYS\}/);
    assert.match(source, /tooLongText=\{t\('rep_err_range_invalid'\)\}/);
});
