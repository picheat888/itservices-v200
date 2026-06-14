import { accessApi } from '@/services/accessApi';
import type { AccessKind } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const useEmailGroups = () => useQuery({ queryKey: ['email-groups'], queryFn: accessApi.emailGroups });
export const useFileShares = () => useQuery({ queryKey: ['file-shares'], queryFn: accessApi.fileShares });
export const useSocialPlatforms = () => useQuery({ queryKey: ['social-platforms'], queryFn: accessApi.socialPlatforms });

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
