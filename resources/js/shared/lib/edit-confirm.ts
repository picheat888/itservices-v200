// Record line for the shared "confirm before saving an edit" dialog (useConfirmEdit).
// Kept free of React so node tests can load it.

/** The record being edited, as saved: its name and, when it has one, its code. */
export interface EditConfirmTarget {
    name: string | null | undefined;
    sub?: string | null;
}

/** Trimmed name (a dash when missing) and code; a blank code is left out. */
export function editConfirmEntity(target: EditConfirmTarget): { name: string; sub?: string } {
    const name = (target.name ?? '').trim() || '—';
    const sub = (target.sub ?? '').trim();
    return sub ? { name, sub } : { name };
}
