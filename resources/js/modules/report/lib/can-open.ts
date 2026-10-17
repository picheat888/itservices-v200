// Whether a link from a report opens: the target menu's gate, and for a record (?view=) the right its page checks (pure, node tests).
type Gate = { permission?: string; anyOf?: string[] };
type Can = (permission: string) => boolean;

/** A sidebar entry lets the reader in: its single `permission`, else one of `anyOf`, else open. */
export function canOpenNavItem(item: Gate | undefined, can: Can): boolean {
    if (!item) return false;
    if (item.permission && !can(item.permission)) return false;
    return !item.anyOf || item.anyOf.some(can);
}

// The rights each module's record endpoint checks (one of them is enough).
const RECORD_RIGHTS: Record<string, string[]> = {
    '/tickets': ['tickets.view_all'],
    '/requests': ['requests.view_all', 'requests.complete'],
    '/assets': ['assets.view'],
    '/contracts': ['contracts.view'],
    '/employees': ['employees.view'],
};

// Access page tab → the registry's view right.
const ACCESS_TAB_RIGHT: Record<string, string> = {
    'email-groups': 'access.email_view',
    'file-shares': 'access.file_view',
    'social-platforms': 'access.social_view',
    software: 'access.software_view',
};

/** A `?view=` link opens only when the reader holds the right its record page asks for. */
export function canOpenRecord(href: string, can: Can): boolean {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    if (!params.has('view')) return true;
    if (path === '/access') {
        const right = ACCESS_TAB_RIGHT[params.get('tab') ?? ''];
        return right !== undefined && can(right);
    }
    const rights = RECORD_RIGHTS[path];
    return !rights || rights.some(can);
}
