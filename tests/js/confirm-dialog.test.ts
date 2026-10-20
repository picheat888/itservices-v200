// useConfirm and CenteredAlert: one centred frame in shared/ui/confirm-dialog.tsx.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const FILE = 'shared/ui/confirm-dialog.tsx';

const tsxFiles = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
    );

test('the centred frame lives in the confirm dialog file and the old path is gone', () => {
    assert.ok(!existsSync(join(root, 'shared/components/centered-alert.tsx')), 'old file deleted');
    const src = read(FILE);
    assert.match(src, /export function AlertIconCircle\b/);
    assert.match(src, /export function CenteredAlert\b/);
    const labels = ['// Round icon', '// Frame', '// useConfirm'].map((l) => src.indexOf(l));
    assert.ok(
        labels.every((at, i) => at >= 0 && (i === 0 || at > labels[i - 1])),
        'three labels in order',
    );
    for (const rel of ['modules', 'shared', 'app'].flatMap(tsxFiles)) {
        assert.doesNotMatch(read(rel), /shared\/components\/centered-alert/, `${rel}: old import path`);
    }
});

const part = (from: string, to: string) => {
    const src = read(FILE);
    return src.slice(src.indexOf(from), src.indexOf(to));
};
const frame = () => part('// Frame', '// useConfirm');

test('the round icon has a red tone for deletes', () => {
    const icon = part('// Round icon', '// Frame');
    assert.match(read(FILE), /export type AlertTone = 'brand' \| 'warn' \| 'danger'/);
    assert.match(icon, /bg-destructive\/15 text-destructive/);
});

test('the frame takes a tone, a record box, a first focus and an opener', () => {
    const props = frame().match(/export function CenteredAlert\(\{([\s\S]*?)\}: \{/)?.[1] ?? '';
    for (const p of ['tone', 'entity', 'initialFocus', 'opener']) assert.match(props, new RegExp(`\\b${p}\\b`), p);
});

test('the record box is read with the description, and written line breaks stay', () => {
    const src = frame();
    assert.match(src, /aria-describedby/);
    assert.match(src, /whitespace-pre-line/);
    const box = src.match(/id=\{entityId\} className="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    for (const t of ['bg-muted/50', 'rounded-lg', 'border', 'px-3.5', 'py-2.5']) assert.ok(box.includes(t), `record box: ${t}`);
});

test('a long record name ends in an ellipsis instead of widening the window', () => {
    // A grid child keeps min-width:auto, so truncate needs min-w-0 on the box
    const box =
        frame()
            .match(/id=\{entityId\} className="([^"]*)"/)?.[1]
            .split(/\s+/) ?? [];
    assert.ok(box.includes('min-w-0'), 'record box: min-w-0');
});

test('the record box id joins aria-describedby when the content node attaches, not in a later effect', () => {
    // Radix's portal mounts the content after the alert's own effects have run
    const src = frame();
    assert.match(src, /ref=\{attachContent\}/);
    const attach = src.slice(src.indexOf('const attachContent'), src.indexOf('};', src.indexOf('const attachContent')));
    assert.match(attach, /setAttribute\('aria-describedby'/);
    assert.doesNotMatch(src, /useEffect\(\(\) => \{\s*const content = contentRef\.current;\s*const desc/);
});

test('the frame returns focus to a row menu like every other dialog', () => {
    assert.match(frame(), /useMenuReturnFocus\(/);
});

const provider = () => {
    const src = read(FILE);
    return src.slice(src.indexOf('export function ConfirmProvider'));
};

test('useConfirm draws through the centred frame', () => {
    assert.doesNotMatch(read(FILE), /<DialogContent\b/);
    assert.match(provider(), /<CenteredAlert\b/);
});

test('each variant picks its icon colour', () => {
    const src = read(FILE);
    assert.match(src, /danger:\s*\{[^}]*tone:\s*'danger'/);
    assert.match(src, /edit:\s*\{[^}]*tone:\s*'brand'/);
    assert.match(src, /warn:\s*\{[^}]*tone:\s*'warn'/);
});

test('buttons split the row and the action keeps full colour while busy', () => {
    const src = provider();
    const action = src.match(/className="([^"]*disabled:opacity-100[^"]*)"/)?.[1].split(/\s+/) ?? [];
    for (const t of ['w-full', 'font-semibold']) assert.ok(action.includes(t), `action: ${t}`);
    const cancel = src.match(/<Button\s+ref=\{cancelRef\}[\s\S]*?className="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    assert.ok(cancel.includes('w-full'), 'cancel: w-full');
});

test('delete focuses Cancel, the window locks while working, failures and replaced prompts behave as before', () => {
    const src = provider();
    assert.match(src, /initialFocus=/);
    assert.match(src, /busy=\{loading \|\| done\}/);
    assert.match(src, /opts\.errorMessage\?\.\(e\) \?\? t\('cd_error'\)/);
    assert.match(src, /setTimeout\(\(\) => settle\(true\), 850\)/);
    assert.match(src, /closest[^(]*\('\[role="dialog"\]'\)/);
    assert.match(read(FILE), /resolver\.current\?\.\(false\)/);
});

test('permission save alerts keep the save button in full colour while saving and saved', () => {
    const FILES = [
        'modules/permission/pages/index.tsx',
        'modules/permission/components/group-roles-tab.tsx',
        'modules/permission/components/group-role-dialog.tsx',
    ];
    for (const rel of FILES) {
        const saving = (read(rel).match(/<CenteredAlert\b[\s\S]*?<\/CenteredAlert>/g) ?? []).filter((a) => /\bbusy=/.test(a));
        assert.ok(saving.length > 0, `${rel}: a save alert`);
        for (const alert of saving) {
            assert.doesNotMatch(alert, /Loader2/, `${rel}: hand-written spinner`);
            assert.match(alert, /<SaveButton\b/, `${rel}: SaveButton`);
            assert.match(alert, /disabled:opacity-100/, `${rel}: full colour while disabled`);
        }
    }
});
