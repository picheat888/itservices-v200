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
    assert.match(src, /bg-muted\/50 rounded-lg border px-3\.5 py-2\.5/);
});

test('the frame returns focus to a row menu like every other dialog', () => {
    assert.match(frame(), /useMenuReturnFocus\(/);
});
