// View dialogs whose first control is a search box open with focus on the dialog itself, so no field raises the iPad keyboard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const VIEW_WITH_SEARCH = [
    'modules/employee/components/department-members-dialog.tsx',
    'modules/employee/components/position-members-dialog.tsx',
    'modules/employee/components/section-members-dialog.tsx',
    'modules/access/components/members-drawer.tsx',
    'modules/report/components/manage-schedules-dialog.tsx',
];

test('dialog.tsx exports an open handler that keeps focus on the dialog itself', () => {
    const src = read('shared/ui/dialog.tsx');
    const body = src.match(/const focusDialogOnOpen = \(event: Event\) => \{([\s\S]*?)\n\};/)?.[1] ?? '';
    assert.match(body, /event\.preventDefault\(\)/, 'stops Radix focusing the first control');
    assert.match(body, /\(event\.currentTarget as HTMLElement \| null\)\?\.focus\(\{ preventScroll: true \}\)/, 'focuses the dialog');
    assert.match(src, /export \{[^}]*\bfocusDialogOnOpen\b[^}]*\}/s);
});

test('view dialogs whose first control is a search box open with focus on the dialog', () => {
    for (const rel of VIEW_WITH_SEARCH) assert.match(read(rel), /onOpenAutoFocus=\{focusDialogOnOpen\}/, rel);
});
