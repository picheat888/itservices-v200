// Several requests (or tabs) can fail at once when a session ends; only the first reason reaches the login page.
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

test('an idle timeout is announced to the other tabs once', () => {
    let announced = 0;
    const redirect = createLoginRedirect({ href: '/' }, () => announced++);

    redirect('session_expired');
    redirect('session_expired');

    assert.equal(announced, 1);
});

test('a tab that heard the news does not announce it again, and a plain sign-out is not announced', () => {
    let announced = 0;
    createLoginRedirect({ href: '/' }, () => announced++)('session_expired', { announce: false });
    createLoginRedirect({ href: '/' }, () => announced++)('signed_out');

    assert.equal(announced, 0);
});
