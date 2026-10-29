// Round 6 cleanup: payload type, swal/placeholder leftovers and a memoized useT exist in the source.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('contract payload type lists every notify flag', () => {
    const block = read('js/modules/contract/api/contractApi.ts').match(/interface ContractPayload[\s\S]*?\n\}/)?.[0] ?? '';
    for (const n of [150, 120, 90, 60, 45, 30, 7]) {
        assert.match(block, new RegExp(`notify_${n}[?]: boolean;`));
    }
});

test('no leftovers from sweetalert or the placeholder page', () => {
    assert.doesNotMatch(read('css/app.css'), /swal2/);
    assert.doesNotMatch(read('js/app/App.tsx'), /PlaceholderPage/);
    assert.equal(existsSync(join(root, 'js/app/placeholder.tsx')), false);
    for (const lang of ['en', 'th']) {
        assert.doesNotMatch(read(`js/lang/${lang}/common.ts`), /cmn_placeholder_/);
    }
});

test('useT returns one function per language', () => {
    assert.match(read('js/lang/index.ts'), /useCallback\([\s\S]*\[lang\]\)/);
});
