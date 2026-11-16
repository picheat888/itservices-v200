// UAT PRM-12-01: the audit log search finds an action by the name the screen shows, in either language.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { permission as en } from '../../resources/js/lang/en/permission.ts';
import { permission as th } from '../../resources/js/lang/th/permission.ts';
import { auditEventKey, auditEventKeysMatching } from '../../resources/js/modules/permission/lib/audit-words.ts';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js/modules/permission', rel), 'utf8');

test('a shown action name gives the key of its stored action', () => {
    assert.ok(auditEventKeysMatching(th, 'แก้ไขสิทธิ์ของบทบาท').includes('updated_permissions'));
    assert.equal(`audit_ev_${auditEventKeysMatching(th, 'แก้ไขสิทธิ์ของบทบาท')[0]}`, auditEventKey('Updated permissions'));
    // Every word must be in the name, case does not matter, and the English screen works the same way
    assert.ok(auditEventKeysMatching(en, en.audit_ev_updated_permissions.toUpperCase()).includes('updated_permissions'));
    assert.deepEqual(auditEventKeysMatching(th, 'คำที่ไม่มีในชื่อการกระทำ'), []);
    assert.deepEqual(auditEventKeysMatching(th, '   '), []);
});

test('a search that names too many actions sends none, so the URL stays short', () => {
    assert.ok(auditEventKeysMatching(th, 'แก้ไข').length > 0);
    assert.deepEqual(auditEventKeysMatching(th, 'า'), []);
});

test('the audit tab sends the matching keys with the search', () => {
    const tab = read('components/audit-log-tab.tsx');
    assert.match(tab, /auditEventKeysMatching\(dictionaries\[lang\], sentSearch\)/);
    assert.match(tab, /const filters: AuditFilters = \{ search: sentSearch, eventKeys, category, user \};/);
    const api = read('api/permissionApi.ts');
    assert.match(api, /event_keys: filters\.eventKeys\?\.length \? filters\.eventKeys\.join\(','\) : undefined,/);
});
