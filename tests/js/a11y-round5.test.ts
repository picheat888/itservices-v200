// Round 5 a11y: labels, pressed states, tab keys, combobox and chart numbers exist in the source markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('asset dates and notes are labelled', () => {
    const src = read('modules/asset/components/asset-form-drawer.tsx');
    assert.match(src, /<Label htmlFor=\{[^}]+\}>\s*\{t\('asset_purchase_date'\)\}/);
    assert.match(src, /<Label htmlFor=\{[^}]+\}>\s*\{t\('asset_warranty_end'\)\}/);
    assert.equal((src.match(/<DateInput\s+id=/g) ?? []).length, 2);
    assert.match(src, /<Textarea value=\{form\.notes\}[\s\S]*?aria-label=\{t\('asset_notes'\)\}/);
});

test('asset segmented toggles expose aria-pressed', () => {
    assert.match(read('modules/asset/components/asset-transfer-dialog.tsx'), /aria-pressed=\{mode === m\}/);
    assert.match(read('modules/asset/components/asset-activity-card.tsx'), /aria-pressed=\{view === v\}/);
});

test('stepper marks the current step and says done in words', () => {
    const src = read('modules/contract/components/contract-form-drawer.tsx');
    assert.match(src, /aria-current=\{active \? 'step'/);
    assert.match(src, /done && <span className="sr-only">/);
});

test('report module chips expose aria-pressed', () => {
    assert.match(read('modules/report/pages/index.tsx'), /aria-pressed=\{domain === c\.id\}/);
});

test('narrow pick/members switch is a pressed toggle', () => {
    const src = read('modules/permission/components/group-role-dialog.tsx');
    assert.doesNotMatch(src, /role="tablist"/);
    assert.match(src, /aria-pressed=\{tab === id\}/);
});

test('org search is an ARIA combobox and the mouse pick stays on mousedown', () => {
    const src = read('modules/employee/components/org-chart/org-chart-toolbar.tsx');
    for (const needle of ['role="combobox"', 'aria-activedescendant=', 'role="listbox"', 'role="option"', 'onMouseDown=']) {
        assert.ok(src.includes(needle), needle);
    }
    assert.doesNotMatch(src, /onClick=\{\(\) => onPick/);
});

test('PageTabs moves with the arrow keys like DialogTabs', () => {
    const src = read('shared/components/page-tabs.tsx');
    for (const needle of ['ArrowRight:', 'ArrowLeft:', 'Home:', 'End:', 'tabIndex={selected ? 0 : -1}', 'onKeyDown={onKeyDown}']) {
        assert.ok(src.includes(needle), needle);
    }
});

test("weekly chart lists every week's numbers for screen readers", () => {
    const src = read('modules/report/components/weekly-ticket-chart.tsx');
    assert.match(src, /<ul className="sr-only">/);
    assert.equal((src.match(/tip\(w, i\)/g) ?? []).length, 2);
    assert.match(src, /<title>\{tip\(w, i\)\}<\/title>/);
});
