// Holiday text parser, month summary, fixed-date copy and row validation helpers for the SLA holiday editor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { settings as en } from '../../resources/js/lang/en/settings.ts';
import { settings as th } from '../../resources/js/lang/th/settings.ts';
import {
    fixedDateRows,
    HOLIDAYS_PER_YEAR_MAX,
    holidayYears,
    isoWeekday,
    localIsoDate,
    monthSummary,
    parseHolidayLine,
    parseHolidayText,
    rowErrors,
    serverRowErrors,
    tooManyHolidays,
} from '../../resources/js/modules/settings/lib/sla-holidays.ts';

const SEED_2026 = [
    ['2026-01-01', 'วันขึ้นปีใหม่'],
    ['2026-04-06', 'วันจักรี'],
    ['2026-04-13', 'วันสงกรานต์'],
    ['2026-04-14', 'วันสงกรานต์'],
    ['2026-04-15', 'วันสงกรานต์'],
    ['2026-05-01', 'วันแรงงานแห่งชาติ'],
    ['2026-05-04', 'วันฉัตรมงคล'],
    ['2026-06-03', 'วันเฉลิมพระชนมพรรษาพระราชินี'],
    ['2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
    ['2026-08-12', 'วันแม่แห่งชาติ'],
    ['2026-10-13', 'วันนวมินทรมหาราช'],
    ['2026-10-23', 'วันปิยมหาราช'],
    ['2026-12-05', 'วันพ่อแห่งชาติ'],
    ['2026-12-07', 'ชดเชยวันพ่อแห่งชาติ'],
    ['2026-12-31', 'วันสิ้นปี'],
].map(([date, name]) => ({ date, name }));

test('parseHolidayLine reads the supported date formats', () => {
    assert.deepEqual(parseHolidayLine('1/1/2570 วันขึ้นปีใหม่', 2027), { date: '2027-01-01', name: 'วันขึ้นปีใหม่' });
    assert.deepEqual(parseHolidayLine('6 เม.ย. 2027 วันจักรี', 2027), { date: '2027-04-06', name: 'วันจักรี' });
    assert.deepEqual(parseHolidayLine('1 พฤษภาคม 2570 วันแรงงานแห่งชาติ', 2027), {
        date: '2027-05-01',
        name: 'วันแรงงานแห่งชาติ',
    });
    assert.deepEqual(parseHolidayLine('2027-12-31, วันสิ้นปี', 2027), { date: '2027-12-31', name: 'วันสิ้นปี' });
});

test('parseHolidayLine trims tabs and carriage returns from Excel lines', () => {
    assert.deepEqual(parseHolidayLine('  13/04/2027\tวันสงกรานต์\r', 2027), { date: '2027-04-13', name: 'วันสงกรานต์' });
});

test('parseHolidayLine reports why a line cannot be read', () => {
    assert.deepEqual(parseHolidayLine('วันวิสาขบูชา', 2027), { error: 'no_date' });
    assert.deepEqual(parseHolidayLine('31/02/2027 ผิด', 2027), { error: 'bad_date' });
    assert.deepEqual(parseHolidayLine('1/1/2027', 2027), { error: 'no_name' });
    assert.deepEqual(parseHolidayLine('25/10/2026 ชดเชย', 2027), { error: 'other_year', found: 2026 });
});

test('parseHolidayText counts duplicates and keeps bad lines with their number', () => {
    const text = ['1/1/2027 วันขึ้นปีใหม่', '', 'วันวิสาขบูชา', '6/4/2027 วันจักรี', '6/4/2027 วันจักรี', '2/2/2027 มีแล้ว'].join('\r\n');
    const result = parseHolidayText(text, 2027, ['2027-02-02']);
    assert.deepEqual(result.ok, [
        { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
        { date: '2027-04-06', name: 'วันจักรี' },
    ]);
    assert.deepEqual(result.bad, [{ line: 3, text: 'วันวิสาขบูชา', error: 'no_date' }]);
    assert.equal(result.duplicates, 2);
});

test('monthSummary merges consecutive same-name days and tags the next one', () => {
    const months = monthSummary(SEED_2026, '2026-12-01');
    const april = months.find((m) => m.month === 4);
    assert.deepEqual(april?.items, [
        { from: 6, to: 6, name: 'วันจักรี', past: true, next: false },
        { from: 13, to: 15, name: 'วันสงกรานต์', past: true, next: false },
    ]);
    const december = months.find((m) => m.month === 12);
    assert.equal(december?.items[0].next, true);
    assert.equal(december?.items[0].past, false);
    assert.equal(december?.items.filter((i) => i.next).length, 1);
    assert.equal(months.flatMap((m) => m.items).filter((i) => i.next).length, 1);
});

test('fixedDateRows copies only fixed month-days into the new year', () => {
    const rows = fixedDateRows(SEED_2026, 2027);
    assert.equal(rows.length, 14);
    assert.ok(!rows.some((r) => r.date === '2027-12-07'));
    assert.deepEqual(rows[0], { date: '2027-01-01', name: 'วันขึ้นปีใหม่' });
});

test('rowErrors flags blank name, blank date, other year and the second equal date', () => {
    const errors = rowErrors(
        [
            { key: 'a', date: '', name: 'x' },
            { key: 'b', date: '2027-01-01', name: '  ' },
            { key: 'c', date: '2026-10-25', name: 'y' },
            { key: 'd', date: '2027-02-02', name: 'z' },
            { key: 'e', date: '2027-02-02', name: 'z' },
            { key: 'f', date: '2027-03-03', name: 'ok' },
        ],
        2027,
    );
    assert.deepEqual(errors, {
        a: { date: 'required' },
        b: { name: 'required' },
        c: { date: 'other_year' },
        e: { date: 'taken' },
    });
});

test('rowErrors says a name over 100 characters is too long, not missing', () => {
    const errors = rowErrors(
        [
            { key: 'a', date: '2027-01-01', name: 'ก'.repeat(100) },
            { key: 'b', date: '2027-01-02', name: 'ก'.repeat(101) },
        ],
        2027,
    );
    assert.deepEqual(errors, { b: { name: 'too_long' } });
    assert.deepEqual(serverRowErrors({ 'holidays.0.name': ['holiday_name_too_long'] }, ['a']), { a: { name: 'too_long' } });
});

test('localIsoDate and isoWeekday read the calendar date without a time zone shift', () => {
    assert.equal(localIsoDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
    assert.equal(isoWeekday('2026-01-05'), 1);
    assert.equal(isoWeekday('2026-01-04'), 7);
    assert.equal(isoWeekday('2026-01-10'), 6);
});

test('holidayYears offers earlier years with rows, this year and next year', () => {
    assert.deepEqual(holidayYears([], 2026), [2026, 2027]);
    assert.deepEqual(holidayYears(['2024-01-01', '2025-04-13', '2025-05-01', '2026-01-01', '2028-01-01'], 2026), [2024, 2025, 2026, 2027]);
});

test('serverRowErrors maps 422 codes to the rows sent, by position', () => {
    const errors = {
        'holidays.0.date': ['holiday_date_taken'],
        'holidays.1.date': ['holiday_date_other_year'],
        'holidays.1.name': ['holiday_name_required'],
        'holidays.2.date': ['holiday_date_required'],
        'holidays.9.date': ['holiday_date_taken'],
        'holidays.0.name': ['something_else'],
        holidays: ['The holidays field must not have more than 60 items.'],
    };
    assert.deepEqual(serverRowErrors(errors, ['a', 'b', 'c']), {
        a: { date: 'taken' },
        b: { date: 'other_year', name: 'required' },
        c: { date: 'required' },
    });
});

test('tooManyHolidays reads the year-wide refusal that no row carries', () => {
    assert.equal(tooManyHolidays({ holidays: ['holiday_too_many'] }), true);
    assert.equal(tooManyHolidays({ 'holidays.0.date': ['holiday_date_taken'] }), false);
    assert.equal(tooManyHolidays({}), false);
});

test('the editor names the year cap in both languages and the save refreshes the SLA figures elsewhere', () => {
    const editor = readFileSync(new URL('../../resources/js/modules/settings/components/sla-holiday-editor-dialog.tsx', import.meta.url), 'utf8');
    const hooks = readFileSync(new URL('../../resources/js/modules/settings/hooks/use-settings.ts', import.meta.url), 'utf8');
    assert.match(editor, /tooManyHolidays\(/);
    assert.match(editor, /fillText\(t\('set_hol_err_too_many'\), \{ n: fmtN\(HOLIDAYS_PER_YEAR_MAX\) \}\)/);
    assert.equal(HOLIDAYS_PER_YEAR_MAX, 60);
    assert.equal(th.set_hol_err_too_many, 'ใส่วันหยุดได้ไม่เกินปีละ {n} วัน');
    assert.equal(en.set_hol_err_too_many, 'Keep each year to {n} holidays');
    assert.match(hooks, /invalidateQueries\(\{ queryKey: \['dashboard-summary'\] \}\)/);
    assert.match(hooks, /invalidateQueries\(\{ queryKey: \['reports'\] \}\)/);
});

test('parseHolidayText expands day ranges before a Thai month', () => {
    for (const line of ['13-15 เมษายน 2569 วันสงกรานต์', '13–15 เม.ย. 2026 วันสงกรานต์']) {
        const result = parseHolidayText(line, 2026, []);
        assert.deepEqual(result.ok, [
            { date: '2026-04-13', name: 'วันสงกรานต์' },
            { date: '2026-04-14', name: 'วันสงกรานต์' },
            { date: '2026-04-15', name: 'วันสงกรานต์' },
        ]);
        assert.deepEqual(result.bad, []);
    }
});

test('parseHolidayText rejects backwards or impossible day ranges', () => {
    for (const line of ['15-13 เมษายน 2569 x', '1-32 เมษายน 2569 x', '29-31 เมษายน 2569 x']) {
        const result = parseHolidayText(line, 2026, []);
        assert.equal(result.ok.length, 0);
        assert.equal(result.bad[0].error, 'bad_date');
    }
});

test('parseHolidayText counts duplicates inside a range and keeps numeric dates single', () => {
    const range = parseHolidayText('13-15 เมษายน 2569 วันสงกรานต์', 2026, ['2026-04-13', '2026-04-14']);
    assert.equal(range.duplicates, 2);
    assert.deepEqual(range.ok, [{ date: '2026-04-15', name: 'วันสงกรานต์' }]);

    const numeric = parseHolidayText('13/04/2027 a\n2027-04-14 b', 2027, []);
    assert.deepEqual(numeric.ok, [
        { date: '2027-04-13', name: 'a' },
        { date: '2027-04-14', name: 'b' },
    ]);
});
