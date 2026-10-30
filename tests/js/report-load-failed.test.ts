// REP-9 REP-10 REP-18 REP-19: a report that fails to load says so (with a retry where it can), never a lasting skeleton or a false empty.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { report as en } from '../../resources/js/lang/en/report.ts';
import { report as th } from '../../resources/js/lang/th/report.ts';

const read = (path: string) => readFileSync(new URL(`../../resources/js/modules/report/${path}`, import.meta.url), 'utf8');

test('the four breakdown cards show the error card instead of a lasting skeleton', () => {
    for (const file of [
        'components/manual-sla-cards.tsx',
        'components/request-sla-cards.tsx',
        'components/backlog-board.tsx',
        'components/snapshot-strip.tsx',
    ]) {
        assert.match(read(file), /if \(isError && !data\) return <ErrorCard message=\{errorMessageFor\(t, error\)\} \/>;/, file);
    }
});

test('the Report Center tells a failed load from having no report to open', () => {
    const page = read('pages/index.tsx');
    assert.match(page, /\) : isError && reports\.length === 0 \? \(/);
    assert.match(page, /<LoadFailedPanel onRetry=\{\(\) => void refetch\(\)\} \/>/);
});

test('the Ticket and SLA report retries a plain failure and its table never reads a failure as empty', () => {
    const page = read('pages/tickets-overview.tsx');
    assert.match(page, /const loadFailed = !rangeOrderInvalid && isError && !data && errorStatus !== 403 && errorStatus !== 422;/);
    assert.match(page, /<Card role="alert"/);
    assert.match(read('components/ticket-report-table.tsx'), /if \(isError && !data\) \{/);
});

test('a failed review-sheet download says so', () => {
    assert.match(read('hooks/use-reports.ts'), /onError: \(\) => useToastStore\.getState\(\)\.push\(t\('rep_ar_sheet_download_failed'\), 'error'\)/);
    assert.equal(th.rep_ar_sheet_download_failed, 'ดาวน์โหลดใบทบทวนไม่สำเร็จ ลองอีกครั้ง');
    assert.ok(en.rep_ar_sheet_download_failed);
});
