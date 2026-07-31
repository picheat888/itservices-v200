import { http } from '@/shared/lib/http';
import type { ApiEnvelope, Department, Employee } from '@/shared/types';
import { mutate } from './http-helpers';

export const departmentApi = {
    list: () => http.get<ApiEnvelope<Department[]>>('/departments').then((r) => r.data.data),
    members: (id: number) => http.get<ApiEnvelope<Employee[]>>(`/departments/${id}/members`).then((r) => r.data.data),
    create: (payload: Partial<Department>) => mutate<Department>('post', '/departments', payload),
    update: (id: number, payload: Partial<Department>) => mutate<Department>('put', `/departments/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/departments/${id}`),
};
