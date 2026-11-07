// Which refusal text the role page shows for a role that cannot be deleted; the Role Group reason comes before the members one.
export type RoleDeleteBlockKey = 'role_del_blocked_system' | 'role_del_blocked_group' | 'role_del_blocked_members';

export function roleDeleteBlockKey(role: { is_system: boolean; members: number; groups: number }): RoleDeleteBlockKey | null {
    if (role.is_system) return 'role_del_blocked_system';
    if (role.groups > 0) return 'role_del_blocked_group';
    if (role.members > 0) return 'role_del_blocked_members';
    return null;
}
