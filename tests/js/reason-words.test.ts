// Server refusal codes worded by the reader's lang keys, with the figures the response carries.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reasonWords } from '../../resources/js/shared/lib/reason-words.ts';

const dict: Record<string, string> = {
    x_not_your_turn: 'Not your turn',
    x_ticket_still_open: 'Ticket {ticket} is still open',
    x_one_completion: 'Only one completion step',
};
const t = (key: string) => dict[key] ?? key;
const refused = (data: Record<string, unknown>) => ({ response: { status: 422, data } });

test('a code in message is worded and its figures filled in', () => {
    assert.equal(reasonWords(refused({ message: 'not_your_turn' }), t, 'x_'), 'Not your turn');
    assert.equal(reasonWords(refused({ message: 'ticket_still_open', ticket: 'TKT-1' }), t, 'x_'), 'Ticket TKT-1 is still open');
});

test('a code in a field error is worded when message is the combined summary', () => {
    const error = refused({ message: 'one_completion (and 1 more error)', errors: { steps: ['one_completion'], name: ['required'] } });
    assert.equal(reasonWords(error, t, 'x_'), 'Only one completion step');
});

test('an English sentence, an unknown code or no response has no words', () => {
    assert.equal(reasonWords(refused({ message: 'Something went wrong.' }), t, 'x_'), undefined);
    assert.equal(reasonWords(refused({ message: 'unknown_code' }), t, 'x_'), undefined);
    assert.equal(reasonWords(new Error('offline'), t, 'x_'), undefined);
});

test('a figure is formatted by the caller when asked', () => {
    const words = reasonWords(refused({ message: 'ticket_still_open', ticket: 'tkt-1' }), t, 'x_', (_name, value) => String(value).toUpperCase());
    assert.equal(words, 'Ticket TKT-1 is still open');
});
