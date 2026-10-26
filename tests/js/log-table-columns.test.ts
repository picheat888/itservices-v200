// The Audit and Login log tables: exact time first on one line, and a worded "more" button for audit details.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const audit = read('resources/js/modules/permission/components/audit-log-tab.tsx');
const login = read('resources/js/modules/permission/components/login-log-tab.tsx');
const firstKey = (src: string) => src.slice(src.indexOf('const columns')).match(/key:\s*'(\w+)'/)?.[1];

test('audit log puts the exact time first, never a relative time', () => {
    assert.equal(firstKey(audit), 'time');
    assert.doesNotMatch(audit, /auditAgo/);
    assert.match(audit, /useDateColumnWidth\('text-xs',\s*\{\s*oneLine:\s*true\s*\}\)/);
    assert.match(audit, /fmt\.dateTime\(l\.created_at\)/);
});

test('audit details open from a worded button', () => {
    assert.match(audit, /t\(expandedId === l\.id \? 'audit_show_less' : 'audit_show_more'\)/);
    assert.match(audit, /aria-expanded=\{expandedId === l\.id\}/);
    assert.match(audit, /header: <span className="sr-only xl:not-sr-only">\{t\('audit_details'\)\}<\/span>/);
    // Icon only below xl so a tablet fits without scrolling
    assert.match(audit, /<span className="sr-only xl:not-sr-only">\{t\(expandedId/);
});

test('login log shows date and time on one line', () => {
    assert.equal(firstKey(login), 'time');
    assert.doesNotMatch(login, /DateTimeCell/);
    assert.match(login, /useDateColumnWidth\('text-xs',\s*\{\s*oneLine:\s*true\s*\}\)/);
});

test('relative-time words left with auditAgo', () => {
    for (const lang of ['th', 'en']) {
        const src = read(`resources/js/lang/${lang}/permission.ts`);
        assert.doesNotMatch(src, /perm_ui_just_now|perm_ui_minutes_short|perm_ui_hours_short/);
        assert.match(src, /audit_show_more:/);
        assert.match(src, /audit_show_less:/);
    }
});
