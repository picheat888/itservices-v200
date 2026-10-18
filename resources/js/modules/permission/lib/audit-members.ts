// Splits an audit entry's added/removed lists into permission keys (role saves) and member names (role groups).
const PERMISSION_KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export function isPermissionKey(value: string): boolean {
    return PERMISSION_KEY.test(value);
}

export function splitAuditEntries(details: { added?: string[]; removed?: string[] }) {
    const added = details.added ?? [];
    const removed = details.removed ?? [];

    return {
        permissionsAdded: added.filter(isPermissionKey),
        permissionsRemoved: removed.filter(isPermissionKey),
        membersAdded: added.filter((value) => !isPermissionKey(value)),
        membersRemoved: removed.filter((value) => !isPermissionKey(value)),
    };
}
