// The no-access screen must not leave on a timer (WCAG 2.2.1): the reader decides when to go.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../resources/js/modules/auth/components/require-permission.tsx', import.meta.url), 'utf8');

test('NoAccess has no timer and no automatic navigation', () => {
    assert.doesNotMatch(source, /setTimeout|setInterval/);
    assert.doesNotMatch(source, /useNavigate|navigate\(/);
});

test('NoAccess still offers the way back to the dashboard', () => {
    assert.match(source, /<Link to="\/">\{t\('noaccess_back'\)\}<\/Link>/);
});
