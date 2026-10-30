// Ticket desk buttons follow the server's gates: take, assign, forward and work on one case.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ticketActionFlags, type TicketActionGates } from '../../resources/js/modules/ticket/components/ticket-actions.ts';
import type { Ticket } from '../../resources/js/shared/types/index.ts';

const ME = 7;
const MY_EMPLOYEE = 70;
const ALL: TicketActionGates = { canTake: true, canResolve: true, canAssign: true, canForward: true, meId: ME, meEmployeeId: MY_EMPLOYEE };
const ticket = (fields: Partial<Ticket>) => ({ status: 'open', assignee_id: null, requester_id: 1, ...fields }) as Ticket;

test('an open unassigned case offers take and assign', () => {
    const flags = ticketActionFlags(ticket({}), ALL);
    assert.equal(flags.showTake, true);
    assert.equal(flags.showAssign, true);
    assert.equal(flags.showForward, false);
    assert.equal(flags.showWork, false);
});

test('a case you filed yourself can be neither taken nor assigned', () => {
    const flags = ticketActionFlags(ticket({ requester_id: MY_EMPLOYEE }), ALL);
    assert.equal(flags.showTake, false);
    assert.equal(flags.showAssign, false);
    assert.equal(flags.hasDeskActions, false);
});

test('only the holder works an in-progress case; a dispatcher may still forward it', () => {
    const mine = ticketActionFlags(ticket({ status: 'in_progress', assignee_id: ME }), ALL);
    assert.equal(mine.showWork, true);
    assert.equal(mine.showForward, true);

    const someoneElses = ticketActionFlags(ticket({ status: 'in_progress', assignee_id: 9 }), ALL);
    assert.equal(someoneElses.showWork, false);
    assert.equal(someoneElses.showForward, true);
    assert.equal(ticketActionFlags(ticket({ status: 'in_progress', assignee_id: 9 }), { ...ALL, canAssign: false }).showForward, false);
});

test('a closed case offers no desk action', () => {
    for (const status of ['completed', 'canceled'] as const) {
        assert.equal(ticketActionFlags(ticket({ status, assignee_id: ME }), ALL).hasDeskActions, false);
    }
});
