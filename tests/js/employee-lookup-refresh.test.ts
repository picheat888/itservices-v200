// EMP-7: saving a section, department or position refreshes every list that shows it or counts it, and waits for them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js/modules/employee/hooks');
// The keys invalidate() refreshes, read from its Promise.all([...]) list
const invalidated = (file: string) => {
    const source = readFileSync(join(root, file), 'utf8');
    const list = source.match(
        /const invalidate = \(\) =>\s*Promise\.all\(\s*\[([\s\S]*?)\]\.map\(\(queryKey\) => qc\.invalidateQueries\(\{ queryKey \}\)\)/,
    )?.[1];
    assert.ok(list, `${file}: invalidate() returns Promise.all so a save waits for the refetch`);
    return list.replace(/\s+/g, ' ');
};

test('a section change refreshes the departments, whose section count gates their delete, and everything naming it', () => {
    const keys = invalidated('use-sections.ts');
    for (const key of ["['sections']", 'DEPT', 'EMP', "['employees-directory']", "['org-chart']", "['employee']"]) assert.ok(keys.includes(key), key);
});

test('a department change refreshes its sections, the employee rows, the employee view and the org chart', () => {
    const keys = invalidated('use-departments.ts');
    for (const key of ['DEPT', "['sections']", 'EMP', "['employees-directory']", "['org-chart']", "['employee']"]) assert.ok(keys.includes(key), key);
});

test('a position change refreshes the employee rows, the employee view and the org chart', () => {
    const keys = invalidated('use-positions.ts');
    for (const key of ['POS', 'EMP', "['employees-directory']", "['org-chart']", "['employee']"]) assert.ok(keys.includes(key), key);
});
