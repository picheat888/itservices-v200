// UAT DSH-03-02, 04-02, 05-02: a folding Dashboard card folds as soon as it passes its top count (11 people, 6 request types, 11 departments).
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

test('the department, workload and request-type cards spare no row', () => {
    assert.match(read('modules/dashboard/components/people-section.tsx'), /fold\(hr\.by_department, DEPARTMENTS_TOP, open, 0\);/);
    assert.match(read('modules/dashboard/components/workload-card.tsx'), /fold\(it\.workload, WORKLOAD_TOP, open, 0\);/);
    assert.match(read('modules/dashboard/components/requests-section.tsx'), /fold\(requests\.by_type, TYPES_TOP, open, 0\);/);
});

test('the top counts are the ones the test book names', () => {
    assert.match(read('modules/dashboard/components/people-section.tsx'), /const DEPARTMENTS_TOP = 10;/);
    assert.match(read('modules/dashboard/components/workload-card.tsx'), /const WORKLOAD_TOP = 10;/);
    assert.match(read('modules/dashboard/components/requests-section.tsx'), /const TYPES_TOP = 5;/);
});
