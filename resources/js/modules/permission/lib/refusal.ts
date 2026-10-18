// Words for a refused permission write: the server's `code` picks a lang key; otherwise its message or the generic error.
const REFUSAL_KEYS: Record<string, string> = {
    default_group_super: 'perm_refusal_default_group_super',
    admin_members_protected: 'perm_refusal_admin_members_protected',
    last_super_admin: 'perm_refusal_last_super_admin',
    own_access: 'perm_refusal_own_access',
    grant_ceiling: 'perm_refusal_grant_ceiling',
};

export function refusalKey(code: unknown): string | undefined {
    return typeof code === 'string' && Object.hasOwn(REFUSAL_KEYS, code) ? REFUSAL_KEYS[code] : undefined;
}

export function permissionRefusalText(error: unknown, t: (key: string) => string): string {
    const body = (error as { response?: { data?: { code?: unknown; message?: unknown } } } | undefined)?.response?.data;
    const key = refusalKey(body?.code);
    if (key) return t(key);
    return typeof body?.message === 'string' && body.message !== '' ? body.message : t('cd_error');
}
