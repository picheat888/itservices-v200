// EMP-4: the employee view asks for the org chart only with employees.view_org, and counts direct reports from the server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const drawer = read('modules/employee/components/employee-view-drawer.tsx');

test('without the org chart permission the view neither fetches the chart nor shows its tab', () => {
    assert.match(drawer, /useOrgChart\(open && canViewOrg\)/);
    assert.match(drawer, /\.\.\.\(canViewOrg \? \[\{ id: 'org' as const/);
    assert.match(read('modules/employee/pages/index.tsx'), /canViewOrg=\{canViewOrg\}/);
});

test('direct reports come from the single-employee fetch, never a 0 from a chart that did not load', () => {
    assert.match(drawer, /const reportsCount = emp\.direct_reports_count \?\? \(canViewOrg \? directReports\.length : null\);/);
    assert.match(drawer, /<Kpi val=\{reportsCount === null \? '—' : fmtN\(reportsCount\)\}/);
    assert.match(drawer, /reports=\{reportsCount\}/);
    assert.doesNotMatch(drawer, /fmtN\(directReports\.length\)/);
});
