import { http } from '@/shared/lib/http';
import type { ApiEnvelope, Employee, Section } from '@/shared/types';
import { mutate } from './http-helpers';

export const sectionApi = {
    list: (departmentId?: number | null) =>
        http.get<ApiEnvelope<Section[]>>('/sections', { params: departmentId ? { department_id: departmentId } : {} }).then((r) => r.data.data),
    members: (id: number) => http.get<ApiEnvelope<Employee[]>>(`/sections/${id}/members`).then((r) => r.data.data),
    create: (payload: { department_id: number; name: string; name_th?: string | null }) => mutate<Section>('post', '/sections', payload),
    update: (id: number, payload: { department_id: number; name: string; name_th?: string | null }) =>
        mutate<Section>('put', `/sections/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/sections/${id}`),
};
