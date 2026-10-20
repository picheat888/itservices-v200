// Settings lists keep their add/edit dialog in the URL (?add=1, ?edit=<id>) like the asset and contract pages (B1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

test('the list dialog hook holds add and edit in the URL through the page-dialog history', () => {
    const src = read('modules/settings/hooks/use-list-dialog.ts');
    assert.match(src, /export function useListDialog</);
    assert.match(src, /usePageDialogs\(\)/);
    assert.match(src, /'add'/);
    assert.match(src, /'edit'/);
});

test('the six master-data lists open their dialogs through the URL, not page state', () => {
    const src = read('modules/settings/pages/index.tsx');
    assert.doesNotMatch(src, /const \[addOpen, setAddOpen\] = useState/, 'add dialog in page state');
    assert.doesNotMatch(src, /const \[edit[A-Z]\w*, setEdit[A-Z]\w*\] = useState/, 'edit dialog in page state');
    assert.equal((src.match(/useListDialog\(/g) ?? []).length, 6, 'brands, models, categories, vendors, warehouses, locations');
});

test('lookup lists and request data lists open their dialogs through the URL too', () => {
    for (const rel of ['modules/settings/components/lookup-section.tsx', 'modules/settings/components/request-data-section.tsx']) {
        const src = read(rel);
        assert.match(src, /useListDialog\(/, `${rel}: useListDialog`);
        assert.doesNotMatch(src, /useState<(LookupItem|RequestOption) \| null>/, `${rel}: edit dialog in state`);
        assert.doesNotMatch(src, /const \[(addOpen|adding), set(AddOpen|Adding)\] = useState/, `${rel}: add dialog in state`);
    }
});
