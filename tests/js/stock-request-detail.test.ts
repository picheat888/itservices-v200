// Stock request detail (boards 11, 12): the step bar, the approved Lot preview, the row menu and the wiring on the Requests tab.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stock as en } from '../../resources/js/lang/en/stock.ts';
import { stock as th } from '../../resources/js/lang/th/stock.ts';
import { toPickableLots } from '../../resources/js/modules/stock/lib/lot-pick.ts';
import { previewLotPicks, REQ_TONE, requestSteps, shownRequest } from '../../resources/js/modules/stock/lib/request-detail.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const tab = read('resources/js/modules/stock/pages/tabs/requests-tab.tsx');
const menu = read('resources/js/modules/stock/components/request-row-menu.tsx');
const dialog = read('resources/js/modules/stock/components/request-detail-dialog.tsx');
const page = read('resources/js/modules/stock/pages/index.tsx');

const base = {
    status: 'pending' as const,
    requester_name: 'Somchai K',
    requester_name_th: null,
    created_at: '2026-10-27T16:10:00',
    approver_name: null,
    approver_name_th: null,
    approved_at: null,
    rejected_at: null,
    fulfilled_by: null,
    fulfilled_by_th: null,
    fulfilled_at: null,
    issue_doc_no: null,
    cancelled_by: null,
    cancelled_at: null,
};
const nameOf = (name: string | null) => name;
const states = (steps: ReturnType<typeof requestSteps>) => steps.map((s) => s.state);

test('pending waits on approval', () => {
    const steps = requestSteps(base, nameOf);
    assert.deepEqual(states(steps), ['done', 'now', 'wait']);
    assert.deepEqual([steps[0].who, steps[0].when], ['Somchai K', '2026-10-27T16:10:00']);
});

test('approved waits on the issue; fulfilled names the ISS on the last step', () => {
    const approved = { ...base, status: 'approved' as const, approver_name: 'Anan P', approved_at: '2026-10-28T09:00:00' };
    assert.deepEqual(states(requestSteps(approved, nameOf)), ['done', 'done', 'now']);
    const done = requestSteps(
        { ...approved, status: 'fulfilled' as const, fulfilled_by: 'Picheat S', fulfilled_at: '2026-10-28T10:42:00', issue_doc_no: 'ISS-2026-0502' },
        nameOf,
    );
    assert.deepEqual(states(done), ['done', 'done', 'done']);
    assert.deepEqual([done[2].who, done[2].when, done[2].doc], ['Picheat S', '2026-10-28T10:42:00', 'ISS-2026-0502']);
});

test('a rejected request closes on the approval step with who and when', () => {
    const steps = requestSteps({ ...base, status: 'rejected', approver_name: 'Anan P', rejected_at: '2026-10-28T09:05:00' }, nameOf);
    assert.deepEqual(states(steps), ['done', 'closed', 'wait']);
    assert.deepEqual([steps[1].closedAs, steps[1].who, steps[1].when], ['rejected', 'Anan P', '2026-10-28T09:05:00']);
});

test('a cancelled request closes where it stopped', () => {
    const cancelled = { ...base, status: 'cancelled' as const, cancelled_by: 'Anan P', cancelled_at: '2026-10-28T11:00:00' };
    const beforeApproval = requestSteps(cancelled, nameOf);
    assert.deepEqual(states(beforeApproval), ['done', 'closed', 'wait']);
    assert.deepEqual([beforeApproval[1].closedAs, beforeApproval[1].who], ['cancelled', 'Anan P']);
    const afterApproval = requestSteps({ ...cancelled, approver_name: 'Anan P', approved_at: '2026-10-28T09:00:00' }, nameOf);
    assert.deepEqual(states(afterApproval), ['done', 'done', 'closed']);
    assert.equal(afterApproval[2].when, '2026-10-28T11:00:00');
});

test('the approved preview fills the largest warehouse first, then its oldest lots', () => {
    const balances = [
        { warehouse: 'คลังอาคาร B', qty: 10 },
        { warehouse: 'คลังกลาง IT', qty: 27 },
    ];
    const lots = [
        { lot_id: 3, lot_no: 'LOT-20260930-0001', warehouse: 'คลังกลาง IT', received_at: '2026-09-30', remaining: 21 },
        { lot_id: 2, lot_no: 'LOT-20260812-0003', warehouse: 'คลังกลาง IT', received_at: '2026-08-12', remaining: 6 },
        { lot_id: 4, lot_no: 'LOT-20260101-0001', warehouse: 'คลังอาคาร B', received_at: '2026-01-01', remaining: 10 },
    ];
    assert.deepEqual(
        previewLotPicks(balances, lots, 10).map((p) => [p.warehouse, p.lot_no, p.take]),
        [
            ['คลังกลาง IT', 'LOT-20260812-0003', 6],
            ['คลังกลาง IT', 'LOT-20260930-0001', 4],
        ],
    );
    assert.deepEqual(
        previewLotPicks(balances, lots, 30).map((p) => [p.warehouse, p.take]),
        [
            ['คลังกลาง IT', 6],
            ['คลังกลาง IT', 21],
            ['คลังอาคาร B', 3],
        ],
    );
});

test('the detail shows the fresh request only once it was read after the row it opened from', () => {
    const row = { id: 7, status: 'fulfilled' };
    const cachedApproved = { id: 7, status: 'approved' };
    assert.equal(shownRequest(row, 2000, cachedApproved, 1000), row, 'an older cached copy never overrides the row');
    assert.equal(shownRequest(row, 2000, { id: 7, status: 'fulfilled' }, 3000).status, 'fulfilled');
    const refetched = { id: 7, status: 'fulfilled' };
    assert.equal(shownRequest(row, 2000, refetched, 2000), refetched);
    assert.equal(shownRequest(row, 2000, { id: 8, status: 'pending' }, 3000), row, 'another request never shows');
    assert.equal(shownRequest(row, 2000, undefined, 0), row);
    assert.equal(shownRequest(null, 0, undefined, 0), null);
});

test('one tone map and one lot mapping serve the tab, the fulfil seed and the detail', () => {
    assert.equal(REQ_TONE.cancelled, 'gray');
    assert.deepEqual(
        toPickableLots({ lots: [{ id: 2, lot_no: 'LOT-20260812-0003', warehouse: 'คลังกลาง IT', received_at: null, qty_remaining: 6 }] }),
        [{ lot_id: 2, lot_no: 'LOT-20260812-0003', warehouse: 'คลังกลาง IT', received_at: '', remaining: 6 }],
    );
    assert.deepEqual(toPickableLots(undefined), []);
    for (const src of [tab, dialog]) {
        assert.doesNotMatch(src, /const REQ_TONE/);
        assert.match(src, /REQ_TONE\[/);
    }
    assert.match(tab, /toPickableLots\(fulfillItem\)/);
    assert.match(dialog, /toPickableLots\(/);
});

test('serial items skip the Lot preview when approved; the read-only detail never raises an alert', () => {
    assert.match(dialog, /track_serial \?/);
    assert.match(dialog, /t\('stock_rq_serial_lot_note'\)/);
    assert.doesNotMatch(dialog, /FormErrorBanner/);
    assert.doesNotMatch(dialog, /role="alert"/);
});

test('the row menu: details always, the issue sheet when fulfilled, then a separator and the red cancel', () => {
    assert.match(menu, /MoreVertical/);
    const view = menu.indexOf("t('stock_rq_view_detail')");
    const print = menu.indexOf("t('stock_issue_print')");
    const cancel = menu.indexOf("t('stock_cancel_request')");
    assert.ok(view > 0 && print > view && cancel > print, 'details, print, cancel in that order');
    assert.match(menu, /request\.status === 'fulfilled' && request\.issue_doc_no &&/, 'no ISS, no issue sheet to print');
    assert.match(menu, /issuePdfUrl\(request\.id\)/);
    assert.match(menu, /request\.can_cancel &&[\s\S]*<DropdownMenuSeparator \/>[\s\S]*text-destructive/);
});

test('every row opens the detail and carries the menu; row buttons keep their own click', () => {
    assert.match(tab, /onRowClick=\{/);
    // The menu hands over its button, where focus returns when the detail closes
    assert.match(
        tab,
        /<RequestRowMenu[\s\S]*?onOpen=\{\(row, trigger\) => \{\s*rememberOrigin\(trigger\);\s*openDetail\(row\);[\s\S]*?onCancel=\{confirmCancel\}/,
    );
    assert.doesNotMatch(tab, /\{r\.can_cancel && <RequestRowMenu/);
    assert.equal(tab.match(/e\.stopPropagation\(\)/g)?.length, 3, 'approve, reject and fulfil');
    assert.match(menu, /stopPropagation/);
    assert.match(tab, /r\.issue_doc_no &&/);
});

test('the detail is a 768 dialog that reuses the tab actions, and the fulfil done screen opens it', () => {
    assert.match(dialog, /mediumDialogContentClass/);
    assert.match(dialog, /<FocusDialogHeader/);
    assert.match(dialog, /<DialogBody/);
    assert.match(dialog, /<DialogFooterBar/);
    assert.match(dialog, /useRequestTrail\(/);
    assert.match(dialog, /previewLotPicks\(/);
    assert.doesNotMatch(dialog, /useStockRequestActions/, 'actions come from the tab');
    assert.match(tab, /onViewRequest=\{\(\) => viewFulfilled\(fulfillReq\)\}/);
    assert.match(page, /initialRequestId=\{returnRequestId\}/);
});

test('every detail word exists in both languages', () => {
    const keys = [
        'stock_rq_view_detail',
        'stock_rq_detail_title',
        'stock_rq_asked',
        'stock_rq_stock_now',
        'stock_rq_lots_to_pick',
        'stock_rq_pick_note',
        'stock_rq_issue_sheet',
        'stock_rq_issued_at',
        'stock_rq_issued_by',
        'stock_rq_returns_title',
        'stock_rq_return_doc_no',
        'stock_rq_returned_at',
        'stock_rq_returned_by',
        'stock_rq_can_return_n',
        'stock_rq_return_from_this',
        'stock_rq_awaiting_fulfil',
        'stock_rq_serial_lot_note',
        'stock_rq_step_done',
        'stock_rq_step_now',
        'stock_rq_step_wait',
        'stock_return_seed_nothing_left',
        'stock_refusal_return_before_issue',
    ] as const;
    for (const key of keys) {
        assert.ok(th[key], `th ${key}`);
        assert.ok(en[key], `en ${key}`);
    }
});

test('each step says its state to screen readers; a request with no ISS has no issue sheet to print', () => {
    assert.match(dialog, /STATE\[s\.state\] && <span className="sr-only">/);
    assert.match(dialog, /r\.status === 'fulfilled' && r\.issue_doc_no &&/);
});

test('requests tab: the three name columns are wide enough for a full name', () => {
    const col = (key: string) => tab.match(new RegExp(`key: '${key}',[\\s\\S]*?width: '(\\d+)px'`))?.[1];
    assert.equal(col('requester'), '180');
    assert.equal(col('decided'), '176');
    assert.equal(col('fulfilled'), '176');
    assert.equal(col('qty'), '64');
    assert.equal(col('unit'), '80');
    assert.equal(col('status'), '96');
    assert.match(tab, /key: 'item',[^}]*minWidth: '11rem'/);
    assert.match(tab, /key: 'reason', header: t\('stock_reason'\), minWidth: '9rem'/);
});

test('approve is the shared green in both the row and the request detail', () => {
    assert.match(dialog, /<Button className=\{REQUEST_APPROVE_BUTTON\} onClick=\{\(\) => onApprove\(r\)\}>/);
    assert.match(tab, /className=\{REQUEST_APPROVE_BUTTON\}/);
    assert.doesNotMatch(tab, /bg-emerald-700 text-white/);
});

test('count screens show the opener and confirmer in the reader language', () => {
    const files = [
        'resources/js/modules/stock/pages/tabs/counting-tab.tsx',
        'resources/js/modules/stock/components/count/count-sheet-dialog.tsx',
        'resources/js/modules/stock/components/count/count-done-dialog.tsx',
    ].map(read);
    for (const src of files) {
        assert.match(src, /counted_by_th/);
    }
    assert.match(files[2], /committed_by_th/);
});
