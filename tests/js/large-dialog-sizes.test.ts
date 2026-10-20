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
