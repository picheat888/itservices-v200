// Table cells wrap text too long for them instead of spilling into the next column; only values of a known width stay on one line.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../resources/js/${path}`, import.meta.url), 'utf8');

/** The `{ key: '…', header: … }` column literal with this key, the first one at or after `from`. */
function column(src: string, key: string, from = 0): string {
    const start = src.indexOf(`key: '${key}'`, from);
    assert.ok(start >= 0, key);
    let depth = 1;
    let end = start;
    for (; end < src.length; end++) {
        if (src[end] === '{') depth++;
        else if (src[end] === '}' && --depth === 0) break;
    }
    return src.slice(start, end);
}

/** A column's own settings, before its render function. */
const settings = (block: string) => block.slice(0, block.indexOf('render:'));

test('a data cell of a table with column widths breaks a long word rather than spill over its border', () => {
    const src = read('shared/components/data-table.tsx');
    assert.match(src, /const fixedLayout = columns\.some\(\(c\) => c\.width\);/);
    assert.match(src, /fixedLayout && 'table-fixed'/);
    // A table without widths sizes columns to their text, so its codes and emails stay whole
    assert.match(src, /'px-\[var\(--row-px\)\] py-\[var\(--row-py\)\]',\s*fixedLayout && '\[overflow-wrap:anywhere\]',/);
    assert.doesNotMatch(src, /py-\[var\(--row-py\)\] \[overflow-wrap:anywhere\]/);
});

test('only column headings are kept on one line; a row heading wraps like any cell', () => {
    const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');
    assert.match(css, /table thead th,\s*table th\[scope='col'\] \{\s*white-space: nowrap;\s*\}/);
    assert.doesNotMatch(css, /\n\s*table th \{\s*white-space: nowrap;/);
});

test('a long contract number wraps in a wider column, and the billing cycle sits under the value', () => {
    const src = read('modules/contract/pages/index.tsx');
    const code = column(src, 'code');
    assert.match(code, /width: '140px'/);
    assert.doesNotMatch(settings(code), /whitespace-nowrap/);
    const value = column(src, 'value');
    assert.doesNotMatch(settings(value), /whitespace-nowrap/);
    assert.match(value, /cycleSuffix\(c\.billing_cycle, t\)/);
    assert.match(value, /<div className="text-muted-foreground text-\[11px\]">\{cycle\}<\/div>/);
    const total = column(src, 'total');
    assert.doesNotMatch(settings(total), /whitespace-nowrap/);
    // "฿11,000,000,000.00" is about 109px of text-xs: 140px leaves 112px
    assert.match(value, /width: '140px'/);
    assert.match(total, /width: '140px'/);
});

test('free-text codes and money amounts are not forced onto one line', () => {
    const stock = read('modules/stock/pages/index.tsx');
    for (const key of ['sku', 'current', 'cost', 'value']) assert.doesNotMatch(settings(column(stock, key)), /whitespace-nowrap/, `stock ${key}`);
    const movements = read('modules/stock/pages/tabs/movements-tab.tsx');
    for (const key of ['unit_cost', 'value']) assert.doesNotMatch(settings(column(movements, key)), /whitespace-nowrap/, `movement ${key}`);
    const employees = read('modules/employee/pages/index.tsx');
    const directoryCode = employees.lastIndexOf("key: 'code'", employees.indexOf("header: t('tbl_emp_id')"));
    assert.doesNotMatch(settings(column(employees, 'code', directoryCode)), /whitespace-nowrap/, 'employee code');
});

test("the request list's approval track takes the room its column has left, so the count stays clear of the next column", () => {
    const mini = read('modules/request/components/workflow-mini.tsx');
    assert.match(mini, /fit \? 'min-w-0 flex-1' : 'w-24 shrink-0'/);
    const list = read('modules/request/pages/index.tsx');
    assert.match(column(list, 'workflow'), /<WorkflowMini request=\{r\} fit \/>/);
    // The waiting-for-you list keeps a fixed track so its rows line up
    assert.match(list, /^\s*<WorkflowMini request=\{r\} \/>$/m);
});

test('an asset or contract code heading a report row stays whole now that row headings may wrap', () => {
    const transfers = read('modules/report/components/transfer-cards.tsx');
    assert.match(transfers, /<Link to=\{href\} className=\{cn\(CODE_LINK, 'whitespace-nowrap'\)\} translate="no">\s*\{r\.code\}/);
    assert.match(transfers, /<span className="text-xs font-semibold whitespace-nowrap" translate="no">\s*\{r\.code\}/);
    const writeoffs = read('modules/report/components/writeoff-cards.tsx');
    assert.match(writeoffs, /<Link to=\{href\} className=\{cn\(CODE_LINK, 'whitespace-nowrap'\)\}>\s*\{c\.code\}/);
    assert.match(writeoffs, /<span className="text-xs font-semibold whitespace-nowrap">\{c\.code\}<\/span>/);
});
