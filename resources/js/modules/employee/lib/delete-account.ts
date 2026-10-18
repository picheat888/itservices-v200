// Delete blockers that depend on who is looking: the viewer's own record, and a Super admin account for a non-super viewer.
interface DeleteTarget {
    id: number;
    username: string | null;
    is_super_admin: boolean;
}

interface Viewer {
    employee_id: number | null;
    username: string | null;
}

/** Same account link as the server: the user's employee_id, or an employee with the same username. */
function isOwnRecord(employee: DeleteTarget, viewer: Viewer): boolean {
    return viewer.employee_id === employee.id || (!!viewer.username && viewer.username === employee.username);
}

/** The blocker a refused delete names in `message` (403 own_account / super_account), if it is one of these. */
export function accountDeleteRefusal(error: unknown): string | undefined {
    const message = (error as { response?: { status?: number; data?: { message?: unknown } } } | undefined)?.response?.data?.message;
    return message === 'own_account' || message === 'super_account' ? message : undefined;
}

export function accountDeleteBlockers(employee: DeleteTarget, viewer: Viewer | null, isSuperViewer: boolean): string[] {
    const blockers: string[] = [];
    if (viewer && isOwnRecord(employee, viewer)) blockers.push('own_account');
    if (employee.is_super_admin && !isSuperViewer) blockers.push('super_account');
    return blockers;
}
