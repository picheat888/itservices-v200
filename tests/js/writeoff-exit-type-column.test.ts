// UAT RPT-13-01: the write-off list shows "ประเภทการออก" ("ตัดจำหน่าย" or "คืนผู้ให้เช่า") as a column of its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { report as en } from '../../resources/js/lang/en/report.ts';
import { report as th } from '../../resources/js/lang/th/report.ts';

const page = readFileSync(join(import.meta.dirname, '../../resources/js/modules/report/pages/assets-writeoffs.tsx'), 'utf8');

test('the exit type is no longer folded into another cell', () => {
    assert.match(page, /innerColumns: \['brand', 'model', 'contract', 'warranty_months'\],/);
});

test('the reason cell shows the reason only, no repeated "คืนผู้ให้เช่า"', () => {
    const cell = page.slice(page.indexOf('function ReasonCell'), page.indexOf('function AgeCell'));
    assert.match(cell, /const reason = str\(row\.reason\);/);
    assert.doesNotMatch(cell, /rep_wo_outcome_returned/);
});

test('the column and its values are worded in both languages', () => {
    assert.equal(th.rep_c_outcome, 'ประเภทการออก');
    assert.equal(en.rep_c_outcome, 'Exit type');
    for (const dict of [th, en]) for (const v of ['written_off', 'returned']) assert.ok(dict[`rep_wo_outcome_${v}`], `${v}`);
});
