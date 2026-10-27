// An imported CSV row's problems, worded from the issue codes the server sends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importIssueText } from '../../resources/js/modules/employee/lib/import-issue.ts';

const dict: Record<string, string> = {
    import_err_required: '{column} is empty',
    import_err_too_long: '{column} is longer than {max} characters',
    import_err_not_found: "{column} '{value}' was not found",
    import_err_closest: " (closest: '{closest}')",
};
const t = (key: string) => dict[key] ?? key;

test('a code is worded with its column, value and figures', () => {
    assert.equal(importIssueText({ code: 'required', column: 'first_name' }, t), 'first_name is empty');
    assert.equal(importIssueText({ code: 'too_long', column: 'phone', max: 50 }, t), 'phone is longer than 50 characters');
});

test('a near miss names the closest real value', () => {
    const issue = { code: 'not_found', column: 'department', value: 'Information Technolgy', closest: 'Information Technology' };
    assert.equal(importIssueText(issue, t), "department 'Information Technolgy' was not found (closest: 'Information Technology')");
    assert.equal(importIssueText({ code: 'not_found', column: 'department', value: 'zzz' }, t), "department 'zzz' was not found");
});

test('a code with no words yet still says which column and code', () => {
    assert.equal(importIssueText({ code: 'brand_new', column: 'email' }, t), 'email: brand_new');
});
