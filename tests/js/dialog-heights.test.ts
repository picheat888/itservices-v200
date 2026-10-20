// Dialog bodies fill the frame's shared height cap instead of capping themselves by screen height (D2).
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

// Classes of the element that carries this exact token
const classesWith = (rel: string, token: string): string[] => {
    const found = read(rel).match(new RegExp(`className="([^"]*${token.replace(/[[\]().]/g, '\\$&')}[^"]*)"`));
    assert.ok(found, `${rel}: element with ${token}`);
    return found[1].split(/\s+/);
};

test('inside a dialog nothing caps its own height by the screen; the frame does', () => {
    // The member tables keep a 52dvh body so their header and paging stay in view
    const KEPT = ['maxBodyHeight="52dvh"'];
    const SCREEN_CAP = /(?<![\w-])!?(max-h|h|min-h)-\[[^\]]*(dvh|vh)[^\]]*\]/g;
    const off: string[] = [];
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        if (rel.startsWith('shared/ui/')) continue;
        const src = read(rel);
        if (!/<(DialogContent|FormDialogContent)\b/.test(src)) continue;
        src.split('\n').forEach((line, i) => {
            if (KEPT.some((k) => line.includes(k))) return;
            // The frame itself (its own tag line, or a className line right under it) sets the shared cap
            const frame =
                /<(DialogContent|FormDialogContent)\b/.test(line) || /(ContentClass|className=)[^\n]*min\(860px,calc\(100dvh-72px\)\)/.test(line);
            if (frame) return;
            for (const m of line.matchAll(SCREEN_CAP)) off.push(`${rel}:${i + 1} ${m[0]}`);
        });
    }
    assert.deepEqual(off, []);
});

test('the attachment viewer fills a fixed-height frame', () => {
    const src = read('shared/components/attachment-preview.tsx');
    assert.match(src, /mediumDialogContentClass, 'h-\[min\(860px,calc\(100dvh-72px\)\)\]/, 'fixed frame height');
    const body = classesWith('shared/components/attachment-preview.tsx', 'bg-muted/30');
    for (const t of ['min-h-0', 'flex-1']) assert.ok(body.includes(t), `viewer body: ${t}`);
});

test('the Resource form body grows with the frame', () => {
    assert.match(read('modules/access/components/resource-modal.tsx'), /'min-h-0 flex-1 overflow-y-auto px-6'/);
});

test('the import dialog scrolls as one body with room for focus rings', () => {
    const body = classesWith('shared/components/import-dialog.tsx', 'flex min-h-0 flex-1 scroll-py-2');
    for (const t of ['overflow-y-auto', 'scroll-py-2', 'border-t', 'px-6']) assert.ok(body.includes(t), `import body: ${t}`);
});
