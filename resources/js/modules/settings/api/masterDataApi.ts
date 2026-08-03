import { ensureCsrf, http } from '@/shared/lib/http';
import type {
    ApiEnvelope,
    AssetModel,
    Brand,
    Category,
    RequestOption,
    RequestOptionList,
    Unit,
    Vendor,
    Warehouse,
    WarrantyType,
} from '@/shared/types';

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
    create: (payload: { name: string; brand_id?: number | null; description?: string }) => mutate<AssetModel>('post', '/asset-models', payload),
    update: (id: number, payload: { name: string; brand_id?: number | null; description?: string }) =>
        mutate<AssetModel>('put', `/asset-models/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/asset-models/${id}`),
};

export const categoryApi = {
    list: () => http.get<ApiEnvelope<Category[]>>('/categories').then((r) => r.data.data),
    create: (payload: { name: string; name_th?: string; icon?: string | null; description?: string }) =>
        mutate<Category>('post', '/categories', payload),
    update: (id: number, payload: { name: string; name_th?: string; icon?: string | null; description?: string }) =>
        mutate<Category>('put', `/categories/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/categories/${id}`),
};

export const vendorApi = {
    list: () => http.get<ApiEnvelope<Vendor[]>>('/vendors').then((r) => r.data.data),
    create: (payload: { name: string; name_th?: string; contact?: string; phone?: string; email?: string; address?: string }) =>
        mutate<Vendor>('post', '/vendors', payload),
    update: (id: number, payload: { name: string; name_th?: string; contact?: string; phone?: string; email?: string; address?: string }) =>
        mutate<Vendor>('put', `/vendors/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/vendors/${id}`),
};

export const warehouseApi = {
    list: () => http.get<ApiEnvelope<Warehouse[]>>('/warehouses').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Warehouse>('post', '/warehouses', payload),
    update: (id: number, payload: { name: string; description?: string }) => mutate<Warehouse>('put', `/warehouses/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/warehouses/${id}`),
};

export const unitApi = {
    list: () => http.get<ApiEnvelope<Unit[]>>('/units').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Unit>('post', '/units', payload),
    update: (id: number, payload: { name: string; description?: string }) => mutate<Unit>('put', `/units/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/units/${id}`),
};

export interface RequestOptionPayload {
    request_type: string;
    field_key: string;
    label_en: string;
    label_th?: string | null;
    active?: boolean;
}

/** The ids of one list, in the order they should be offered. */
export interface RequestOptionOrder {
    request_type: string;
    field_key: string;
    ids: number[];
}

/** Request-form choice lists (Hardware/Mobile device, Telephone handset). */
export const requestOptionApi = {
    list: () => http.get<ApiEnvelope<{ lists: RequestOptionList[]; options: RequestOption[] }>>('/request-options').then((r) => r.data.data),
    create: (payload: RequestOptionPayload) => mutate<RequestOption>('post', '/request-options', payload),
    update: (id: number, payload: Omit<RequestOptionPayload, 'request_type' | 'field_key'>) =>
        mutate<RequestOption>('put', `/request-options/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/request-options/${id}`),
    reorder: (payload: RequestOptionOrder) => mutate<RequestOption[]>('post', '/request-options/reorder', payload),
};

export const warrantyTypeApi = {
    list: () => http.get<ApiEnvelope<WarrantyType[]>>('/warranty-types').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<WarrantyType>('post', '/warranty-types', payload),
    update: (id: number, payload: { name: string; description?: string }) => mutate<WarrantyType>('put', `/warranty-types/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/warranty-types/${id}`),
};
