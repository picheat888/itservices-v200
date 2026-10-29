// STK-20: the "waiting to be issued" bell for stock issuers, its words and its two lines.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { email as enEmail } from '../../resources/js/lang/en/email.ts';
import { notification as en } from '../../resources/js/lang/en/notification.ts';
import { email as thEmail } from '../../resources/js/lang/th/email.ts';
import { notification as th } from '../../resources/js/lang/th/notification.ts';

const text = readFileSync(new URL('../../resources/js/modules/notification/lib/notification-text.ts', import.meta.url), 'utf8');

test('the bell says the approved words in both languages', () => {
    assert.equal(th.notif_stock_req_awaiting_fulfil, 'มีคำขอเบิกรอจ่ายอะไหล่');
    assert.equal(en.notif_stock_req_awaiting_fulfil, 'A stock request is waiting to be issued');
});

test('line 2 names the request no, item ×qty and requester', () => {
    for (const dict of [en, th]) {
        const line = dict.notif_stock_req_line;
        for (const slot of ['{reference}', '{item}', '×{qty}', '{requester}']) assert.ok(line.includes(slot), `${line} lacks ${slot}`);
    }
    assert.equal(th.notif_stock_req_line, '{reference} {item} ×{qty} ของ {requester}');
});

test('the awaiting bell leads with its sentence and follows with the request line', () => {
    assert.match(text, /subtype === 'awaiting_fulfil'\) return t\('notif_stock_req_awaiting_fulfil'\)/);
    assert.match(text, /t\('notif_stock_req_line'\)/);
});

test('the settings pages describe the new bell and mail in both languages', () => {
    for (const dict of [en, th]) {
        for (const key of [
            'notification_name_stock_req_awaiting_fulfil',
            'notification_when_stock_req_awaiting_fulfil',
            'notification_who_stock_req_awaiting_fulfil',
        ]) {
            assert.ok(dict[key], `${key} missing`);
        }
    }
    for (const dict of [enEmail, thEmail]) {
        assert.ok(dict.email_when_stock_request_awaiting_fulfil);
        assert.ok(dict.email_to_stock_request_awaiting_fulfil);
    }
});
