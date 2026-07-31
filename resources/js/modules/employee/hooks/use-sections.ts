import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sectionApi } from '../api/sectionApi';
import { EMP } from './query-keys';

export function useSections(departmentId?: number | null) {
    return useQuery({
        queryKey: ['sections', departmentId ?? 'all'],
        queryFn: () => sectionApi.list(departmentId),
    });
}

/** Employees assigned to a section — loaded on demand for the "view members" dialog. */
export function useSectionMembers(id: number | null) {
    return useQuery({
        queryKey: ['sections', id, 'members'],
        queryFn: () => sectionApi.members(id as number),
        enabled: id != null,
    });
}

export function useSectionMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['sections'] });
        qc.invalidateQueries({ queryKey: EMP });
        qc.invalidateQueries({ queryKey: ['employees-directory'] });
    };
    return {
        create: useMutation({
            mutationFn: (p: { department_id: number; name: string; name_th?: string | null }) => sectionApi.create(p),
            onSuccess: invalidate,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: { department_id: number; name: string; name_th?: string | null } }) =>
                sectionApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => sectionApi.remove(id), onSuccess: invalidate }),
    };
}
