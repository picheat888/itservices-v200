// Role Group rules shared by the tab and its dialog: the singular lang key, and the grant ceiling.
// Dependency-free on purpose: node tests load it directly.

/** `<key>_one` when n is 1 (EN singular; TH carries the same text), else the plain key. */
export function countKey(key: string, n: number): string {
    return n === 1 ? `${key}_one` : key;
}

/** A role the caller may not hand out: the Super admin role, or one holding a permission they lack. */
export function isOverCeiling(role: { is_super: boolean; permissions: string[] }, isSuper: boolean, myPermissions: ReadonlySet<string>): boolean {
    if (isSuper) return false;
    return role.is_super || role.permissions.some((key) => !myPermissions.has(key));
}
