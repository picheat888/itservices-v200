// Every dialog frame takes one of four widths (384, 560, 768, 1100); the template editor alone keeps 1500 (D1 board V).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const tsxFiles = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name).replaceAll('\\', '/')] : [],
    );

// Opening tags of these components, read to the '>' that closes them outside {...}, quotes and comments
const openTags = (src: string, names: string[]): string[] => {
    const found: string[] = [];
    const start = new RegExp(`<(${names.map((n) => n.replace('.', '\\.')).join('|')})\\b`, 'g');
    for (const m of src.matchAll(start)) {
        const from = m.index ?? 0;
        let depth = 0;
        let quote = '';
        let end = -1;
        for (let i = from; i < src.length && end < 0; i++) {
            const c = src[i];
            if (quote) {
                if (c === quote && src[i - 1] !== '\\') quote = '';
            } else if (c === '/' && src[i + 1] === '/') {
                i = src.indexOf('\n', i);
                if (i < 0) break;
            } else if (c === '/' && src[i + 1] === '*') {
                i = src.indexOf('*/', i + 2) + 1;
                if (i < 1) break;
            } else if (c === '"' || c === "'" || c === '`') {
                quote = c;
            } else if (c === '{') {
                depth++;
            } else if (c === '}') {
                depth--;
            } else if (c === '>' && depth === 0) {
                end = i;
            }
        }
        assert.ok(end >= 0, `unclosed <${m[1]} tag at offset ${from}`);
        found.push(src.slice(from, end + 1));
    }
    return found;
};

const TAILWIND: Record<string, number> = { sm: 384, md: 448, lg: 512, xl: 576, '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024 };
const STANDARD = [384, 560, 768, 1100];

// Every width a dialog tag can take, from its own max-w tokens or the shared class it uses
const widthsOf = (name: string, tag: string): (number | string)[] => {
    const widths: (number | string)[] = [];
    if (name === 'FormDialogContent' || tag.includes('formDialogContentClass')) widths.push(560);
    if (tag.includes('mediumDialogContentClass')) widths.push(768);
    if (/focusDialogContentClass|largeDialogContentClass/.test(tag)) widths.push(1100);
    if (tag.includes('recordMissingContentClass')) widths.push(384);
    for (const m of tag.matchAll(/(?<![\w-])max-w-(\[[^\]]+\]|sm|md|lg|xl|2xl|3xl|4xl|5xl)/g)) {
        const px = /^\[(\d+)px\]$/.exec(m[1]);
        widths.push(px ? Number(px[1]) : (TAILWIND[m[1]] ?? m[1]));
    }
    if (widths.length === 0) widths.push(name === 'DialogContent' ? 512 : '?');
    return widths;
};

test('every dialog frame is 384, 560, 768 or 1100 wide', () => {
    const off: string[] = [];
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        if (rel === 'shared/ui/dialog.tsx' || rel === 'shared/ui/sheet.tsx') continue;
        const src = read(rel);
        for (const name of ['DialogContent', 'FormDialogContent', 'DialogPrimitive.Content']) {
            for (const tag of openTags(src, [name])) {
                if (name === 'DialogContent' && /^<DialogContent\b[^>]*ref=\{ref\}/.test(tag)) continue;
                const widths = widthsOf(name, tag);
                const template = rel === 'modules/email-templates/pages/index.tsx' && widths.includes(1500);
                if (!template && !widths.every((w) => STANDARD.includes(w as number))) off.push(`${rel}: ${widths.join(' / ')}`);
            }
        }
    }
    assert.deepEqual(off, []);
});

test('768 dialogs use the shared medium class instead of their own width', () => {
    const MEDIUM = [
        'modules/employee/components/department-members-dialog.tsx',
        'modules/employee/components/position-members-dialog.tsx',
        'modules/employee/components/section-members-dialog.tsx',
        'shared/components/attachment-preview.tsx',
        'shared/components/import-dialog.tsx',
    ];
    for (const rel of MEDIUM) {
        const tags = openTags(read(rel), ['DialogContent']);
        assert.ok(
            tags.some((tag) => tag.includes('mediumDialogContentClass')),
            `${rel}: mediumDialogContentClass`,
        );
        for (const tag of tags) assert.doesNotMatch(tag, /max-w-3xl|max-w-2xl|max-w-lg/, `${rel}: own width`);
    }
    const counting = openTags(read('modules/stock/pages/tabs/counting-tab.tsx'), ['DialogContent']).filter((tag) =>
        tag.includes('mediumDialogContentClass'),
    );
    assert.equal(counting.length, 2, 'new count and the count sheet are 768');
});

test('the import dialog keeps one width through every step', () => {
    const tag = openTags(read('shared/components/import-dialog.tsx'), ['DialogContent'])[0];
    assert.doesNotMatch(tag, /result \?|guide \?/, 'width no longer depends on the step');
});

test('the receive form and its receipt are the same width', () => {
    const src = read('modules/stock/components/movement-drawer.tsx');
    assert.equal(openTags(src, ['FormDialogContent']).length, 2);
    assert.equal(openTags(src, ['DialogContent']).length, 0);
});

test('hand-written dialog footers use DialogFooterBar', () => {
    const FILES = [
        'modules/email-templates/pages/index.tsx',
        'modules/employee/components/employee-view-drawer.tsx',
        'modules/profile/components/profile-drawer.tsx',
        'modules/notification/components/notification-settings-pane.tsx',
    ];
    for (const rel of FILES) {
        const src = read(rel);
        assert.match(src, /<DialogFooterBar\b/, `${rel}: DialogFooterBar`);
        for (const m of src.matchAll(/<div className="([^"]*)">/g)) {
            const cls = m[1].split(/\s+/);
            const footerLike = cls.includes('border-t') && cls.some((c) => /^px-[4-7]$/.test(c)) && cls.some((c) => /^py-(3|4)$/.test(c));
            assert.ok(!footerLike, `${rel}: hand-written footer "${m[1]}"`);
        }
        assert.doesNotMatch(src, /className="mt-6 flex flex-row gap-2"/, `${rel}: bar-less button row`);
    }
});
