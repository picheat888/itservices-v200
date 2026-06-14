import { departmentApi, employeeApi, locationApi, positionApi, sectionApi, type EmployeePayload } from '@/services/orgApi';
import type { Department, Position } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const EMP = ['employees'] as const;
const DEPT = ['departments'] as const;
const POS = ['positions'] as const;
const LOC = ['locations'] as const;

export const useEmployees = () => useQuery({ queryKey: EMP, queryFn: employeeApi.list });
export const useEmployeeSummary = () => useQuery({ queryKey: ['employees-summary'], queryFn: employeeApi.summary });

/** Fetches a single employee by id (used to open a record from a notification link). */
export const useEmployee = (id: number | null) =>
    useQuery({
        queryKey: ['employee', id],
        queryFn: () => employeeApi.get(id as number),
        enabled: id != null,
    });

/** The employee's approval chain (direct manager first, up to the root of the reporting tree). */
export function useApprovalChain(id: number | null) {
    return useQuery({
        queryKey: ['approval-chain', id],
        queryFn: () => employeeApi.approvalChain(id as number),
        enabled: id !== null,
    });
}

/** Fetches the full org chart tree (all employees with manager relationships). */
export function useOrgChart() {
    return useQuery({ queryKey: ['org-chart'], queryFn: employeeApi.orgChart });
}

/** Paginated directory query — search and department filter are server-side. */
export const useEmployeeDirectory = (params: { page: number; per_page: number; search: string; department_id: string; status: string }) =>
    useQuery({
        queryKey: ['employees-directory', params],
        queryFn: () =>
            employeeApi.listDirectory({
                page: params.page,
                per_page: params.per_page,
                search: params.search || undefined,
                department_id: params.department_id !== 'all' ? params.department_id : undefined,
                status: params.status !== 'all' ? params.status : undefined,
            }),
        placeholderData: (prev) => prev,
    });
export const useDepartments = () => useQuery({ queryKey: DEPT, queryFn: departmentApi.list });

/** Employees in a department — loaded on demand for the "view members" dialog. */
export function useDepartmentMembers(id: number | null) {
    return useQuery({
        queryKey: ['departments', id, 'members'],
        queryFn: () => departmentApi.members(id as number),
        enabled: id != null,
    });
}
export const usePositions = () => useQuery({ queryKey: POS, queryFn: positionApi.list });

/** Employees holding a position — loaded on demand for the "view members" dialog. */
export function usePositionMembers(id: number | null) {
    return useQuery({
        queryKey: ['positions', id, 'members'],
        queryFn: () => positionApi.members(id as number),
        enabled: id != null,
    });
}
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
        update: useMutation({
            mutationFn: (v: { id: number; payload: EmployeePayload }) => employeeApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => employeeApi.remove(id), onSuccess: invalidate }),
        resign: useMutation({
            mutationFn: (v: { id: number; reason: string; lastDay: string | null }) => employeeApi.resign(v.id, v.reason, v.lastDay),
            onSuccess: invalidate,
        }),
        cancelResign: useMutation({
            mutationFn: (id: number) => employeeApi.cancelResign(id),
            onSuccess: invalidate,
        }),
        import: useMutation({
            mutationFn: (file: File) => employeeApi.import(file),
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
        update: useMutation({
            mutationFn: (v: { id: number; title: string }) => positionApi.update(v.id, { title: v.title }),
            onSuccess: invalidate,
        }),
        remove: useMutation({ mutationFn: (id: number) => positionApi.remove(id), onSuccess: invalidate }),
    };
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

export type { Department, Position };
