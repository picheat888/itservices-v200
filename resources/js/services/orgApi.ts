import type { ApiEnvelope, Department, Employee, LocationItem, Position } from '@/types';
import { ensureCsrf, http } from './http';

export interface EmployeeSummary {
    total: number;
    new_hires: number;
    recent: Employee[];
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

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export interface EmployeePayload {
    name: string;
    code?: string;
    name_th?: string | null;
    department_id?: number | null;
    position_id?: number | null;
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
    remove: (id: number) => mutate<void>('delete', `/employees/${id}`),
    resign: (id: number, reason: string, lastDay: string | null) =>
        mutate<Employee>('post', `/employees/${id}/resign`, { reason, last_day: lastDay }),
    cancelResign: (id: number) =>
        mutate<Employee>('post', `/employees/${id}/cancel-resign`),
    resetPassword: (id: number) =>
        mutate<{ new_password: string }>('post', `/employees/${id}/reset-password`),
    setCredentials: async (id: number, payload: { username: string; password: string; password_confirmation: string }) => {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<{ message: string }>>(`/employees/${id}/credentials`, payload);
        return data;
    },
    downloadImportTemplate: () =>
        http.get('/employees/import-template', { responseType: 'blob' }).then((r) => r.data as Blob),
    import: async (file: File) => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await http.post<{ message: string; imported: number }>('/employees/import', fd);
        return data;
    },
};

export const departmentApi = {
    list: () => http.get<ApiEnvelope<Department[]>>('/departments').then((r) => r.data.data),
    members: (id: number) => http.get<ApiEnvelope<Employee[]>>(`/departments/${id}/members`).then((r) => r.data.data),
    create: (payload: Partial<Department>) => mutate<Department>('post', '/departments', payload),
    update: (id: number, payload: Partial<Department>) => mutate<Department>('put', `/departments/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/departments/${id}`),
};

export const positionApi = {
    list: () => http.get<ApiEnvelope<Position[]>>('/positions').then((r) => r.data.data),
    create: (payload: { title: string }) => mutate<Position>('post', '/positions', payload),
    update: (id: number, payload: { title: string }) => mutate<Position>('put', `/positions/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/positions/${id}`),
};

export const locationApi = {
    list: () => http.get<ApiEnvelope<LocationItem[]>>('/locations').then((r) => r.data.data),
    create: (name: string) => mutate<LocationItem>('post', '/locations', { name }),
    update: (id: number, name: string) => mutate<LocationItem>('put', `/locations/${id}`, { name }),
    remove: (id: number) => mutate<void>('delete', `/locations/${id}`),
};
