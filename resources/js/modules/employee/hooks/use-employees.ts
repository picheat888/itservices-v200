import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { ME_KEY } from '@/shared/lib/query-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { employeeApi, type EmployeePayload, type UpdateCredentialsPayload } from '../api/employeeApi';
import { DEPT, EMP } from './query-keys';

export const useEmployees = () => useQuery({ queryKey: EMP, queryFn: employeeApi.list });
export const useEmployeeSummary = (enabled = true) => useQuery({ queryKey: ['employees-summary'], queryFn: employeeApi.summary, enabled });

// The Employees badge (active staff without a login account) now comes from the combined
// /api/sidebar-badges endpoint — see shared/hooks/use-sidebar-badges. The same number still
// reaches the Directory tab through `summary.no_account`.

/** Fetches a single employee by id (used to open a record from a notification link). */
export const useEmployee = (id: number | null) =>
    useQuery({
        queryKey: ['employee', id],
        queryFn: () => employeeApi.get(id as number),
        enabled: id != null,
    });

/** Assets the employee currently holds — powers the Employee detail's read-only Assets tab. */
export const useEmployeeAssets = (id: number | null) =>
    useQuery({
        queryKey: ['employee-assets', id],
        queryFn: () => employeeApi.assets(id as number),
        enabled: id != null,
    });

/** Tickets the employee has requested — powers the Employee detail's read-only Tickets tab. */
export const useEmployeeTickets = (id: number | null) =>
    useQuery({
        queryKey: ['employee-tickets', id],
        queryFn: () => employeeApi.tickets(id as number),
        enabled: id != null,
    });

/** Access memberships the employee holds — powers the Employee detail's read-only Access tab. */
export const useEmployeeAccess = (id: number | null) =>
    useQuery({
        queryKey: ['employee-access', id],
        queryFn: () => employeeApi.access(id as number),
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

export function useEmployeeMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: EMP });
        qc.invalidateQueries({ queryKey: DEPT });
        qc.invalidateQueries({ queryKey: ['employees-directory'] });
        qc.invalidateQueries({ queryKey: ['employees-summary'] });
        qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
        // Single-employee detail + org/access views so an open dialog reflects changes live.
        qc.invalidateQueries({ queryKey: ['employee'] });
        qc.invalidateQueries({ queryKey: ['org-chart'] });
        qc.invalidateQueries({ queryKey: ['employee-access'] });
        // The signed-in user's own record when they edit themselves — otherwise the topbar
        // and profile drawer keep showing the old name until a reload.
        qc.invalidateQueries({ queryKey: ME_KEY });
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
        updateCredentials: useMutation({
            mutationFn: (v: { id: number; payload: UpdateCredentialsPayload }) => employeeApi.updateCredentials(v.id, v.payload),
            onSuccess: invalidate,
        }),
        setCredentials: useMutation({
            mutationFn: (v: { id: number; username: string; password: string; password_confirmation: string; force_change: boolean }) =>
                employeeApi.setCredentials(v.id, {
                    username: v.username,
                    password: v.password,
                    password_confirmation: v.password_confirmation,
                    force_change: v.force_change,
                }),
            onSuccess: invalidate,
        }),
    };
}
