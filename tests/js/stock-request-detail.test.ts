// Stock request detail (boards 11, 12): the step bar, the approved Lot preview, the row menu and the wiring on the Requests tab.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stock as en } from '../../resources/js/lang/en/stock.ts';
import { stock as th } from '../../resources/js/lang/th/stock.ts';
import { previewLotPicks, requestSteps } from '../../resources/js/modules/stock/lib/request-detail.ts';

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

test('the row menu: details always, the issue sheet when fulfilled, then a separator and the red cancel', () => {
    assert.match(menu, /MoreVertical/);
    const view = menu.indexOf("t('stock_rq_view_detail')");
    const print = menu.indexOf("t('stock_issue_print')");
    const cancel = menu.indexOf("t('stock_cancel_request')");
    assert.ok(view > 0 && print > view && cancel > print, 'details, print, cancel in that order');
    assert.match(menu, /request\.status === 'fulfilled' &&/);
    assert.match(menu, /issuePdfUrl\(request\.id\)/);
    assert.match(menu, /request\.can_cancel &&[\s\S]*<DropdownMenuSeparator \/>[\s\S]*text-destructive/);
});

test('every row opens the detail and carries the menu; row buttons keep their own click', () => {
    assert.match(tab, /onRowClick=\{/);
    assert.match(tab, /<RequestRowMenu request=\{r\} requestNo=\{requestNo\(r\)\} onOpen=\{openDetail\} onCancel=\{confirmCancel\} \/>/);
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
    ] as const;
    for (const key of keys) {
        assert.ok(th[key], `th ${key}`);
        assert.ok(en[key], `en ${key}`);
    }
});
