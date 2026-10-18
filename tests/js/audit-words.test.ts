// Audit log words: event names map to audit_ev_* keys, fields to audit_field_*, unknown ones show as stored.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { permission as en } from '../../resources/js/lang/en/permission.ts';
import { permission as th } from '../../resources/js/lang/th/permission.ts';
import {
    auditEventKey,
    auditEventLabel,
    auditFieldKey,
    auditFieldText,
    isAssetSubject,
} from '../../resources/js/modules/permission/lib/audit-words.ts';

const dict: Record<string, string> = { audit_ev_signed_in: 'เข้าสู่ระบบ', audit_field_owner: 'ผู้ถือครอง', audit_field_owner_employee_id: 'เจ้าของ' };
const t = (key: string) => dict[key] ?? key;

test('an action becomes its slug key', () => {
    assert.equal(auditEventKey('Signed in'), 'audit_ev_signed_in');
    assert.equal(auditEventKey('Force-recalled asset'), 'audit_ev_force_recalled_asset');
    assert.equal(auditEventKey('Stock adjust_up'), 'audit_ev_stock_adjust_up');
    assert.equal(auditEventKey('Updated SLA settings'), 'audit_ev_updated_sla_settings');
    assert.equal(auditEventKey('  Cancelled asset write-off. '), 'audit_ev_cancelled_asset_write_off');
});

test('a known action is translated and an unknown one shows as stored', () => {
    assert.equal(auditEventLabel('Signed in', t), 'เข้าสู่ระบบ');
    assert.equal(auditEventLabel('Launched rocket', t), 'Launched rocket');
});

test('owner_employee_id reads as holder on an asset and owner elsewhere', () => {
    assert.equal(isAssetSubject('App\\Models\\Asset\\Asset'), true);
    assert.equal(isAssetSubject('asset'), true);
    assert.equal(isAssetSubject('email_group'), false);
    assert.equal(isAssetSubject('App\\Models\\Asset\\AssetTransfer'), false);
    assert.equal(isAssetSubject(null), false);
    assert.equal(auditFieldKey('owner_employee_id', 'App\\Models\\Asset\\Asset'), 'audit_field_owner');
    assert.equal(auditFieldKey('owner_employee_id', 'file_share'), 'audit_field_owner_employee_id');
    assert.equal(auditFieldKey('owner_employee_id'), 'audit_field_owner_employee_id');
    assert.equal(auditFieldText('owner_employee_id', t, 'App\\Models\\Asset\\Asset'), 'ผู้ถือครอง');
    assert.equal(auditFieldText('owner_employee_id', t, 'email_group'), 'เจ้าของ');
    assert.equal(auditFieldText('mystery_col', t), 'mystery_col');
});

test('every action the app writes has a word in both languages', () => {
    for (const [lang, words] of Object.entries({ th, en })) {
        for (const action of ['Signed in', 'Deleted role group', 'Stock receive', 'Force-recalled asset', 'Reset bell to standard']) {
            assert.ok(words[auditEventKey(action)], `${lang}: ${action}`);
        }
    }
});
