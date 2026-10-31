// Employee module small fixes: the special-position switch follows the permission (EMP-8), a failed org chart
// is not an empty one (EMP-13), the cancel-resignation confirm names the person (EMP-17), member counts carry commas (EMP-18),
// the unit tables are not empty while loading or after a failed load.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../resources/js/modules/employee/${path}`, import.meta.url), 'utf8');

test('the position dialog switch is disabled without employees.position_special', () => {
    assert.match(read('components/position-modal.tsx'), /<Switch checked=\{allowSpecial\} onChange=\{toggleSpecial\} disabled=\{!canSpecial\}/);
    assert.match(read('pages/index.tsx'), /<PositionModal [\s\S]*?canSpecial=\{canPosSpecial\} \/>/);
});

test('a failed org chart load shows the retry panel before the empty state', () => {
    const tab = read('components/org-chart/org-chart-tab.tsx');
    const failed = tab.indexOf('<LoadFailedPanel onRetry={retry} />');
    const empty = tab.indexOf("title={t('emp_empty_org_chart')}");
    assert.ok(failed > 0 && empty > failed);
});

test('both cancel-resignation entry points use the one confirm that names the employee', () => {
    const page = read('pages/index.tsx');
    const confirms = page.split("description: t('cancel_resign_confirm')").slice(1);
    assert.equal(confirms.length, 1);
    assert.match(confirms[0].slice(0, 120), /entity: \{ name: localName\(e, lang\), sub: e\.code \}/);
    assert.match(page, /onCancelResign=\{\(e\) => confirmCancelResign\(e\)\}/);
    assert.match(page, /onCancelResign=\{\(e\) => confirmCancelResign\(e, closeEmp\)\}/);
});

test('the positions, departments and sections tables load with a skeleton and say so when the load fails', () => {
    const page = read('pages/index.tsx');
    for (const query of ['positionsQuery', 'departmentsQuery']) {
        assert.match(page, new RegExp(`loading=\\{${query}\\.isLoading\\}`), query);
        assert.match(
            page,
            new RegExp(`${query}\\.isError && !${query}\\.data \\? \\(?\\s*<LoadFailed onRetry=\\{\\(\\) => void ${query}\\.refetch\\(\\)\\} />`),
            query,
        );
    }
    const sections = read('components/sections-tab.tsx');
    assert.match(sections, /loading=\{isLoading\}/);
    assert.match(sections, /sectionsQuery\.isError && !sectionsQuery\.data \? <LoadFailed onRetry=\{\(\) => void sectionsQuery\.refetch\(\)\} \/>/);
});

test('member counts in the three member dialogs go through fmtN', () => {
    assert.match(read('components/member-count.tsx'), /fmtN\(counts\.active\)/);
    assert.match(read('components/member-count.tsx'), /fmtN\(counts\.left\)/);
    for (const name of ['department', 'position', 'section']) {
        const dialog = read(`components/${name}-members-dialog.tsx`);
        assert.match(dialog, /<MemberCount/, name);
        assert.doesNotMatch(dialog, /members\.length\}/, name);
    }
});
