// Where a refusal of the password form shows: on the field the form has, or in the banner when the form has no such field.

export type PasswordFieldErrors = { current?: string; next?: string };

export function splitPasswordErrors(
    errors: Record<string, string[]> | undefined,
    showsCurrent: boolean,
): { fields: PasswordFieldErrors; banner: string | null } {
    const fields: PasswordFieldErrors = {};
    let banner: string | null = null;
    const current = errors?.current_password?.[0];
    const next = errors?.password?.[0];
    if (current) {
        if (showsCurrent) fields.current = current;
        else banner = current;
    }
    if (next) fields.next = next;
    return { fields, banner };
}
