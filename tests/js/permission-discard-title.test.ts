// UAT PRM-04-05: leaving unsaved role permissions (another role, another tab, another page) asks "ทิ้งสิทธิ์ที่ยังไม่บันทึก?".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { permission as th } from '../../resources/js/lang/th/permission.ts';
import { discardConfirmOptions } from '../../resources/js/shared/lib/discard-confirm.ts';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');
const t = (key: string) => `<${key}>`;

test('the discard prompt takes a page title and keeps the shared words otherwise', () => {
    assert.equal(discardConfirmOptions(t).title, '<discard_title>');
    const own = discardConfirmOptions(t, 'ทิ้งสิทธิ์ที่ยังไม่บันทึก?');
    assert.equal(own.title, 'ทิ้งสิทธิ์ที่ยังไม่บันทึก?');
    assert.equal(own.description, '<discard_text>');
    assert.equal(own.confirmText, '<discard_confirm>');
});

test('both guards pass the title on, the close guard to its Back/link guard too', () => {
    const close = read('shared/hooks/use-discard-guard.ts');
    assert.match(close, /export function useDiscardGuard\(isDirty: boolean, title\?: string\)/);
    assert.match(close, /useNavigationGuard\(isDirty, MODAL_PARAMS, title\);/);
    assert.match(close, /confirm\(discardConfirmOptions\(t, title\)\)/);
    const nav = read('shared/hooks/use-navigation-guard.ts');
    assert.match(nav, /export function useNavigationGuard\(active: boolean, watchParams: readonly string\[\] = \[\], title\?: string\)/);
    assert.match(nav, /askRef\.current = \(\) => confirm\(discardConfirmOptions\(t, title\)\);/);
});

test('the permissions page asks with its own title on a role switch, a tab switch and a page leave', () => {
    const page = read('modules/permission/pages/index.tsx');
    assert.match(page, /useDiscardGuard\(tab === 'templates' && rolesDirty, t\('perm_discard_title'\)\)/);
    assert.match(page, /useDiscardGuard\(dirty, t\('perm_discard_title'\)\)/);
    assert.match(page, /useNavigationGuard\(dirty, \['tab', 'role'\], t\('perm_discard_title'\)\)/);
    assert.equal(th.perm_discard_title, 'ทิ้งสิทธิ์ที่ยังไม่บันทึก?');
});
