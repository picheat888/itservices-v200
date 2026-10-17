// Whether a report page may show the dialog its ?dialog= names, by the reader's export / schedule rights (pure, node tests).
export function reportDialogAllowed(dialog: 'export' | 'schedule' | null, rights: { canExport: boolean; canSchedule: boolean }): boolean {
    if (dialog === 'export') return rights.canExport;
    if (dialog === 'schedule') return rights.canSchedule;
    return true;
}
