import { accessApi } from '../api/accessApi';
import type { AccessKind } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const useEmailGroups = () => useQuery({ queryKey: ['email-groups'], queryFn: accessApi.emailGroups });
export const useFileShares = () => useQuery({ queryKey: ['file-shares'], queryFn: accessApi.fileShares });
export const useSocialPlatforms = () => useQuery({ queryKey: ['social-platforms'], queryFn: accessApi.socialPlatforms });
export const useSoftware = () => useQuery({ queryKey: ['software'], queryFn: accessApi.software });

/** Set/clear an email group's owner (workflow approver). Refreshes the group list + employee access. */
export const useSetEmailGroupOwner = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { id: number; ownerEmployeeId: number | null }) => accessApi.setEmailGroupOwner(v.id, v.ownerEmployeeId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['email-groups'] });
            qc.invalidateQueries({ queryKey: ['employee-access'] });
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
        },
    });
};

export const useResourceMembers = (kind: AccessKind, id: number | null) =>
    useQuery({ queryKey: [kind, id, 'members'], queryFn: () => accessApi.members(kind, id as number), enabled: id != null });

export const useEmployeeAccess = (employeeId: number | null) =>
    useQuery({ queryKey: ['employee-access', employeeId], queryFn: () => accessApi.employeeAccess(employeeId as number), enabled: employeeId != null });

export function useAccessMutations(kind: AccessKind) {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [kind] });
        qc.invalidateQueries({ queryKey: ['employee-access'] });
    };
    return {
        create: useMutation({ mutationFn: (p: Record<string, unknown>) => accessApi.createResource(kind, p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: Record<string, unknown> }) => accessApi.updateResource(kind, v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => accessApi.removeResource(kind, id), onSuccess: invalidate }),
        addMember: useMutation({ mutationFn: (v: { id: number; payload: { employee_id: number; access_level?: string | null; purpose?: string | null } }) => accessApi.addMember(kind, v.id, v.payload), onSuccess: invalidate }),
        revokeMember: useMutation({ mutationFn: (v: { id: number; membershipId: number }) => accessApi.revokeMember(kind, v.id, v.membershipId), onSuccess: invalidate }),
    };
}
