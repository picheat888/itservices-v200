// Large dialogs: two widths (1100, 768), one height cap, fixed or content height; the shared classes and every large dialog that uses them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const CAP = 'min(860px,calc(100dvh-72px))';

// The string literal a size constant in shared/ui/dialog.tsx holds
const classOf = (name: string): string[] => {
    const found = read('shared/ui/dialog.tsx').match(new RegExp(`const ${name} =\\s*'([^']*)'`));
    assert.ok(found, `${name} in dialog.tsx`);
    return found[1].split(/\s+/);
};

// Opening tags of these components, read to the '>' that closes them outside {...}, quotes and comments (as in dialog-chrome)
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

// The dialog tag with the shared size constants spelled out
const resolvedTag = (rel: string, nth = 0): string => {
    const tag = openTags(read(rel), ['DialogContent'])[nth];
    assert.ok(tag, `${rel}: DialogContent #${nth}`);
    return ['focusDialogContentClass', 'largeDialogContentClass', 'mediumDialogContentClass'].reduce(
        (text, name) => text.replaceAll(name, classOf(name).join(' ')),
        tag,
    );
};

// height 'fixed' when the content changes while open (steps, tabs, a form that swaps fields, a body that loads), else 'content'
const LARGE: { rel: string; width: 1100 | 768; height: 'fixed' | 'content'; nth?: number; keep?: string[] }[] = [
    { rel: 'modules/request/components/request-create-dialog.tsx', width: 1100, height: 'fixed' },
    { rel: 'modules/request/components/request-detail-dialog.tsx', width: 1100, height: 'fixed', keep: ['recordMissingContentClass'] },
    { rel: 'modules/workflow/components/workflow-editor-dialog.tsx', width: 1100, height: 'fixed' },
    { rel: 'modules/workflow/components/workflow-view-dialog.tsx', width: 768, height: 'content' },
    { rel: 'modules/employee/components/employee-view-drawer.tsx', width: 1100, height: 'fixed' },
    { rel: 'modules/profile/components/profile-drawer.tsx', width: 1100, height: 'fixed', keep: ['outline-none'] },
    { rel: 'modules/employee/components/edit-employee-dialog.tsx', width: 1100, height: 'content' },
    { rel: 'modules/employee/components/resign-modal.tsx', width: 1100, height: 'content' },
    { rel: 'modules/ticket/components/create-ticket-drawer.tsx', width: 1100, height: 'content' },
    { rel: 'modules/ticket/components/edit-ticket-drawer.tsx', width: 1100, height: 'content' },
    { rel: 'modules/asset/components/asset-form-drawer.tsx', width: 1100, height: 'fixed' },
    { rel: 'modules/report/components/access-members-cards.tsx', width: 1100, height: 'content', keep: ['gap-4'] },
    { rel: 'modules/email-templates/pages/index.tsx', width: 768, height: 'content', nth: 0 },
];

test('large dialogs whose content changes while open keep one height; the rest grow with their content', () => {
    for (const { rel, height, nth, keep = [] } of LARGE) {
        const tag = resolvedTag(rel, nth);
        const fixed = tag.includes(`h-[${CAP}]`) && !tag.includes(`max-h-[${CAP}]`);
        assert.equal(fixed, height === 'fixed', `${rel}: ${height} height`);
        for (const extra of keep) assert.ok(tag.includes(extra), `${rel}: keeps ${extra}`);
    }
});

test('every large dialog is 1100 or 768 wide with the gutter and the shared cap', () => {
    for (const { rel, width, nth } of LARGE) {
        const tag = resolvedTag(rel, nth);
        assert.ok(tag.includes(`max-w-[${width}px]`), `${rel}: ${width} wide`);
        assert.ok(tag.includes('w-[calc(100vw-2rem)]'), `${rel}: 16px gutter`);
        assert.ok(tag.includes(CAP), `${rel}: shared height cap`);
        for (const old of [/max-w-\[(760|820|880|896|980|1080)px\]/, /max-w-4xl/, /w-\[96vw\]/, /(?<![\w-])w-full/, /(88|90|92)dvh/, /min\(760px/]) {
            assert.doesNotMatch(tag, old, `${rel}: still has ${old}`);
        }
    }
});

test('the resign form keeps the calendar visible', () => {
    assert.doesNotMatch(resolvedTag('modules/employee/components/resign-modal.tsx'), /overflow-hidden/);
});

test('the template editor keeps its own size', () => {
    assert.match(resolvedTag('modules/email-templates/pages/index.tsx', 1), /min\(1500px,92vw\)/);
});

test('large and medium content-height classes share the fixed class cap and gutter', () => {
    const fixed = classOf('focusDialogContentClass');
    for (const t of [`h-[${CAP}]`, 'w-[calc(100vw-2rem)]', 'max-w-[1100px]']) assert.ok(fixed.includes(t), `fixed: ${t}`);
    const shared = ['!flex', `max-h-[${CAP}]`, 'w-[calc(100vw-2rem)]', 'flex-col', 'gap-0', 'overflow-hidden', 'p-0'];
    const large = classOf('largeDialogContentClass');
    const medium = classOf('mediumDialogContentClass');
    for (const t of shared) {
        assert.ok(large.includes(t), `large: ${t}`);
        assert.ok(medium.includes(t), `medium: ${t}`);
    }
    assert.ok(large.includes('max-w-[1100px]'), 'large: 1100');
    assert.ok(medium.includes('max-w-[768px]'), 'medium: 768');
    assert.ok(!large.some((t) => t.startsWith('h-[')) && !medium.some((t) => t.startsWith('h-[')), 'content height, no fixed h');
});
