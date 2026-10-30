import { FRESH_LIST, FRESH_VIEW, type LookupOptions } from '@/shared/lib/freshness';
import type { Department } from '@/shared/types';
import { dropNew, markNew } from '@/stores/new-rows';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentApi } from '../api/departmentApi';
import { DEPT, EMP } from './query-keys';

export const useDepartments = (opts: LookupOptions = {}) => useQuery({ queryKey: DEPT, queryFn: departmentApi.list, ...FRESH_LIST, ...opts });

/** Employees in a department — loaded on demand for the "view members" dialog. */
export function useDepartmentMembers(id: number | null, enabled = true) {
    return useQuery({
        queryKey: ['departments', id, 'members'],
        queryFn: () => departmentApi.members(id as number),
        enabled: id != null && enabled,
        ...FRESH_VIEW,
    });
}

export function useDepartmentMutations() {
    const qc = useQueryClient();
    // A department's name also shows on its sections, the employee rows, the employee view and the org chart
    const invalidate = () =>
        Promise.all(
            [DEPT, ['sections'], EMP, ['employees-directory'], ['org-chart'], ['employee']].map((queryKey) => qc.invalidateQueries({ queryKey })),
        );
    return {
        create: useMutation({
            mutationFn: (p: Partial<Department>) => departmentApi.create(p),
            onSuccess: (department) => {
                markNew('departments', department.id);
                return invalidate();
            },
        }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: Partial<Department> }) => departmentApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({
            mutationFn: (id: number) => departmentApi.remove(id),
            onSuccess: (_, id) => {
                dropNew('departments', id);
                return invalidate();
            },
        }),
    };
}
