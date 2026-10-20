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
