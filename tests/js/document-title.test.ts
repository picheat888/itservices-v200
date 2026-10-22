// The browser tab title: the unread bell count in front of "<page> - <brand>".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleWithCount } from '../../resources/js/shared/lib/document-title.ts';

test('no unread bells leaves the title as it is', () => assert.equal(titleWithCount('Tickets - INA Tech', 0), 'Tickets - INA Tech'));
test('unread bells go in front in brackets', () => assert.equal(titleWithCount('Tickets - INA Tech', 3), '(3) Tickets - INA Tech'));
test('99 still shows the number', () => assert.equal(titleWithCount('Tickets - INA Tech', 99), '(99) Tickets - INA Tech'));
test('more than 99 reads 99+', () => assert.equal(titleWithCount('Tickets - INA Tech', 100), '(99+) Tickets - INA Tech'));
test('a negative or broken count shows nothing', () => {
    assert.equal(titleWithCount('Tickets - INA Tech', -1), 'Tickets - INA Tech');
    assert.equal(titleWithCount('Tickets - INA Tech', Number.NaN), 'Tickets - INA Tech');
});
