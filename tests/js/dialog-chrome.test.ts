// Dialog chrome shared by every dialog: a 32px close button that keeps its icon in place, and two corner radii only.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const tsxFiles = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
    );

// The class string of the close button: the literal that carries ring-offset-background
const closeTokens = (rel: string): string[] => {
    const found = read(rel).match(/'([^']*ring-offset-background[^']*)'|"([^"]*ring-offset-background[^"]*)"/);
    assert.ok(found, `${rel}: close button classes`);
    return (found[1] ?? found[2]).split(/\s+/);
};

test('every dialog close button is a 32px target with the icon 16px from the corner', () => {
    const tokens = closeTokens('shared/ui/dialog.tsx');
    for (const part of ['top-2', 'right-2', 'size-8', 'grid', 'place-items-center']) assert.ok(tokens.includes(part), `dialog close: ${part}`);
    assert.ok(!tokens.includes('top-4'), 'dialog close: old 16px position');
});

test('the sheet close button is a 32px target with the icon 24px from the corner', () => {
    const tokens = closeTokens('shared/ui/sheet.tsx');
    for (const part of ['top-4', 'right-4', 'size-8', 'grid', 'place-items-center']) assert.ok(tokens.includes(part), `sheet close: ${part}`);
    assert.ok(!tokens.includes('top-6'), 'sheet close: old 16px position');
});

test('dialogs use two corner radii: 14px for the centred alert windows, the 10px default for the rest', () => {
    const ALERTS = ['shared/components/blocking-dialog.tsx', 'shared/ui/confirm-dialog.tsx', 'modules/auth/components/change-password-dialog.tsx'];
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        const src = read(rel);
        const contents = src.match(/<(DialogContent|FormDialogContent|SheetContent|DialogPrimitive\.Content)\b[\s\S]*?>/g) ?? [];
        for (const tag of contents) {
            assert.doesNotMatch(tag, /rounded-(xl|2xl|3xl)\b/, `${rel}: dialog radius other than 10px or 14px`);
        }
        if (/rounded-\[14px\]/.test(contents.join(' ')) || /DialogPrimitive\.Content[\s\S]*rounded-\[14px\]/.test(src)) {
            assert.ok(ALERTS.includes(rel.replaceAll('\\', '/')), `${rel}: 14px is for the centred alert windows only`);
        }
    }
});

test('dialogs that had no height cap scroll inside the screen', () => {
    const UNCAPPED = [
        'modules/asset/components/asset-receive-modal.tsx',
        'modules/employee/components/manage-credentials-modal.tsx',
        'modules/employee/components/photo-crop-dialog.tsx',
        'modules/employee/components/set-credentials-modal.tsx',
        'modules/notification/components/notification-settings-pane.tsx',
        'modules/stock/components/stock-item-modal.tsx',
    ];
    for (const rel of UNCAPPED) {
        const tags = read(rel).match(/<DialogContent\b[^>]*>/g) ?? [];
        assert.ok(tags.length > 0, `${rel}: DialogContent found`);
        for (const tag of tags) {
            assert.ok(tag.includes('max-h-[calc(100dvh-2rem)]'), `${rel}: height cap`);
            assert.ok(tag.includes('overflow-y-auto'), `${rel}: scrolls when capped`);
        }
    }
    assert.match(read('shared/ui/confirm-dialog.tsx'), /max-h-\[calc\(100dvh-2rem\)\] [^']*overflow-y-auto/, 'useConfirm frame: height cap');
});
