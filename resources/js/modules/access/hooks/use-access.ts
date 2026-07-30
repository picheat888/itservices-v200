import type { AccessKind } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accessApi } from '../api/accessApi';

/** Aggregate figures for the Access Directory overview tab. */
export const useAccessSummary = (enabled = true) => useQuery({ queryKey: ['access-summary'], queryFn: accessApi.summary, enabled });

/**
 * "Needs attention" count for the sidebar badge — the same anomalies the Overview's
 * governance card lists: shares with no active member, resources missing an owner,
 * and resigned employees still holding an active grant. `enabled` should mirror
 * access.overview (the endpoint's gate, and where the badge leads).
 */
export function useAccessSidebarBadge(enabled = true): number {
    const { data } = useAccessSummary(enabled);
    const gov = data?.governance;
    if (!gov) return 0;

    return gov.empty_resources + gov.no_owner + gov.resigned_holders;
}

// `enabled` mirrors the per-registry view permission — a tab the user can't see never fetches (no 403 noise).
export const useEmailGroups = (enabled = true) => useQuery({ queryKey: ['email-groups'], queryFn: accessApi.emailGroups, enabled });
export const useFileShares = (enabled = true) => useQuery({ queryKey: ['file-shares'], queryFn: accessApi.fileShares, enabled });
export const useSocialPlatforms = (enabled = true) => useQuery({ queryKey: ['social-platforms'], queryFn: accessApi.socialPlatforms, enabled });
export const useSoftware = (enabled = true) => useQuery({ queryKey: ['software'], queryFn: accessApi.software, enabled });

/** Set/clear an email group's owner (workflow approver). Refreshes the group list + employee access. */
export const useSetEmailGroupOwner = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { id: number; ownerEmployeeId: number | null }) => accessApi.setEmailGroupOwner(v.id, v.ownerEmployeeId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['email-groups'] });
            qc.invalidateQueries({ queryKey: ['employee-access'] });
            qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card + sidebar badge
        },
    });
};

/** Set/clear a file share's owner. Refreshes the share list + employee access. */
export const useSetFileShareOwner = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { id: number; ownerEmployeeId: number | null }) => accessApi.setFileShareOwner(v.id, v.ownerEmployeeId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['file-shares'] });
            qc.invalidateQueries({ queryKey: ['employee-access'] });
            qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card + sidebar badge
        },
    });
};

export const useResourceMembers = (kind: AccessKind, id: number | null) =>
    useQuery({ queryKey: [kind, id, 'members'], queryFn: () => accessApi.members(kind, id as number), enabled: id != null });

export function useAccessMutations(kind: AccessKind) {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [kind] });
        qc.invalidateQueries({ queryKey: ['employee-access'] });
        qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card + sidebar badge
    };
    return {
        create: useMutation({ mutationFn: (p: Record<string, unknown>) => accessApi.createResource(kind, p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: Record<string, unknown> }) => accessApi.updateResource(kind, v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => accessApi.removeResource(kind, id), onSuccess: invalidate }),
        addMember: useMutation({
            mutationFn: (v: { id: number; payload: { employee_id: number; access_level?: string | null; purpose?: string | null } }) =>
                accessApi.addMember(kind, v.id, v.payload),
            onSuccess: invalidate,
        }),
        revokeMember: useMutation({
            mutationFn: (v: { id: number; membershipId: number }) => accessApi.revokeMember(kind, v.id, v.membershipId),
            onSuccess: invalidate,
        }),
    };
}
