// UAT RQS-01-15, RQS-01-17: the New Request form catches a removed choice on Next and names every refused file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { requests as en } from '../../resources/js/lang/en/requests.ts';
import { requests as th } from '../../resources/js/lang/th/requests.ts';

const root = join(import.meta.dirname, '../../resources/js/modules/request');
const dialog = readFileSync(join(root, 'components/request-create-dialog.tsx'), 'utf8');
const hooks = readFileSync(join(root, 'hooks/use-requests.ts'), 'utf8');

test('Next on the details step loads the picked lists again before checking them', () => {
    assert.match(
        hooks,
        /export const reloadRequestFieldOptions = \(qc: QueryClient, type: string, field: string\) =>\s*qc\.fetchQuery\(\{[^}]*staleTime: 0 \}\)/,
    );
    assert.match(dialog, /const goToStep = async \(target: number\) => \{/);
    assert.match(dialog, /if \(step <= 1 && clamped > 1\) await reloadPickedLists\(\);\s*const all = buildErrors\(\);/);
    // Only the lists of fields that hold a pick and were loaded before
    assert.match(
        dialog,
        /\.filter\(\s*\(f\) => \(fields\[f\.key\] \?\? ''\)\.trim\(\) !== '' && queryClient\.getQueryData\(requestFieldOptionsKey\(type \?\? '', f\.key\)\) !== undefined,?\s*\)/,
    );
});

test('a choice removed after Next comes back from the server as the same words', () => {
    assert.match(dialog, /message === 'item_removed'\s*\? t\('cmn_item_removed'\)/);
});

test('every refused file gets its own line with its name', () => {
    assert.match(dialog, /const fileIndex = \/\^files\\\.\(\\d\+\)\$\/\.exec\(key\);/);
    assert.match(dialog, /fileLines\.push\(fileLine\(files\[Number\(fileIndex\[1\]\)\]\?\.name \?\? '', msgs\[0\] \?\? ''\)\);/);
    // A refusal of the whole list (too many files) stays, above the per-file lines
    assert.match(dialog, /if \(fileLines\.length\) serverErrs\.files = \[serverErrs\.files, \.\.\.fileLines\]\.filter\(Boolean\)\.join\('\\n'\);/);
    assert.match(dialog, /\{err\.files\.split\('\\n'\)\.map\(\(line, i\) => \(/);
    for (const code of ['file_too_large', 'file_type', 'file_upload_failed']) assert.match(dialog, new RegExp(`${code}: 'req_file_`));
});

test('the file refusal words exist in both languages and name the file', () => {
    for (const dict of [th, en]) {
        for (const key of ['req_file_too_large', 'req_file_bad_type', 'req_file_upload_failed'] as const) {
            assert.ok(dict[key].includes('{name}'), key);
        }
        assert.ok(dict.req_file_too_large.includes('{mb}'));
    }
    assert.equal(th.req_file_too_large.replace('{name}', 'uat-11mb.pdf').replace('{mb}', '10'), 'uat-11mb.pdf ใหญ่เกิน 10MB');
});
