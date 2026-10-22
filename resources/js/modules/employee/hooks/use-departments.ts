import { FRESH_LIST, type LookupOptions } from '@/shared/lib/freshness';
import type { Department } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentApi } from '../api/departmentApi';
import { DEPT } from './query-keys';

export const useDepartments = (opts: LookupOptions = {}) => useQuery({ queryKey: DEPT, queryFn: departmentApi.list, ...FRESH_LIST, ...opts });

/** Employees in a department — loaded on demand for the "view members" dialog. */
export function useDepartmentMembers(id: number | null) {
    return useQuery({
        queryKey: ['departments', id, 'members'],
        queryFn: () => departmentApi.members(id as number),
        enabled: id != null,
    });
}

export function useDepartmentMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: DEPT });
    return {
        create: useMutation({ mutationFn: (p: Partial<Department>) => departmentApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: Partial<Department> }) => departmentApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => departmentApi.remove(id), onSuccess: invalidate }),
    };
}
