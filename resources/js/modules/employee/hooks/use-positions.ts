import { FRESH_LIST, FRESH_VIEW, type LookupOptions } from '@/shared/lib/freshness';
import { dropNew, markNew } from '@/stores/new-rows';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positionApi } from '../api/positionApi';
import { POS } from './query-keys';

export const usePositions = (opts: LookupOptions = {}) => useQuery({ queryKey: POS, queryFn: positionApi.list, ...FRESH_LIST, ...opts });

/** Employees holding a position — loaded on demand for the "view members" dialog. */
export function usePositionMembers(id: number | null, enabled = true) {
    return useQuery({
        queryKey: ['positions', id, 'members'],
        queryFn: () => positionApi.members(id as number),
        enabled: id != null && enabled,
        ...FRESH_VIEW,
    });
}

export function usePositionMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: POS });
    return {
        create: useMutation({
            mutationFn: (p: { title: string; allow_special_position?: boolean }) => positionApi.create(p),
            onSuccess: (position) => {
                markNew('positions', position.id);
                return invalidate();
            },
        }),
        update: useMutation({
            mutationFn: (v: { id: number; title: string; allow_special_position?: boolean }) =>
                positionApi.update(v.id, { title: v.title, allow_special_position: v.allow_special_position }),
            onSuccess: invalidate,
        }),
        remove: useMutation({
            mutationFn: (id: number) => positionApi.remove(id),
            onSuccess: (_, id) => {
                dropNew('positions', id);
                return invalidate();
            },
        }),
    };
}
