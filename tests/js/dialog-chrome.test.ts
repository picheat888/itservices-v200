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

test('the tag reader skips comments inside a tag and fails on a tag it cannot close', () => {
    const src = '<FormDialogContent\n    // so don\'t raise the keyboard\n    /* a > b */\n    className="x"\n>body</FormDialogContent>';
    assert.deepEqual(openTags(src, ['FormDialogContent']), [src.slice(0, src.indexOf('>body') + 1)]);
    assert.throws(() => openTags('<DialogContent className="x"', ['DialogContent']));
});

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
    const ALERTS = [
        'shared/components/blocking-dialog.tsx',
        'shared/ui/confirm-dialog.tsx',
        'modules/auth/components/change-password-dialog.tsx',
        'shared/components/record-missing.tsx',
    ];
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

test('dialog footers use DialogFooterBar instead of a hand-written grey bar', () => {
    // Side panels, the photo cropper and a stock widget share the grey ground but are not footers
    const NOT_FOOTER = ['lg:border-r', 'sm:border-l', 'px-3 py-2', 'h-72'];
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        if (rel.replaceAll('\\', '/') === 'shared/ui/dialog.tsx') continue;
        for (const m of read(rel).matchAll(/<div className="([^"]*)">/g)) {
            const cls = m[1].split(/\s+/);
            const greyBar = cls.includes('border-t') && (cls.includes('bg-muted/30') || cls.includes('bg-muted/20'));
            if (greyBar && !NOT_FOOTER.some((t) => m[1].includes(t))) assert.fail(`${rel}: hand-written footer bar "${m[1]}"`);
        }
    }
});

// Classes of the element that carries this exact token
const classesWith = (rel: string, token: string): string[] => {
    const found = read(rel).match(new RegExp(`className="([^"]*${token.replace(/[[\]().]/g, '\\$&')}[^"]*)"`));
    assert.ok(found, `${rel}: element with ${token}`);
    return found[1].split(/\s+/);
};

test('scroll areas inside dialogs leave room for the 4px focus ring', () => {
    // Full-width buttons in the import guide: side padding, cancelled by a negative margin so the layout stays put
    const guide = classesWith('shared/components/import-dialog.tsx', 'max-h-[min(58dvh,640px)]');
    for (const t of ['-mx-2', 'px-2', 'scroll-py-2']) assert.ok(guide.includes(t), `import guide: ${t}`);
    const units = classesWith('modules/employee/components/import-guide.tsx', 'max-h-56');
    for (const t of ['scroll-py-2', 'pt-0.5']) assert.ok(units.includes(t), `import guide unit list: ${t}`);
    // Checkbox list in a new stock count: keyboard focus scrolls an item in with room for its ring
    const requestBody = classesWith('modules/request/components/request-detail-dialog.tsx', 'content-start gap-8 overflow-y-auto');
    assert.ok(requestBody.includes('scroll-py-2'), 'request detail body: scroll-py-2');
    const skus = classesWith('modules/stock/pages/tabs/counting-tab.tsx', 'max-h-72');
    assert.ok(skus.includes('scroll-py-2'), 'stock count list: scroll-py-2');
});

test('dialogs that had no height cap scroll inside the screen', () => {
    const UNCAPPED = [
        'modules/employee/components/photo-crop-dialog.tsx',
        'modules/notification/components/notification-settings-pane.tsx',
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

test('no dialog keeps the bar-less DialogFooter', () => {
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        if (rel.replaceAll('\\', '/') === 'shared/ui/dialog.tsx') continue;
        assert.doesNotMatch(read(rel), /<DialogFooter\b/, `${rel}: DialogFooter instead of DialogFooterBar`);
    }
});

test('the member review sheet joins header, preview and footer with rules, no white gaps', () => {
    const src = read('modules/report/components/access-members-cards.tsx');
    const content = openTags(src, ['DialogContent']).find((tag) => tag.includes('largeDialogContentClass')) ?? '';
    assert.ok(content, 'review sheet DialogContent');
    assert.doesNotMatch(content, /gap-4/, 'review sheet: white gap between parts');
    const preview = classesWith('modules/report/components/access-members-cards.tsx', 'bg-muted min-h-0');
    for (const t of ['border-t', 'flex-1', 'overflow-y-auto']) assert.ok(preview.includes(t), `review sheet preview: ${t}`);
});
