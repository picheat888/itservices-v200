// Employee ids a page of audit rows refers to (manager_id diffs), so names are looked up for just those.
interface RowWithChanges {
    details: { changes?: Record<string, { from: unknown; to: unknown }> } | null;
}

export function auditEmployeeIds(rows: readonly RowWithChanges[]): number[] {
    const ids = new Set<number>();
    for (const row of rows) {
        const change = row.details?.changes?.manager_id;
        for (const value of [change?.from, change?.to]) {
            const id = Number(value);
            if (value !== null && value !== undefined && value !== '' && Number.isFinite(id)) {
                ids.add(id);
            }
        }
    }
    return [...ids].sort((a, b) => a - b);
}
