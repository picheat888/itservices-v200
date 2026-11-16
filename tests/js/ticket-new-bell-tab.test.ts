// UAT TKT-05-02: the "เคสใหม่ รอคนรับ" bell (and its toast and push) opens the case over the All tickets tab, like the new-case email.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const text = readFileSync(new URL('../../resources/js/modules/notification/lib/notification-text.ts', import.meta.url), 'utf8');

test('a new case opens with tab=all, before the general ticket rule', () => {
    const special = text.indexOf("if (n.data.type === 'ticket_new') return `/tickets?tab=all&view=${n.data.ticket_id}`;");
    const general = text.indexOf("if (n.data.type?.startsWith('ticket_')) return `/tickets?view=${n.data.ticket_id}`;");
    assert.ok(special > 0, 'ticket_new has its own target');
    assert.ok(general > special, 'the general ticket rule comes after it');
});
