// The SMTP form takes a relay that needs no sign-in: the username may be blank and the password then sits unused (SET-7).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync('resources/js/modules/settings/pages/index.tsx', 'utf8');

test('the username is optional and says so', () => {
    assert.doesNotMatch(page, /name="username" required/);
    assert.match(page, /name="username" error=\{errors\.username\} help=\{t\('set_email_username_help'\)\}/);
    assert.doesNotMatch(page, /next\.username = /);
});

test('the password is required only when signing in for the first time, and off without a username', () => {
    assert.match(page, /if \(signsIn && !hasPassword && !form\.password\?\.trim\(\)\) next\.password/);
    assert.match(page, /required=\{signsIn && !hasPassword\}/);
    assert.match(page, /disabled=\{!signsIn\}/);
});
