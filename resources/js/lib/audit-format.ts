// Human-readable formatting for audit-log diffs. Entries are stored with raw DB
// column names and foreign-key ids (e.g. `position_id: 5 → 12`); these helpers
// turn those into friendly labels and resolved entity names at display time, so
// historical logs become readable without rewriting stored data.

type Lang = 'en' | 'th';

/** Friendly labels for the raw DB column names that show up in audit diffs. */
const FIELD_LABELS: Record<string, { en: string; th: string }> = {
    name: { en: 'Name', th: 'ชื่อ' },
    name_th: { en: 'Name (TH)', th: 'ชื่อ (ไทย)' },
    code: { en: 'Code', th: 'รหัส' },
    department_id: { en: 'Department', th: 'แผนก' },
    section_id: { en: 'Section', th: 'หน่วยงาน' },
    position_id: { en: 'Position', th: 'ตำแหน่ง' },
    manager_id: { en: 'Manager', th: 'หัวหน้างาน' },
    email: { en: 'Email', th: 'อีเมล' },
    phone: { en: 'Phone', th: 'โทรศัพท์' },
    username: { en: 'Username', th: 'ชื่อผู้ใช้' },
    joined_at: { en: 'Join date', th: 'วันเริ่มงาน' },
    status: { en: 'Status', th: 'สถานะ' },
    resign_reason: { en: 'Resign reason', th: 'เหตุผลลาออก' },
    last_day: { en: 'Last day', th: 'วันสุดท้าย' },
    title: { en: 'Title', th: 'ชื่อตำแหน่ง' },
    level: { en: 'Level', th: 'ระดับ' },
    tag: { en: 'Tag', th: 'แท็ก' },
    // Foreign keys resolved by the backend (shown as names) — label them nicely too.
    employee_id: { en: 'Employee', th: 'พนักงาน' },
    requester_id: { en: 'Requester', th: 'ผู้ขอ' },
    assignee_id: { en: 'Assignee', th: 'ผู้รับผิดชอบ' },
    user_id: { en: 'User', th: 'ผู้ใช้' },
    role_id: { en: 'Role', th: 'บทบาท' },
    group_role_id: { en: 'Role group', th: 'กลุ่มบทบาท' },
    contract_id: { en: 'Contract', th: 'สัญญา' },
    brand_id: { en: 'Brand', th: 'ยี่ห้อ' },
    asset_id: { en: 'Asset', th: 'ทรัพย์สิน' },
    related_asset_id: { en: 'Related asset', th: 'ทรัพย์สินที่เกี่ยวข้อง' },
    stock_item_id: { en: 'Stock item', th: 'รายการสต็อก' },
};

/** Maps a raw column name to a friendly label, falling back to the column name. */
export function auditFieldLabel(field: string, lang: Lang): string {
    return FIELD_LABELS[field]?.[lang] ?? field;
}

/** Reference maps (id → display name) used to resolve foreign-key ids in diffs. */
export interface AuditLookups {
    positions: Map<number, string>;
    departments: Map<number, string>;
    sections: Map<number, string>;
    employees: Map<number, string>;
}

/** Which diff fields are foreign-key ids, and the lookup that resolves each. */
const FK_FIELDS: Record<string, keyof AuditLookups> = {
    position_id: 'positions',
    department_id: 'departments',
    section_id: 'sections',
    manager_id: 'employees',
};

/**
 * Resolves an audit diff value to a human label. For foreign-key fields the
 * numeric id is swapped for the entity name (falling back to `#<id>` when the
 * record no longer exists). Non-FK values are returned unchanged.
 */
export function resolveAuditValue(field: string, value: unknown, lookups: AuditLookups): unknown {
    const lookupKey = FK_FIELDS[field];
    if (!lookupKey || value === null || value === undefined || value === '') {
        return value;
    }
    const id = Number(value);
    if (!Number.isFinite(id)) {
        return value;
    }
    return lookups[lookupKey].get(id) ?? `#${id}`;
}
