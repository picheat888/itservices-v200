// Awaiting-contract rules: the badge test and when the asset form requires a contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import { contractRequired, isAwaitingContract, statusFilterValue } from '../../resources/js/modules/asset/lib/awaiting-contract.ts';

test('a rented asset without a contract waits for one, unless written off', () => {
    assert.equal(isAwaitingContract({ source: 'rented', contract_id: null, status: 'deployed' }), true);
    assert.equal(isAwaitingContract({ source: 'rented', contract_id: 4, status: 'ready' }), false);
    assert.equal(isAwaitingContract({ source: 'purchased', contract_id: null, status: 'ready' }), false);
    assert.equal(isAwaitingContract({ source: 'rented', contract_id: null, status: 'writeoff' }), false);
});

test('the form asks for a contract only when editing a rental that has one', () => {
    assert.equal(contractRequired(null, true), false);
    assert.equal(contractRequired({ contract_id: null }, true), false);
    assert.equal(contractRequired({ contract_id: 7 }, true), true);
    assert.equal(contractRequired({ contract_id: 7 }, false), false);
});

test('the status filter keeps the awaiting-contract value instead of dropping it', () => {
    assert.equal(statusFilterValue('awaiting_contract'), 'awaiting_contract');
    assert.equal(statusFilterValue('nonsense'), '');
    assert.equal(statusFilterValue('ready'), 'ready');
});
