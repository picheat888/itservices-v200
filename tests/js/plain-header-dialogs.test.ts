// Dialogs that used a plain 18px title now use the 4ข header (bare icon by meaning), a ruled body and the shared footer bar (D3, D4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const MEMBERS = [
    'modules/employee/components/department-members-dialog.tsx',
    'modules/employee/components/position-members-dialog.tsx',
    'modules/employee/components/section-members-dialog.tsx',
];
const WITH_FOOTER = [
    'modules/employee/components/resign-modal.tsx',
    'modules/stock/components/movement-drawer.tsx',
    'modules/stock/components/stock-item-modal.tsx',
    'modules/stock/pages/tabs/counting-tab.tsx',
    'modules/stock/pages/tabs/requests-tab.tsx',
    'shared/components/import-dialog.tsx',
];

test('no dialog keeps the plain title header or the bar-less footer', () => {
    for (const rel of [...MEMBERS, ...WITH_FOOTER]) {
        const src = read(rel);
        assert.match(src, /<FocusDialogHeader\b/, `${rel}: FocusDialogHeader`);
        assert.doesNotMatch(src, /<DialogHeader\b/, `${rel}: plain header`);
        assert.doesNotMatch(src, /<DialogFooter\b/, `${rel}: bar-less footer`);
    }
    for (const rel of WITH_FOOTER) assert.match(read(rel), /<DialogFooterBar\b/, `${rel}: footer bar`);
});

test('member lists sit under employees with the unit code as the chip', () => {
    for (const rel of MEMBERS) {
        const src = read(rel);
        assert.match(src, /icon=\{Users\}/, `${rel}: Users icon`);
        assert.match(src, /eyebrow=\{t\('employees'\)\}/, `${rel}: employees eyebrow`);
    }
});

test('icons carry their meaning: resign warns, a finished receipt succeeds', () => {
    const resign = read('modules/employee/components/resign-modal.tsx');
    assert.match(resign, /icon=\{AlertTriangle\}/);
    assert.match(resign, /tone="warn"/);
    assert.match(read('modules/stock/components/movement-drawer.tsx'), /tone="success"/);
});

test('the resign form still keeps its date calendar visible', () => {
    const tag = read('modules/employee/components/resign-modal.tsx').match(/<DialogContent\b[^>]*className="([^"]*)"/)?.[1] ?? '';
    assert.ok(tag.length > 0, 'resign DialogContent class');
    assert.doesNotMatch(tag, /overflow-hidden/);
});

test('the import dialog takes its eyebrow from the module that opens it', () => {
    assert.match(read('shared/components/import-dialog.tsx'), /eyebrow: React\.ReactNode|eyebrow: ReactNode/);
    assert.match(read('modules/employee/components/import-employee-dialog.tsx'), /eyebrow=\{t\('employees'\)\}/);
});
