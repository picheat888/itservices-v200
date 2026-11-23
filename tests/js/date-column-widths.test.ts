// Every table column that prints a date takes its width from the date setting, so a long format (month names, 12-hour clock) never spills into the next column.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../resources/js/', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name: string) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return tsxFiles(path);
        return path.endsWith('.tsx') ? [path] : [];
    });
}

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

test('every table column that prints a date is as wide as the date setting needs', () => {
    const fixedWidth: string[] = [];
    for (const file of [...tsxFiles(join(root, 'modules')), ...tsxFiles(join(root, 'shared'))]) {
        const src = readFileSync(file, 'utf8');
        const measured = [...src.matchAll(/const (\w+) = useDateColumnWidth\(/g)].map((m) => m[1]);
        for (const column of columnsOf(src)) {
            if (!/fmt\.(date|dateTime)\(|<DateTimeCell\b/.test(column.block)) continue;
            const width = column.block.match(/\bwidth:\s*([^\n]+)/)?.[1];
            if (width && !measured.some((name) => new RegExp(`\\b${name}\\b`).test(width))) {
                fixedWidth.push(`${relative(root, file)}:${column.line} ${column.key} ${width}`);
            }
        }
    }
    assert.deepEqual(fixedWidth, []);
});

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
