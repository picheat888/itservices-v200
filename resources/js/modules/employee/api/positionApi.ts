import { http } from '@/shared/lib/http';
import type { ApiEnvelope, Employee, Position } from '@/shared/types';
import { mutate } from './http-helpers';

export const positionApi = {
    list: () => http.get<ApiEnvelope<Position[]>>('/positions').then((r) => r.data.data),
    members: (id: number) => http.get<ApiEnvelope<Employee[]>>(`/positions/${id}/members`).then((r) => r.data.data),
    create: (payload: { title: string; allow_special_position?: boolean }) => mutate<Position>('post', '/positions', payload),
    update: (id: number, payload: { title: string; allow_special_position?: boolean }) => mutate<Position>('put', `/positions/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/positions/${id}`),
};
