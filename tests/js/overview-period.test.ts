// The Overview period: what a URL means, the Ticket page's year and 365-day rules, and the words KPI footers use for it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { common as enCommon } from '../../resources/js/lang/en/common.ts';
import { common as thCommon } from '../../resources/js/lang/th/common.ts';
import {
    overviewPeriodParams,
    periodWordKey,
    readOverviewPeriod,
    spanDays,
    type PeriodOptions,
} from '../../resources/js/shared/lib/overview-period-core.ts';

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

const say = (dict: Record<string, string>, period: Parameters<typeof periodWordKey>[0], form: Parameters<typeof periodWordKey>[1]) => {
    const { key, days } = periodWordKey(period, form);
    return days === undefined ? dict[key] : dict[key].replace('{n}', String(days));
};

test('KPI footers name the period the way the approved table reads', () => {
    assert.equal(say(thCommon, 30, 'within'), 'ใน 30 วัน');
    assert.equal(say(thCommon, 7, 'recent'), 'ใน 7 วันล่าสุด');
    assert.equal(say(thCommon, 90, 'versus'), 'เทียบ 90 วันก่อน');
    assert.equal(say(thCommon, 'year', 'within'), 'ปีนี้');
    assert.equal(say(thCommon, 'all', 'within'), 'ตั้งแต่ต้น');
    assert.equal(say(thCommon, { from: '2026-10-01', to: '2026-10-15' }, 'recent'), 'ในช่วงที่เลือก');
    assert.equal(say(thCommon, 'year', 'versus'), 'เทียบช่วงก่อนหน้า');
    assert.equal(say(thCommon, { from: '2026-10-01', to: '2026-10-15' }, 'versus'), 'เทียบช่วงก่อนหน้า');
});

test('every period word exists in both languages', () => {
    const periods = [7, 'year', 'all', { from: '2026-10-01', to: '2026-10-15' }] as const;
    for (const period of periods) {
        for (const form of ['within', 'recent', 'versus'] as const) {
            const { key } = periodWordKey(period, form);
            assert.ok(thCommon[key], `th ${key}`);
            assert.ok(enCommon[key], `en ${key}`);
        }
    }
    for (const key of ['period_now', 'period_now_only']) {
        assert.ok(thCommon[key] && enCommon[key], key);
    }
});
