// The reader's own role is read-only to them unless they are a super admin (server: RolePermissionService::guardOwnRole).

export function isOwnRole(role: { value: string; is_super: boolean }, readerRole: string | null | undefined): boolean {
    return !role.is_super && readerRole === role.value;
}
