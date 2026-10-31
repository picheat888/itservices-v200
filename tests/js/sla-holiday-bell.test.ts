// The "no holidays for this year" bell: module tab, click target, subtype wording and its words in both languages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { notification as en } from '../../resources/js/lang/en/notification.ts';
import { notification as th } from '../../resources/js/lang/th/notification.ts';

const text = readFileSync(new URL('../../resources/js/modules/notification/lib/notification-text.ts', import.meta.url), 'utf8');

test('it sits in the system tab and opens the holiday list of that year', () => {
    assert.match(text, /type === 'sla_holidays' \|\| type === 'report_export'/);
    assert.match(text, /type === 'sla_holidays'\) return `\/settings\?tab=tickets&holidays=\$\{n\.data\.year\}`/);
});

test('its bell shows an amber calendar, a job to do', () => {
    const display = readFileSync(new URL('../../resources/js/app/layout/notification-display.tsx', import.meta.url), 'utf8');
    assert.match(display, /n\.data\.type === 'sla_holidays'\) \{\s*return \{ Icon: CalendarX, \.\.\.TONE\.amber \};/);
});

test('the message follows the subtype and the title carries the year', () => {
    assert.match(text, /subtype === 'started' \? 'notif_sla_holidays_started' : 'notif_sla_holidays_missing'/);
    assert.match(text, /t\('notif_sla_holidays_title'\)/);
    assert.equal(th.notif_sla_holidays_title, 'ยังไม่มีวันหยุดปี {year}');
    assert.equal(th.notif_sla_holidays_missing, 'เพิ่มตามประกาศวันหยุดของบริษัทก่อน 1 ม.ค. {year} ไม่อย่างนั้นวันหยุดจะถูกนับเป็นวันทำการ');
});

test('every new key exists in both languages without " - " or " · "', () => {
    const keys = ['notif_sla_holidays_title', 'notif_sla_holidays_missing', 'notif_sla_holidays_started'] as const;
    for (const dict of [th, en] as Record<string, string>[]) {
        for (const key of keys) {
            assert.ok(dict[key], key);
            assert.ok(!dict[key].includes(' - ') && !dict[key].includes(' · '), key);
        }
        for (const part of ['name', 'when', 'who']) assert.ok(dict[`notification_${part}_sla_holidays_missing`], part);
    }
});
