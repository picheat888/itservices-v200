// UAT DSH-05-02: every folding Dashboard card spares one row, so 12 departments fold to the top 10 like 12 people on the workload card.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('fold() spares one row by default', () => {
    const parts = read('modules/report/components/chart-parts.tsx');
    assert.match(
        parts,
        /export function fold<T>\(rows: T\[\], top: number, open: boolean, spare = 1\) \{\s*const folds = rows\.length > top \+ spare;/,
    );
});

test('the department, workload and request-type cards all use that default', () => {
    assert.match(read('modules/dashboard/components/people-section.tsx'), /fold\(hr\.by_department, DEPARTMENTS_TOP, open\);/);
    assert.match(read('modules/dashboard/components/workload-card.tsx'), /fold\(it\.workload, WORKLOAD_TOP, open\);/);
    assert.match(read('modules/dashboard/components/requests-section.tsx'), /fold\(requests\.by_type, TYPES_TOP, open\);/);
    assert.match(read('modules/dashboard/components/people-section.tsx'), /const DEPARTMENTS_TOP = 10;/);
});
