import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, ApproverNode, Employee, EmployeeAccess, OrgChartNode, TicketCategory, TicketPriority, TicketStatus } from '@/shared/types';
import { mutate } from './http-helpers';

/** One month on the hiring-trend chart. `month` is 'YYYY-MM'. */
export interface EmployeeHiresMonth {
    month: string;
    count: number;
}

export interface EmployeeSummary {
    total: number;
    new_hires: number;
    active: number;
    resigned: number;
    resigned_this_year: number;
    /** Active employees still without a login account — drives the Directory tab badge. */
    no_account: number;
    hires_by_month: EmployeeHiresMonth[];
    recent: Employee[];
    recent_resignations: Employee[];
}

/** A read-only asset row held by an employee — for the Employee detail's Assets tab. */
export interface EmployeeHeldAsset {
    id: number;
    asset_code: string;
    tag: string | null;
    model: string | null;
    type: string | null;
    type_th: string | null;
    serial: string | null;
    status: string;
    owned_since: string | null;
}

/** A read-only ticket row requested by an employee — for the Employee detail's Tickets tab. */
export interface EmployeeRequestedTicket {
    id: number;
    ticket_no: string;
    subject: string;
    category: TicketCategory;
    priority: TicketPriority | null;
    status: TicketStatus;
    created_at: string | null;
}

export interface EmployeePageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface EmployeePageResponse {
    data: Employee[];
    meta: EmployeePageMeta;
}

/** PUT /employees/{id}/credentials — username edit and/or password reset for an existing account. */
export interface UpdateCredentialsPayload {
    username?: string;
    reset_password?: boolean;
    password?: string;
    force_change?: boolean;
}

export interface EmployeePayload {
    first_name: string;
    last_name: string;
    first_name_th?: string | null;
    last_name_th?: string | null;
    code?: string;
    department_id?: number | null;
    position_id?: number | null;
    section_id?: number | null;
    manager_id?: number | null;
    email?: string | null;
    username?: string | null;
    phone?: string | null;
    joined_at?: string | null;
    photo?: File | null;
}

function toFormData(payload: EmployeePayload): FormData {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        fd.append(k, v as string | Blob);
    });
    return fd;
}

function withoutPhoto(payload: EmployeePayload): Omit<EmployeePayload, 'photo'> {
    const copy = { ...payload };
    delete copy.photo;
    return copy;
}

export const employeeApi = {
    list: () => http.get<ApiEnvelope<Employee[]>>('/employees').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Employee>>(`/employees/${id}`).then((r) => r.data.data),
    // Assets the employee currently holds (read-only, gated by employees.view).
    assets: (id: number) => http.get<ApiEnvelope<EmployeeHeldAsset[]>>(`/employees/${id}/assets`).then((r) => r.data.data),
    access: (id: number) => http.get<ApiEnvelope<EmployeeAccess>>(`/employees/${id}/access`).then((r) => r.data.data),
    tickets: (id: number) => http.get<ApiEnvelope<EmployeeRequestedTicket[]>>(`/employees/${id}/tickets`).then((r) => r.data.data),
    summary: () => http.get<EmployeeSummary>('/employees/summary').then((r) => r.data),
    listDirectory: (params: { page: number; per_page: number; search?: string; department_id?: string; status?: string }) =>
        http.get<EmployeePageResponse>('/employees', { params }).then((r) => r.data),
    create: async (payload: EmployeePayload) => {
        await ensureCsrf();
        // Multipart when a photo is attached, plain JSON otherwise.
        const body = payload.photo instanceof File ? toFormData(payload) : withoutPhoto(payload);
        const { data } = await http.post<ApiEnvelope<Employee>>('/employees', body);
        return data.data;
    },
    update: async (id: number, payload: EmployeePayload) => {
        await ensureCsrf();
        // Multipart (spoofed PUT) when a new photo is attached, JSON otherwise.
        if (payload.photo instanceof File) {
            const fd = toFormData(payload);
            fd.append('_method', 'PUT');
            const { data } = await http.post<ApiEnvelope<Employee>>(`/employees/${id}`, fd);
            return data.data;
        }
        const { data } = await http.put<ApiEnvelope<Employee>>(`/employees/${id}`, withoutPhoto(payload));
        return data.data;
    },
    approvalChain: (id: number) => http.get<ApiEnvelope<ApproverNode[]>>(`/employees/${id}/approval-chain`).then((r) => r.data.data),
    orgChart: () => http.get<ApiEnvelope<OrgChartNode[]>>('/employees/org-chart').then((r) => r.data.data),
    remove: (id: number) => mutate<void>('delete', `/employees/${id}`),
    resign: (id: number, reason: string, lastDay: string | null) =>
        mutate<Employee>('post', `/employees/${id}/resign`, { reason, last_day: lastDay }),
    cancelResign: (id: number) => mutate<Employee>('post', `/employees/${id}/cancel-resign`),
    /** Manage an existing account: change username and/or reset the password (returns new_password when reset). */
    updateCredentials: async (id: number, payload: UpdateCredentialsPayload) => {
        // NOTE: this endpoint returns { message, new_password } at the top level
        // (not wrapped in an ApiEnvelope `data` key), so it must NOT go through
        // mutate() — that unwraps `.data` and would yield undefined.
        await ensureCsrf();
        const { data } = await http.put<{ message: string; new_password?: string }>(`/employees/${id}/credentials`, payload);
        return data;
    },
    setCredentials: async (id: number, payload: { username: string; password: string; password_confirmation: string; force_change: boolean }) => {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<{ message: string }>>(`/employees/${id}/credentials`, payload);
        return data;
    },
    downloadImportTemplate: () => http.get('/employees/import-template', { responseType: 'blob' }).then((r) => r.data as Blob),
    import: async (file: File) => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await http.post<{ message: string; imported: number }>('/employees/import', fd);
        return data;
    },
};
