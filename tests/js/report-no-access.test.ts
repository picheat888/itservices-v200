// UAT RPT-xx-05: a report link the reader has no right to says "คุณไม่มีสิทธิ์ดูรายงานนี้" and leads back to the Report Center.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('every report page route refuses with the report screen; no other route changes', () => {
    const app = read('app/App.tsx');
    assert.match(
        app,
        /reportPageRoutes\.map\(\(\{ path, allOf, Page \}\) => \([\s\S]*?<RequirePermission allOf=\{allOf\} fallback=\{<ReportNoAccess \/>\}>/,
    );
    assert.equal(app.match(/<RequirePermission[^>]*fallback=/g)?.length, 1);
    assert.match(app, /import \{[^}]*\bReportNoAccess\b[^}]*\} from '@\/modules\/report';/);
});

test('the gate shows its fallback when given one, else the shared NoAccess screen', () => {
    const gate = read('modules/auth/components/require-permission.tsx');
    assert.match(gate, /fallback\?: React\.ReactNode;/);
    assert.match(gate, /return <>\{fallback \?\? <NoAccess \/>\}<\/>;/);
});

test('the report screen names the report and picks its way back by the Report Center gate', () => {
    const screen = read('modules/report/components/report-no-access.tsx');
    assert.match(screen, /title=\{t\('rep_err_no_access'\)\}/);
    assert.match(screen, /lines=\{\[t\('err_noaccess_line1'\), t\('err_noaccess_line2'\)\]\}/);
    assert.match(screen, /const toReports = useCanOpen\(\)\('\/reports'\);/);
    assert.match(screen, /<Link to=\{toReports \? '\/reports' : '\/'\}>\{toReports \? t\('rep_back_to_reports'\) : t\('noaccess_back'\)\}<\/Link>/);
    assert.match(read('modules/report/index.ts'), /export \{ ReportNoAccess \} from '\.\/components\/report-no-access';/);
    for (const lang of ['en', 'th']) {
        const words = read(`lang/${lang}/report.ts`);
        assert.match(words, /rep_err_no_access: '/);
        assert.match(words, /rep_back_to_reports: '/);
    }
});
