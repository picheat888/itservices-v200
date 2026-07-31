import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positionApi } from '../api/positionApi';
import { POS } from './query-keys';

export const usePositions = () => useQuery({ queryKey: POS, queryFn: positionApi.list });

/** Employees holding a position — loaded on demand for the "view members" dialog. */
export function usePositionMembers(id: number | null) {
    return useQuery({
        queryKey: ['positions', id, 'members'],
        queryFn: () => positionApi.members(id as number),
        enabled: id != null,
    });
}

export function usePositionMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: POS });
    return {
        create: useMutation({ mutationFn: (p: { title: string; allow_special_position?: boolean }) => positionApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; title: string; allow_special_position?: boolean }) =>
                positionApi.update(v.id, { title: v.title, allow_special_position: v.allow_special_position }),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => positionApi.remove(id), onSuccess: invalidate }),
    };
}
