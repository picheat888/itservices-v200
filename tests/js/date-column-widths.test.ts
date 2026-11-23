// Every table column that prints a date takes its width from the date setting, so a long format (month names, 12-hour clock) never spills into the next column.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../resources/js/', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Each `{ key: '…', header: … }` table column literal in a file, with the line it starts on. */
function columnsOf(src: string): { key: string; block: string; line: number }[] {
    const columns = [];
    for (const match of src.matchAll(/\{\s*key:\s*'([^']+)'/g)) {
        let depth = 0;
        let end = match.index;
        for (; end < src.length; end++) {
            if (src[end] === '{') depth++;
            else if (src[end] === '}' && --depth === 0) break;
        }
        const block = src.slice(match.index, end + 1);
        if (/\bheader:/.test(block)) columns.push({ key: match[1], block, line: src.slice(0, match.index).split('\n').length });
    }
    return columns;
}

test('stock requests and movements print the date over the time', () => {
    assert.match(read('modules/stock/pages/tabs/requests-tab.tsx'), /<DateTimeCell value=\{r\.created_at\}/);
    assert.match(read('modules/stock/pages/tabs/movements-tab.tsx'), /<DateTimeCell value=\{m\.moved_at\}/);
});

test("a stock request's approver and fulfiller columns fit their one-line date and time", () => {
    const src = read('modules/stock/pages/tabs/requests-tab.tsx');
    assert.match(src, /const (\w+) = useDateColumnWidth\('text-xs', \{ oneLine: true \}\)/);
    const oneLine = src.match(/const (\w+) = useDateColumnWidth\('text-xs', \{ oneLine: true \}\)/)![1];
    for (const key of ['decided', 'fulfilled']) {
        const column = columnsOf(src).find((c) => c.key === key)!;
        assert.match(column.block, new RegExp(`width: \`max\\(176px, \\$\\{${oneLine}\\}\\)\``), key);
    }
});
