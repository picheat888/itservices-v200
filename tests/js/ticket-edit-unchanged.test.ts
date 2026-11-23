// Saving the ticket edit window with nothing changed goes back to the ticket's detail without a confirm or a request (TC-TKT-02-05).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const drawer = readFileSync(new URL('../../resources/js/modules/ticket/components/edit-ticket-drawer.tsx', import.meta.url), 'utf8');
const submit = drawer.slice(drawer.indexOf('const submit = async () => {'), drawer.indexOf('const uploading ='));

test('the save button can be pressed before anything is changed', () => {
    assert.match(drawer, /<SaveButton onClick=\{submit\} loading=\{saving\}>/);
});

test('saving with nothing changed lands on the detail before any check, confirm or request', () => {
    const early = submit.indexOf('if (!isDirty) {');
    assert.ok(early > 0);
    assert.match(submit.slice(early), /^if \(!isDirty\) \{\s*\(onSaved \?\? onClose\)\(\);\s*return;\s*\}/);
    for (const later of ["t('ticket_err_subject')", 'confirmEdit(', 'update.mutateAsync(']) assert.ok(submit.indexOf(later) > early, later);
});

test('a change is always confirmed before it is saved', () => {
    assert.match(submit, /if \(!\(await confirmEdit\(\{ name: ticket\.subject, sub: ticket\.ticket_no \}\)\)\) return;/);
});
