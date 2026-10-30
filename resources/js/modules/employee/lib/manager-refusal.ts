// Why the server refused a chosen manager, read from the code it sends on manager_id.
export type ManagerRefusal = 'loop' | 'resigned' | 'not_found';

const BY_CODE: Record<string, ManagerRefusal> = {
    manager_loop: 'loop',
    manager_resigned: 'resigned',
    manager_not_found: 'not_found',
};

/** Words shown under the manager field; a loop has its own panel instead. */
export const MANAGER_REFUSAL_KEY: Record<Exclude<ManagerRefusal, 'loop'>, string> = {
    resigned: 'emp_err_manager_resigned',
    not_found: 'emp_err_manager_not_found',
};

export function managerRefusal(code: string | undefined): ManagerRefusal | null {
    return code ? (BY_CODE[code] ?? null) : null;
}

/** A chosen manager who has left blocks saving, unless the edited employee has left too. */
export function managerHasLeft(manager: { status?: string | null } | undefined, employeeStatus?: string | null): boolean {
    return manager?.status === 'resigned' && employeeStatus !== 'resigned';
}
