// UAT ACC-02-07, ACC-03-05: a taken register email is worded from the server's code, in either language.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { access as en } from '../../resources/js/lang/en/access.ts';
import { access as th } from '../../resources/js/lang/th/access.ts';

const modal = readFileSync(join(import.meta.dirname, '../../resources/js/modules/access/components/resource-modal.tsx'), 'utf8');

test('the register form words the email_taken code, not an English "taken" in the sentence', () => {
    assert.match(modal, /if \(key === 'email' && msgs\[0\] === 'email_taken'\) mapped\[key\] = t\('access_err_email_taken'\);/);
    assert.doesNotMatch(modal, /\/taken\/i/);
});

test('the words are the ones the test book expects', () => {
    assert.equal(th.access_err_email_taken, 'อีเมลนี้ถูกใช้แล้ว');
    assert.ok(en.access_err_email_taken.length > 0);
});
