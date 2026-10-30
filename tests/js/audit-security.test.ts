// Security settings in the audit log read with the Settings page's words; 0 is "off" or "keep forever" by setting (PRM-7).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    isSecuritySetting,
    securitySettingLabel,
    securitySettingsTarget,
    securitySettingValue,
} from '../../resources/js/modules/permission/lib/audit-security.ts';

const th: Record<string, string> = {};
for (const m of readFileSync('resources/js/lang/th/settings.ts', 'utf8').matchAll(/^\s+(\w+): '([^']*)',$/gm)) th[m[1]] = m[2];
const t = (key: string) => th[key] ?? key;
const n = (v: number) => v.toLocaleString('th-TH');

test('each setting is named as on the Settings page', () => {
    assert.equal(securitySettingLabel('audit_log_days', t), 'บันทึกการตรวจสอบ');
    assert.equal(securitySettingLabel('device_limit', t), 'จำกัดจำนวนเครื่องที่ใช้พร้อมกัน');
    assert.equal(securitySettingLabel('session_timeout_minutes', t), 'ออกจากระบบเมื่อไม่ได้ใช้งาน');
    assert.equal(isSecuritySetting('name'), false);
});

test('0 reads as keep forever for a retention window and off for a policy', () => {
    assert.equal(securitySettingValue('audit_log_days', 0, t, n), 'เก็บตลอดไป');
    assert.equal(securitySettingValue('login_log_days', 0, t, n), 'เก็บตลอดไป');
    assert.equal(securitySettingValue('session_timeout_minutes', 0, t, n), 'ปิด');
    assert.equal(securitySettingValue('device_limit', 0, t, n), 'ปิด');
});

test('other values carry the unit', () => {
    assert.equal(securitySettingValue('audit_log_days', 1, t, n), '1 วัน');
    assert.equal(securitySettingValue('session_timeout_minutes', 30, t, n), '30 นาที');
    assert.equal(securitySettingValue('device_limit', 2, t, n), '2 เครื่อง');
    assert.equal(securitySettingValue('password_expiry_days', 1095, t, n), '1,095 วัน');
});

test('the stored target becomes the setting names', () => {
    assert.equal(securitySettingsTarget('audit_log_days, device_limit', t), 'บันทึกการตรวจสอบ, จำกัดจำนวนเครื่องที่ใช้พร้อมกัน');
});

test('every key the server saves has words', () => {
    const php = readFileSync('app/Http/Controllers/Api/Settings/SettingsController.php', 'utf8');
    const block = php.slice(php.indexOf('function updateSecurity'), php.indexOf('$previousDeviceLimit'));
    const keys = [...block.matchAll(/'(\w+)' => \[/g)].map((m) => m[1]);
    assert.equal(keys.length, 8);
    for (const key of keys) assert.ok(isSecuritySetting(key), key);
});
