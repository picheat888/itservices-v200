// The email editor's HTML check: line numbers and attribute values that hold a '>'.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findHtmlIssues, htmlIssueMessage } from '../../resources/js/modules/email-templates/lib/html-issues.ts';

test('sound HTML has no issues', () => {
    assert.deepEqual(findHtmlIssues('<p>Hi <strong>there</strong></p>\n<ul>\n  <li>One</li>\n</ul>'), []);
});

test('a quoted ">" inside an attribute is not the end of the tag', () => {
    assert.deepEqual(findHtmlIssues('<p title="a > b">text</p>'), []);
    assert.deepEqual(findHtmlIssues("<a href='x?y=1>2'>link</a>"), []);
});

test('issues name the line they are on', () => {
    const issues = findHtmlIssues('<p>one</p>\n<p>two</p>\n<p>three');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'unclosed');
    assert.equal(issues[0].line, 3);
});

test('a stray closing tag on the first line is line 1', () => {
    const issues = findHtmlIssues('</p>\ntext');
    assert.equal(issues[0].kind, 'stray');
    assert.equal(issues[0].line, 1);
});

const issueT = (k: string) =>
    ({
        email_html_issue_unclosed: 'Unclosed <{tag}>',
        email_html_issue_stray: 'Stray </{tag}>',
        email_html_issue_open_inside: '</{tag}> but <{inner}> line {n}',
        email_html_issue_not_allowed: '<{tag}> in <{parent}>',
        email_html_issue_unsupported: '<{tag}> unsupported',
    })[k] ?? k;

test('issue messages come from the dictionary', () => {
    const msg = (html: string) => htmlIssueMessage(findHtmlIssues(html)[0], issueT);
    assert.equal(msg('<p>one'), 'Unclosed <p>');
    assert.equal(msg('</p>'), 'Stray </p>');
    assert.equal(msg('<div><span></div>'), '</div> but <span> line 1');
});
