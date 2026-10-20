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

// Opening tags of these components, read to the '>' that closes them outside {...} and quotes
const openTags = (src: string, names: string[]): string[] => {
    const found: string[] = [];
    const start = new RegExp(`<(${names.map((n) => n.replace('.', '\\.')).join('|')})\\b`, 'g');
    for (const m of src.matchAll(start)) {
        const from = m.index ?? 0;
        let depth = 0;
        let quote = '';
        for (let i = from; i < src.length; i++) {
            const c = src[i];
            if (quote) {
                if (c === quote && src[i - 1] !== '\\') quote = '';
            } else if (c === '"' || c === "'" || c === '`') {
                quote = c;
            } else if (c === '{') {
                depth++;
            } else if (c === '}') {
                depth--;
            } else if (c === '>' && depth === 0) {
                found.push(src.slice(from, i + 1));
                break;
            }
        }
    }
    return found;
};

test('the tag reader reads past arrow functions inside a tag', () => {
    assert.deepEqual(openTags('<DialogContent onX={(e) => e} className="a b">x</DialogContent>', ['DialogContent']), [
        '<DialogContent onX={(e) => e} className="a b">',
    ]);
});

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
        const contents = openTags(src, ['DialogContent', 'FormDialogContent', 'SheetContent', 'DialogPrimitive.Content']);
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
        const tags = openTags(read(rel), ['DialogContent']);
        assert.ok(tags.length > 0, `${rel}: DialogContent found`);
        for (const tag of tags) {
            assert.ok(tag.includes('max-h-[calc(100dvh-2rem)]'), `${rel}: height cap`);
            assert.ok(tag.includes('overflow-y-auto'), `${rel}: scrolls when capped`);
        }
    }
    assert.match(read('shared/ui/confirm-dialog.tsx'), /max-h-\[calc\(100dvh-2rem\)\] [^']*overflow-y-auto/, 'useConfirm frame: height cap');
});
