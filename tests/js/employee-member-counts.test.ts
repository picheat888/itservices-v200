// Member counts in the employee module: tables and dialogs count staff still working there, leavers shown apart and last.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { blockedMembersLine, countMembers, splitCounts } from '../../resources/js/modules/employee/lib/member-counts.ts';

const read = (path: string) => readFileSync(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');
const fmtN = (n: number) => n.toLocaleString('en-US');
const words = { plain: '{n} Members', withLeft: '{n} Members, {left} left' };

test('members split into active staff and leavers', () => {
    assert.deepEqual(countMembers([{ status: 'active' }, { status: 'resigned' }, { status: 'active' }]), { active: 2, left: 1 });
    assert.deepEqual(countMembers([]), { active: 0, left: 0 });
    assert.deepEqual(splitCounts(3, 4), { active: 3, left: 1 });
    assert.deepEqual(splitCounts(5, 4), { active: 5, left: 0 });
});

test('the cannot-delete line names the leavers only when someone has left', () => {
    assert.equal(blockedMembersLine(3, 4, fmtN, words), '3 Members, 1 left');
    assert.equal(blockedMembersLine(1200, 1200, fmtN, words), '1,200 Members');
    assert.equal(blockedMembersLine(0, 2, fmtN, words), '0 Members, 2 left');
    assert.equal(blockedMembersLine(3, 4, fmtN, { plain: '{n} สมาชิก', withLeft: '{n} สมาชิก, ลาออกแล้ว {left} คน' }), '3 สมาชิก, ลาออกแล้ว 1 คน');
});

test('the member line wording lives in the lang files of both locales', () => {
    for (const locale of ['en', 'th']) {
        const lang = read(`lang/${locale}/employee.ts`);
        assert.match(lang, /members_n: '[^']*\{n\}[^']*'/, locale);
        assert.match(lang, /members_with_left: '[^']*\{n\}[^']*\{left\}[^']*'/, locale);
    }
});

test('the three tables show the active count, never the total', () => {
    const page = read('modules/employee/pages/index.tsx');
    assert.match(page, /fmtN\(p\.active_employees_count \?\? 0\)/);
    assert.equal(page.match(/fmtN\(d\.active_employees_count \?\? 0\)/g)?.length, 2);
    assert.doesNotMatch(page, /active_count \?\? d\.count/);
    const sections = read('modules/employee/components/sections-tab.tsx');
    assert.match(sections, /fmtN\(s\.active_employees_count \?\? 0\)/);
    assert.match(sections, /\(b\.active_employees_count \?\? 0\) - \(a\.active_employees_count \?\? 0\)/);
});

test('the three members dialogs count active staff and keep the server order', () => {
    for (const name of ['department', 'position', 'section']) {
        const dialog = read(`modules/employee/components/${name}-members-dialog.tsx`);
        assert.match(dialog, /<MemberCount[\s\S]*?rowActive=\{view\?\.active_employees_count\}/, name);
        assert.match(dialog, /rows=\{members\}/, name);
    }
});

test('the three cannot-delete notices put the counts on their own line', () => {
    const page = read('modules/employee/pages/index.tsx');
    const sections = read('modules/employee/components/sections-tab.tsx');
    assert.equal(page.match(/blockedMembersLine\(/g)?.length, 2);
    assert.equal(page.match(/\{\s*plain: t\('members_n'\),\s*withLeft: t\('members_with_left'\),?\s*\}/g)?.length, 2);
    assert.equal(page.match(/subBelow: true/g)?.length, 2);
    assert.match(sections, /blockedMembersLine\([\s\S]*?subBelow: true/);
    assert.match(read('shared/ui/confirm-dialog.tsx'), /shown\.entity\.subBelow \? 'block' : 'inline-block'/);
});

test('overview KPI figures carry thousands separators', () => {
    const page = read('modules/employee/pages/index.tsx');
    assert.match(page, /value: summary \? fmtN\(summary\.total\) : '—'/);
    assert.match(page, /value: fmtN\(departments\.length\)/);
    assert.match(page, /value: fmtN\(positions\.length\)/);
    assert.doesNotMatch(page, /value: String\((summary|departments|positions)/);
});

test('only the Retry button swaps the failed org chart for the skeleton', () => {
    const tab = read('modules/employee/components/org-chart/org-chart-tab.tsx');
    assert.match(tab, /if \(isLoading \|\| retrying\) \{/);
    assert.match(tab, /<LoadFailedPanel onRetry=\{retry\} \/>/);
    assert.doesNotMatch(tab, /isError && isFetching/);
});
