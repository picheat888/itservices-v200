// Words for a refused permission write: the server's `code` picks a lang key; otherwise its message or the generic error.
const REFUSAL_KEYS: Record<string, string> = {
    default_group_super: 'perm_refusal_default_group_super',
    admin_members_protected: 'perm_refusal_admin_members_protected',
    last_super_admin: 'perm_refusal_last_super_admin',
    own_access: 'perm_refusal_own_access',
    grant_ceiling: 'perm_refusal_grant_ceiling',
    role_changed: 'perm_refusal_role_changed',
};

export function refusalKey(code: unknown): string | undefined {
    return typeof code === 'string' && Object.hasOwn(REFUSAL_KEYS, code) ? REFUSAL_KEYS[code] : undefined;
}

type RefusalBody = { code?: unknown; message?: unknown } | undefined;
const refusalBody = (error: unknown): RefusalBody => (error as { response?: { data?: RefusalBody } } | undefined)?.response?.data;

/** The server's refusal `code`, when it sent one. */
export function refusalCode(error: unknown): string | undefined {
    const code = refusalBody(error)?.code;
    return typeof code === 'string' ? code : undefined;
}

export function permissionRefusalText(error: unknown, t: (key: string) => string): string {
    const body = refusalBody(error);
    const key = refusalKey(body?.code);
    if (key) return t(key);
    return typeof body?.message === 'string' && body.message !== '' ? body.message : t('cd_error');
}

/** A save refused because the role changed since its draft was loaded (409 role_changed). */
export function isRoleChanged(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | undefined)?.response;
    return response?.status === 409 && response.data?.code === 'role_changed';
}
