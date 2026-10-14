// Several requests can fail at once when a session ends; only the first reason reaches the login page.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginRedirect } from '../../resources/js/shared/lib/login-redirect.ts';

test('the first reason wins when several requests fail together', () => {
    const target = { href: '/tickets' };
    const redirect = createLoginRedirect(target);

    redirect('session_expired');
    redirect('signed_out');

    assert.equal(target.href, '/login?reason=session_expired');
});

test('a single failure still goes to the login page with its reason', () => {
    const target = { href: '/' };
    createLoginRedirect(target)('signed_out');
    assert.equal(target.href, '/login?reason=signed_out');
});
