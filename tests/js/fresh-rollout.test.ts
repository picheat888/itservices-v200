// Fresh-data rollout inventory: every wired dropdown, tab bar, dialog and edit form in scope uses the kit (source scan).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

type Site = {
    file: string;
    freshList?: number;
    freshView?: number;
    refresh?: number;
    marks?: number;
    openRefetch?: number;
    rebase?: number;
    seedOnce?: number;
    flagRemoved?: number;
    focus?: number;
};

const NEEDLES: Record<Exclude<keyof Site, 'file'>, string> = {
    freshList: '...FRESH_LIST',
    freshView: '...FRESH_VIEW',
    refresh: 'refresh={',
    marks: 'refresh: marks',
    openRefetch: 'useRefetchOnOpen(',
    rebase: 'useFormRebase(',
    seedOnce: 'useSeedOnce(',
    flagRemoved: 'flagRemoved',
    focus: 'refetchOnWindowFocus: true',
};

const SITES: Site[] = [
    { file: 'modules/settings/hooks/use-master-data.ts', freshList: 8 },
    { file: 'modules/employee/hooks/use-departments.ts', freshList: 1 },
    { file: 'modules/employee/hooks/use-positions.ts', freshList: 1 },
    { file: 'modules/employee/hooks/use-sections.ts', freshList: 1 },
    { file: 'modules/employee/hooks/use-locations.ts', freshList: 1 },
    { file: 'modules/ticket/hooks/use-tickets.ts', freshView: 2 },
    { file: 'modules/ticket/pages/index.tsx', marks: 1 },
];

const count = (text: string, needle: string) => text.split(needle).length - 1;

for (const site of SITES) {
    test(`${site.file} uses the fresh-data kit`, () => {
        const text = read(site.file);
        for (const key of Object.keys(NEEDLES) as (keyof typeof NEEDLES)[]) {
            const expected = site[key];
            if (expected !== undefined) {
                assert.equal(count(text, NEEDLES[key]), expected, `${key} (${NEEDLES[key]})`);
            }
        }
    });
}

test('employee search waits five seconds', () => {
    const text = read('modules/employee/hooks/use-employee-pickers.ts');
    assert.ok(text.includes('staleTime: FRESH_MS'));
    assert.ok(!text.includes('30_000'));
});
