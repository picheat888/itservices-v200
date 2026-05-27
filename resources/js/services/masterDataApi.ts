import type { ApiEnvelope, AssetModel, Brand, Category, CategoryType, Vendor, Warehouse } from '@/types';
import { ensureCsrf, http } from './http';

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const brandApi = {
    list: () => http.get<ApiEnvelope<Brand[]>>('/brands').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Brand>('post', '/brands', payload),
    update: (id: number, payload: { name: string; description?: string }) => mutate<Brand>('put', `/brands/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/brands/${id}`),
};

export const assetModelApi = {
    list: () => http.get<ApiEnvelope<AssetModel[]>>('/asset-models').then((r) => r.data.data),
    create: (payload: { name: string; brand_id?: number | null; description?: string }) =>
        mutate<AssetModel>('post', '/asset-models', payload),
    update: (id: number, payload: { name: string; brand_id?: number | null; description?: string }) =>
        mutate<AssetModel>('put', `/asset-models/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/asset-models/${id}`),
};

export const categoryApi = {
    list: () => http.get<ApiEnvelope<Category[]>>('/categories').then((r) => r.data.data),
    create: (payload: { name: string; type: CategoryType; description?: string }) =>
        mutate<Category>('post', '/categories', payload),
    update: (id: number, payload: { name: string; type: CategoryType; description?: string }) =>
        mutate<Category>('put', `/categories/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/categories/${id}`),
};

export const vendorApi = {
    list: () => http.get<ApiEnvelope<Vendor[]>>('/vendors').then((r) => r.data.data),
    create: (payload: { name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
        mutate<Vendor>('post', '/vendors', payload),
    update: (
        id: number,
        payload: { name: string; contact?: string; phone?: string; email?: string; address?: string },
    ) => mutate<Vendor>('put', `/vendors/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/vendors/${id}`),
};

export const warehouseApi = {
    list: () => http.get<ApiEnvelope<Warehouse[]>>('/warehouses').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Warehouse>('post', '/warehouses', payload),
    update: (id: number, payload: { name: string; description?: string }) =>
        mutate<Warehouse>('put', `/warehouses/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/warehouses/${id}`),
};
