// REQ-5, REQ-7, REQ-10, REQ-11: edit gated by workflows.manage, decisions name their step, touch-size editor buttons, IT step only when present.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requests as en } from '../../resources/js/lang/en/requests.ts';
import { requests as th } from '../../resources/js/lang/th/requests.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('resources/js/modules/workflow/pages/index.tsx');
const view = read('resources/js/modules/workflow/components/workflow-view-dialog.tsx');
const editor = read('resources/js/modules/workflow/components/workflow-editor-dialog.tsx');

test('only workflows.manage sees Edit, and an ?edit= link without it opens the view', () => {
    assert.match(page, /const canManage = can\('workflows\.manage'\)/);
    assert.match(page, /\{canManage && \(\s*<Button variant="outline" size="sm" onClick=\{\(\) => open\('edit', wf\.id\)\}>/);
    assert.match(page, /const editing = canManage \? byId\(editingId\) : null;/);
    assert.match(page, /onEdit=\{canManage \? \(w\) => open\('edit', w\.id\) : undefined\}/);
    assert.match(view, /onEdit\?: \(w: Workflow\) => void;/);
    assert.match(view, /\{onEdit && \(/);
});

test('the view names the IT step only when the workflow has one', () => {
    assert.match(view, /const hasCompletion = wf\.steps\.some\(\(s\) => s\.kind === 'completion'\);/);
    assert.match(view, /hasCompletion \? `\$\{stepsValue\} \+ \$\{t\('wf_completion_role'\)\}` : stepsValue/);
});

test('editor buttons grow on touch screens only', () => {
    assert.match(editor, /touch:size-10 flex h-6 w-7/);
    assert.match(editor, /hover:text-destructive touch:size-8/);
});

test('a decision sends the step it was opened on, and the refusal reads in both languages', () => {
    const dialog = read('resources/js/modules/request/components/decision-dialog.tsx');
    // The whole request is kept from the moment the dialog opened, so a refetch cannot move it (or its heading) on
    assert.match(dialog, /kept\?\.key === openKey && currentStepOf\(kept\.request\) \? kept : \{ key: openKey, request, action \}/);
    assert.match(dialog, /const stepId = currentStepOf\(ctx\.request\)\?\.id \?\? 0;/);
    assert.match(read('resources/js/modules/request/api/requestApi.ts'), /\{ step_id: stepId, note: note \|\| null \}/);
    assert.equal(th.req_refusal_step_moved, 'ขั้นนี้มีการตัดสินไปแล้ว โหลดหน้าใหม่แล้วลองอีกครั้ง');
    assert.equal(en.req_refusal_step_moved, 'This step has already been decided. Reload and try again.');
});

test('the test preview says a ticket opens only when the workflow opens one', () => {
    assert.match(editor, /<ResolvedRow key=\{i\} row=\{row\} autoTicket=\{autoTicket\} t=\{t\} \/>/);
    assert.match(editor, /\? t\(autoTicket \? 'wf_queue_preview' : 'wf_queue_preview_manual'\)/);
    for (const lang of ['th', 'en']) assert.match(read(`resources/js/lang/${lang}/workflow.ts`), /wf_queue_preview_manual: '/);
});
