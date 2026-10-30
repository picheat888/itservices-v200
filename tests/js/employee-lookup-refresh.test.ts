// EMP-7: saving a section, department or position refreshes every list that shows it or counts it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js/modules/employee/hooks');
const invalidateBody = (file: string) => readFileSync(join(root, file), 'utf8').match(/const invalidate = \(\) => \{([\s\S]*?)\n {4}\};/)?.[1] ?? '';

test('a section change refreshes the departments, whose section count gates their delete', () => {
    const body = invalidateBody('use-sections.ts');
    for (const key of [/queryKey: \['sections'\]/, /queryKey: DEPT/, /queryKey: EMP/, /queryKey: \['employees-directory'\]/]) assert.match(body, key);
});

test('a department change refreshes its sections, the employee rows and the org chart', () => {
    const body = invalidateBody('use-departments.ts');
    for (const key of [
        /queryKey: DEPT/,
        /queryKey: \['sections'\]/,
        /queryKey: EMP/,
        /queryKey: \['employees-directory'\]/,
        /queryKey: \['org-chart'\]/,
    ]) {
        assert.match(body, key);
    }
});

test('a position change refreshes the employee rows and the org chart', () => {
    const body = invalidateBody('use-positions.ts');
    for (const key of [/queryKey: POS/, /queryKey: EMP/, /queryKey: \['employees-directory'\]/, /queryKey: \['org-chart'\]/]) assert.match(body, key);
});
