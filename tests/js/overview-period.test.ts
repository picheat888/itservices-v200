// The Overview period: what a URL means, and the Ticket page's year and 365-day rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overviewPeriodParams, readOverviewPeriod, spanDays, type PeriodOptions } from '../../resources/js/shared/lib/overview-period-core.ts';

const TICKET: PeriodOptions = { allowAll: false, year: true, fallback: 30, maxDays: 365 };

test('other modules keep all time as the default and never see "year"', () => {
    assert.equal(readOverviewPeriod('', '', ''), 'all');
    assert.equal(readOverviewPeriod('year', '', ''), 'all');
    assert.equal(readOverviewPeriod('90', '', ''), 90);
    assert.deepEqual(readOverviewPeriod('custom', '2020-01-01', '2026-01-01'), { from: '2020-01-01', to: '2026-01-01' });
});

test('the Ticket page falls back to 30 days and knows this year', () => {
    assert.equal(readOverviewPeriod('', '', '', TICKET), 30);
    assert.equal(readOverviewPeriod('all', '', '', TICKET), 30);
    assert.equal(readOverviewPeriod('year', '', '', TICKET), 'year');
    assert.equal(readOverviewPeriod('7', '', '', TICKET), 7);
});

test('a custom range counts both ends and stops at 365 days', () => {
    assert.equal(spanDays('2026-10-17', '2026-10-17'), 1);
    assert.equal(spanDays('2025-10-18', '2026-10-17'), 365);
    assert.deepEqual(readOverviewPeriod('custom', '2025-10-18', '2026-10-17', TICKET), { from: '2025-10-18', to: '2026-10-17' });
    assert.equal(readOverviewPeriod('custom', '2025-10-17', '2026-10-17', TICKET), 30);
    assert.equal(readOverviewPeriod('custom', '2026-10-17', '2026-10-01', TICKET), 30);
});

test('this year goes to the API as days=year', () => {
    assert.deepEqual(overviewPeriodParams('year'), { days: 'year' });
    assert.deepEqual(overviewPeriodParams(30), { days: 30 });
    assert.deepEqual(overviewPeriodParams({ from: '2026-01-01', to: '2026-02-01' }), { from: '2026-01-01', to: '2026-02-01' });
});
