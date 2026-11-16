// UAT RPT-03-02: with no case closed in the range, the SLA-by-priority chart says "ยังไม่มีเคสที่ปิดในช่วงนี้" instead of four "—" bars.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { report as th } from '../../resources/js/lang/th/report.ts';

const page = readFileSync(join(import.meta.dirname, '../../resources/js/modules/report/pages/tickets-overview.tsx'), 'utf8');

test('the chart gets no bars when no priority has a measured case, the rule the "ปิดทัน SLA" card uses for "—"', () => {
    assert.match(
        page,
        /<HorizontalBars\s+bars=\{\s*data\.sla_by_priority\.every\(\(p\) => p\.measured === 0\)\s*\? \[\]\s*: data\.sla_by_priority\.map\(/,
    );
});

test('the empty words are the ones the test book expects', () => {
    assert.equal(th.rep_empty_tickets_overview_sla_priority, 'ยังไม่มีเคสที่ปิดในช่วงนี้');
});
