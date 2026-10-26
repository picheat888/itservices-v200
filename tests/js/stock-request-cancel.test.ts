// Stock request cancel on the Requests tab: the row menu, the confirm words and the cancelled status everywhere it is named.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { notification as enNotif } from '../../resources/js/lang/en/notification.ts';
import { permission as enPerm } from '../../resources/js/lang/en/permission.ts';
import { stock as en } from '../../resources/js/lang/en/stock.ts';
import { notification as thNotif } from '../../resources/js/lang/th/notification.ts';
import { permission as thPerm } from '../../resources/js/lang/th/permission.ts';
import { stock as th } from '../../resources/js/lang/th/stock.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const tab = read('resources/js/modules/stock/pages/tabs/requests-tab.tsx');

test('the row menu shows only where the server allows a cancel', () => {
    assert.match(tab, /\{r\.can_cancel && <RequestRowMenu /);
    assert.match(tab, /cancel\.mutateAsync\(r\.id\)/);
});

test('cancelled is a status the filter offers and the badge colours grey', () => {
    assert.match(tab, /REQUEST_STATUS_FILTERS: StockRequestStatus\[\] = \[[^\]]*'cancelled'\]/);
    assert.match(tab, /cancelled: 'gray'/);
});

test('the confirm speaks of cancelling, not deleting', () => {
    assert.match(tab, /busyText: t\('stock_cancel_busy'\)/);
    assert.match(tab, /doneText: t\('stock_cancel_done'\)/);
    assert.match(tab, /cancelText: t\('close'\)/);
});

test('every cancel word exists in both languages', () => {
    const keys = [
        'stock_rq_cancelled',
        'stock_cancel_request',
        'stock_cancel_confirm',
        'stock_cancel_note_pending',
        'stock_cancel_note_approved',
        'stock_cancel_notify',
        'stock_cancelled_by',
        'stock_cancel_busy',
        'stock_cancel_done',
        'stock_refusal_request_not_cancellable',
    ] as const;
    for (const key of keys) {
        assert.ok(th[key], `th ${key}`);
        assert.ok(en[key], `en ${key}`);
    }
    assert.ok(thPerm.audit_ev_cancelled_stock_request && enPerm.audit_ev_cancelled_stock_request);
    assert.ok(thNotif.notif_stock_req_cancelled && enNotif.notif_stock_req_cancelled);
});
