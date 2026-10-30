// Security settings in the audit log: each key read with the Settings page's own words, 0 as "off" or "keep forever" (pure, node tests).

type Translate = (key: string) => string;

const OFF = 'policy_off';
const KEEP_FOREVER = 'policy_keep_forever';

// Setting key → its label, unit and the word for 0, as the Settings security page shows them
const SECURITY_SETTINGS: Record<string, { label: string; unit: string; zero: string }> = {
    session_timeout_minutes: { label: 'set_session_timeout', unit: 'unit_minutes', zero: OFF },
    password_expiry_days: { label: 'set_password_expiry', unit: 'unit_days', zero: OFF },
    device_limit: { label: 'set_device_limit', unit: 'unit_devices', zero: OFF },
    email_log_body_days: { label: 'set_email_body_days', unit: 'unit_days', zero: KEEP_FOREVER },
    email_log_days: { label: 'set_email_log_days', unit: 'unit_days', zero: KEEP_FOREVER },
    audit_log_days: { label: 'set_audit_log_days', unit: 'unit_days', zero: KEEP_FOREVER },
    notification_days: { label: 'set_notification_days', unit: 'unit_days', zero: KEEP_FOREVER },
    login_log_days: { label: 'set_login_log_days', unit: 'unit_days', zero: KEEP_FOREVER },
};

export const SECURITY_SETTINGS_ACTION = 'Updated security settings';

export const isSecuritySetting = (field: string): boolean => Object.hasOwn(SECURITY_SETTINGS, field);

export function securitySettingLabel(field: string, t: Translate): string {
    return t(SECURITY_SETTINGS[field].label);
}

/** "30 นาที", "ปิด", "เก็บตลอดไป": a stored number in the Settings page's words. */
export function securitySettingValue(field: string, value: unknown, t: Translate, formatN: (n: number) => string): string {
    const setting = SECURITY_SETTINGS[field];
    const n = Number(value);
    if (n === 0) return t(setting.zero);
    return `${formatN(n)} ${t(setting.unit)}`;
}

/** The entry's target ("audit_log_days, device_limit") as the setting names; anything else as stored. */
export function securitySettingsTarget(target: string, t: Translate): string {
    return target
        .split(',')
        .map((key) => key.trim())
        .map((key) => (isSecuritySetting(key) ? securitySettingLabel(key, t) : key))
        .join(', ');
}
