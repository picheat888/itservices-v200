import { groupRoleApi, permissionApi, roleApi, type AuditFilters, type GroupRoleListResponse, type GroupRolePayload } from '@/services/permissionApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = ['permissions-matrix'] as const;
const GROUPS = ['group-roles'] as const;

export const usePermissionMatrix = () => useQuery({ queryKey: KEY, queryFn: permissionApi.matrix });

export function useUpdateRolePermissions() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { role: string; permissions: string[] }) => permissionApi.updateRole(v.role, v.permissions),
        onSuccess: (data) => {
            qc.setQueryData(KEY, data);
            qc.invalidateQueries({ queryKey: ['auth', 'me'] });
        },
    });
}

export function useRoleMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
    return {
        create: useMutation({ mutationFn: (p: { name: string; color: string }) => roleApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { key: string; name: string; color: string }) => roleApi.update(v.key, { name: v.name, color: v.color }),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (key: string) => roleApi.remove(key), onSuccess: invalidate }),
    };
}

export const useGroupRoles = () => useQuery({ queryKey: GROUPS, queryFn: groupRoleApi.list });

export function useGroupRoleMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: GROUPS });
    return {
        create: useMutation({ mutationFn: (p: GroupRolePayload) => groupRoleApi.create(p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: GroupRolePayload }) => groupRoleApi.update(v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => groupRoleApi.remove(id), onSuccess: invalidate }),
    };
}

export function useSetDefaultGroup() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (groupId: number | null) => groupRoleApi.setDefault(groupId),
        onSuccess: (data: GroupRoleListResponse) => qc.setQueryData(GROUPS, data),
    });
}

export const useAuditLogs = (page: number, perPage: number, filters: AuditFilters = {}) =>
    useQuery({
        queryKey: ['audit-logs', page, perPage, filters],
        queryFn: () => permissionApi.auditLogs(page, perPage, filters),
        placeholderData: (prev) => prev,
    });
