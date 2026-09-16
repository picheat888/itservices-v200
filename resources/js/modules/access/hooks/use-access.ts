import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import type { AccessKind } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accessApi } from '../api/accessApi';

/** Aggregate figures for the Access Directory overview tab. */
/**
 * The signed-in person's own access — the lower half of My assets & access.
 *
 * Separate from useAccessSummary and the registry lists: those need the directory master,
 * this one needs only the right to look at yourself.
 */
export const useMyAccess = (enabled = true) => useQuery({ queryKey: ['access-mine'], queryFn: accessApi.mine, enabled });

export const useAccessSummary = (enabled = true) => useQuery({ queryKey: ['access-summary'], queryFn: accessApi.summary, enabled });

// The Access sidebar badge (governance anomalies) now comes from the combined
// /api/sidebar-badges endpoint — see shared/hooks/use-sidebar-badges.

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
            qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
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
            qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
        },
    });
};

export const useResourceMembers = (kind: AccessKind, id: number | null) =>
    useQuery({ queryKey: [kind, id, 'members'], queryFn: () => accessApi.members(kind, id as number), enabled: id != null });

/**
 * Revoke one grant from the governance queue. Routed through the registry's own endpoint so
 * that registry's edit permission still decides — the drill-down lists rows from all four,
 * so the kind travels with the call rather than being baked into the hook.
 */
export const useRevokeGrant = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (v: { kind: AccessKind; id: number; membershipId: number }) => accessApi.revokeMember(v.kind, v.id, v.membershipId),
        onSuccess: (_data, v) => {
            qc.invalidateQueries({ queryKey: [v.kind] });
            qc.invalidateQueries({ queryKey: ['employee-access'] });
            qc.invalidateQueries({ queryKey: ['access-summary'] });
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
        },
    });
};
export function useAccessMutations(kind: AccessKind) {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [kind] });
        qc.invalidateQueries({ queryKey: ['employee-access'] });
        qc.invalidateQueries({ queryKey: ['access-summary'] }); // governance card
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
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
