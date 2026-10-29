// A refusal of the password form lands on a field the form shows, else in the banner above it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitPasswordErrors } from '../../resources/js/modules/auth/lib/password-errors.ts';

test('field errors go to the fields the form shows', () => {
    assert.deepEqual(splitPasswordErrors({ current_password: ['Wrong'], password: ['Too short'] }, true), {
        fields: { current: 'Wrong', next: 'Too short' },
        banner: null,
    });
});

test('a current-password refusal on a form without that field goes to the banner', () => {
    // Set in another tab meanwhile: the server now asks for the current password the set form does not have
    assert.deepEqual(splitPasswordErrors({ current_password: ['Required'] }, false), { fields: {}, banner: 'Required' });
    assert.deepEqual(splitPasswordErrors({ current_password: ['Required'], password: ['Too short'] }, false), {
        fields: { next: 'Too short' },
        banner: 'Required',
    });
});

test('no field errors leaves both empty', () => {
    assert.deepEqual(splitPasswordErrors(undefined, true), { fields: {}, banner: null });
});
