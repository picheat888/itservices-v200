// Whether a sidebar entry lets the reader in: its single `permission`, else one of `anyOf`, else open (pure, node tests).
type Gate = { permission?: string; anyOf?: string[] };

export function canOpenNavItem(item: Gate | undefined, can: (permission: string) => boolean): boolean {
    if (!item) return false;
    if (item.permission && !can(item.permission)) return false;
    return !item.anyOf || item.anyOf.some(can);
}
