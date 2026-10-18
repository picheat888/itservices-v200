import { ME_KEY } from '@/shared/lib/query-client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    groupRoleApi,
    permissionApi,
    roleApi,
    type AuditFilters,
    type GroupCandidateParams,
    type GroupRoleCreatePayload,
    type GroupRoleListResponse,
    type GroupRoleOption,
    type GroupRoleUpdatePayload,
} from '../api/permissionApi';
import { baseRoleLabel } from '../lib/group-rules';

const KEY = ['permissions-matrix'] as const;
const GROUPS = ['group-roles'] as const;
const NO_ROLES: GroupRoleOption[] = [];

export const usePermissionMatrix = () => useQuery({ queryKey: KEY, queryFn: permissionApi.matrix });

export function useUpdateRolePermissions() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { role: string; permissions: string[]; version: string }) => permissionApi.updateRole(v.role, v.permissions, v.version),
        onSuccess: (data) => {
            qc.setQueryData(KEY, data);
            qc.invalidateQueries({ queryKey: ME_KEY });
            // The Role Group dialog greys roles by their permissions
            qc.invalidateQueries({ queryKey: GROUPS, exact: true });
        },
    });
}

export function useRoleMutations() {
    const qc = useQueryClient();
    // Returned so a duplicate resolves only once the matrix holds the new role
    const invalidate = () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: KEY }),
            // Role names and colours show on the Role Groups list and its dialog
            qc.invalidateQueries({ queryKey: GROUPS, exact: true }),
        ]);
    return {
        create: useMutation({ mutationFn: (p: { name: string; color: string }) => roleApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { key: string; name: string; color: string }) => roleApi.update(v.key, { name: v.name, color: v.color }),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (key: string) => roleApi.remove(key), onSuccess: invalidate }),
        duplicate: useMutation({
            mutationFn: (v: { key: string; name: string; color: string }) => roleApi.duplicate(v.key, { name: v.name, color: v.color }),
            onSuccess: invalidate,
        }),
    };
}

export const useGroupRoles = () => useQuery({ queryKey: GROUPS, queryFn: groupRoleApi.list });

/** The roles a Role Group can be given, sent with the groups list. */
export function useGroupRoleOptions(): GroupRoleOption[] {
    const { data } = useGroupRoles();
    return data?.roles ?? NO_ROLES;
}

/** Name of the role a person falls back to when they leave every group. */
export function useBaseRoleLabel(): string {
    return baseRoleLabel(useGroupRoleOptions());
}

/** One page of a saved group's members (none for a new group). */
export const useGroupMembers = (groupId: number | null, search: string, page: number) =>
    useQuery({
        queryKey: [...GROUPS, groupId, 'members', search, page],
        queryFn: () => groupRoleApi.members(groupId as number, search, page),
        enabled: groupId !== null,
        placeholderData: keepPreviousData,
    });

/** One page of the people who can join the group. */
export const useGroupCandidates = (params: GroupCandidateParams, enabled: boolean) =>
    useQuery({
        queryKey: [...GROUPS, 'candidates', params],
        queryFn: () => groupRoleApi.candidates(params),
        enabled,
        placeholderData: keepPreviousData,
    });

export function useGroupRoleMutations() {
    const qc = useQueryClient();
    // Membership moves change Role Templates member counts, and may change the caller's own role
    const invalidateAround = () => {
        qc.invalidateQueries({ queryKey: KEY });
        qc.invalidateQueries({ queryKey: ME_KEY });
    };
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: GROUPS });
        invalidateAround();
    };
    // A dialog save only marks the group queries stale, so its confirm holds still; refreshList runs once it has closed
    const markStale = () => {
        qc.invalidateQueries({ queryKey: GROUPS, refetchType: 'none' });
        invalidateAround();
    };
    return {
        create: useMutation({ mutationFn: (p: GroupRoleCreatePayload) => groupRoleApi.create(p), onSuccess: markStale }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: GroupRoleUpdatePayload }) => groupRoleApi.update(v.id, v.payload),
            onSuccess: markStale,
        }),
        remove: useMutation({ mutationFn: (id: number) => groupRoleApi.remove(id), onSuccess: invalidate }),
        refreshList: () => qc.refetchQueries({ queryKey: GROUPS, exact: true }),
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
