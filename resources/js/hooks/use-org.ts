import { departmentApi, employeeApi, locationApi, positionApi, type EmployeePayload } from '@/services/orgApi';
import type { Department, Position } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const EMP = ['employees'] as const;
const DEPT = ['departments'] as const;
const POS = ['positions'] as const;
const LOC = ['locations'] as const;

export const useEmployees = () => useQuery({ queryKey: EMP, queryFn: employeeApi.list });
export const useEmployeeSummary = () => useQuery({ queryKey: ['employees-summary'], queryFn: employeeApi.summary });

/** Paginated directory query — search and department filter are server-side. */
export const useEmployeeDirectory = (params: { page: number; per_page: number; search: string; department_id: string }) =>
    useQuery({
        queryKey: ['employees-directory', params],
        queryFn: () =>
            employeeApi.listDirectory({
                page: params.page,
                per_page: params.per_page,
                search: params.search || undefined,
                department_id: params.department_id !== 'all' ? params.department_id : undefined,
            }),
        placeholderData: (prev) => prev,
    });
export const useDepartments = () => useQuery({ queryKey: DEPT, queryFn: departmentApi.list });
export const usePositions = () => useQuery({ queryKey: POS, queryFn: positionApi.list });
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

export function useEmployeeMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: EMP });
        qc.invalidateQueries({ queryKey: DEPT });
        qc.invalidateQueries({ queryKey: ['employees-directory'] });
        qc.invalidateQueries({ queryKey: ['employees-summary'] });
    };
    return {
        create: useMutation({ mutationFn: (p: EmployeePayload) => employeeApi.create(p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: EmployeePayload }) => employeeApi.update(v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => employeeApi.remove(id), onSuccess: invalidate }),
        resign: useMutation({
            mutationFn: (v: { id: number; reason: string; lastDay: string | null }) => employeeApi.resign(v.id, v.reason, v.lastDay),
            onSuccess: invalidate,
        }),
        resetPassword: useMutation({
            mutationFn: (id: number) => employeeApi.resetPassword(id),
        }),
        setCredentials: useMutation({
            mutationFn: (v: { id: number; username: string; password: string; password_confirmation: string }) =>
                employeeApi.setCredentials(v.id, { username: v.username, password: v.password, password_confirmation: v.password_confirmation }),
            onSuccess: invalidate,
        }),
    };
}

export function usePositionMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: POS });
    return {
        create: useMutation({ mutationFn: (p: { title: string }) => positionApi.create(p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; title: string }) => positionApi.update(v.id, { title: v.title }), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => positionApi.remove(id), onSuccess: invalidate }),
    };
}

export function useDepartmentMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: DEPT });
    return {
        create: useMutation({ mutationFn: (p: Partial<Department>) => departmentApi.create(p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: Partial<Department> }) => departmentApi.update(v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => departmentApi.remove(id), onSuccess: invalidate }),
    };
}

export type { Position, Department };
