import { http } from '@/shared/lib/http';
import type { ApiEnvelope, LocationItem } from '@/shared/types';
import { mutate } from './http-helpers';

export const locationApi = {
    list: () => http.get<ApiEnvelope<LocationItem[]>>('/locations').then((r) => r.data.data),
    create: (name: string) => mutate<LocationItem>('post', '/locations', { name }),
    update: (id: number, name: string) => mutate<LocationItem>('put', `/locations/${id}`, { name }),
    remove: (id: number) => mutate<void>('delete', `/locations/${id}`),
};
