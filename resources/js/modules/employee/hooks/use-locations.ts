import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { locationApi } from '../api/locationApi';
import { LOC } from './query-keys';

export const useLocations = () => useQuery({ queryKey: LOC, queryFn: locationApi.list });

export function useLocationMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: LOC });
    return {
        create: useMutation({ mutationFn: (name: string) => locationApi.create(name), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; name: string }) => locationApi.update(v.id, v.name), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => locationApi.remove(id), onSuccess: invalidate }),
    };
}
