// "รายชื่อพนักงาน" report: which rows get the amber Thai name note (pure, node tests).

/**
 * 'missing' when an active employee has no Thai name, 'incomplete' when only one part of it, else null —
 * the same people the "ยังไม่มีชื่อไทย" tile counts (EmployeeDirectoryReport, active staff only).
 */
export function thaiNameNote(row: Record<string, unknown>): 'missing' | 'incomplete' | null {
    if (row.status !== 'active' || row._thai_name_missing !== true) return null;

    return typeof row.name_th === 'string' && row.name_th !== '' ? 'incomplete' : 'missing';
}
