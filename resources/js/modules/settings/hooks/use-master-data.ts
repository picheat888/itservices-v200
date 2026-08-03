import type { RequestOption, RequestOptionList } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    assetModelApi,
    brandApi,
    categoryApi,
    requestOptionApi,
    unitApi,
    vendorApi,
    warehouseApi,
    warrantyTypeApi,
    type RequestOptionOrder,
    type RequestOptionPayload,
} from '../api/masterDataApi';

const BRANDS = ['brands'] as const;
const MODELS = ['asset-models'] as const;
const CATS = ['categories'] as const;
const VENDORS = ['vendors'] as const;
const WAREHOUSES = ['warehouses'] as const;
const UNITS = ['units'] as const;
const WARRANTY_TYPES = ['warranty-types'] as const;
// Distinct from the request module's ['request-options'] — that key caches the
// New Request form's whole options payload, this one the admin list.
const REQUEST_OPTION_MASTER = ['request-option-master'] as const;

export const useBrands = () => useQuery({ queryKey: BRANDS, queryFn: brandApi.list });
export const useAssetModels = () => useQuery({ queryKey: MODELS, queryFn: assetModelApi.list });
export const useCategories = () => useQuery({ queryKey: CATS, queryFn: categoryApi.list });
export const useVendors = () => useQuery({ queryKey: VENDORS, queryFn: vendorApi.list });
export const useWarehouses = () => useQuery({ queryKey: WAREHOUSES, queryFn: warehouseApi.list });
export const useUnits = () => useQuery({ queryKey: UNITS, queryFn: unitApi.list });
export const useWarrantyTypes = () => useQuery({ queryKey: WARRANTY_TYPES, queryFn: warrantyTypeApi.list });
export const useRequestOptionLists = () => useQuery({ queryKey: REQUEST_OPTION_MASTER, queryFn: requestOptionApi.list });

type RequestOptionCache = { lists: RequestOptionList[]; options: RequestOption[] };

/**
 * Rebuild the cached options with one list in a new order, leaving every other
 * list's rows exactly where they were.
 */
function applyOrder(options: RequestOption[], order: RequestOptionOrder): RequestOption[] {
    const rank = new Map(order.ids.map((id, i) => [id, i]));
    const inList = (o: RequestOption) => o.request_type === order.request_type && o.field_key === order.field_key;
    const moved = options.filter(inList).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    let next = 0;

    return options.map((o) => (inList(o) ? moved[next++] : o));
}

/**
 * Editing a choice list changes what the New Request form offers, so the
 * request module's cached form options are invalidated alongside.
 */
export function useRequestOptionMutations() {
    const qc = useQueryClient();
    const inv = () => {
        qc.invalidateQueries({ queryKey: REQUEST_OPTION_MASTER });
        qc.invalidateQueries({ queryKey: ['request-options'] });
    };
    return {
        create: useMutation({ mutationFn: (p: RequestOptionPayload) => requestOptionApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number } & Omit<RequestOptionPayload, 'request_type' | 'field_key'>) =>
                requestOptionApi.update(v.id, { label_en: v.label_en, label_th: v.label_th, active: v.active }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => requestOptionApi.remove(id), onSuccess: inv }),
        reorder: useMutation({
            mutationFn: (p: RequestOptionOrder) => requestOptionApi.reorder(p),
            // Keep the dropped row where it was dropped: paint the new order into
            // the cache immediately instead of letting it spring back and settle.
            onMutate: (p) => {
                qc.setQueryData<RequestOptionCache>(REQUEST_OPTION_MASTER, (prev) =>
                    prev ? { ...prev, options: applyOrder(prev.options, p) } : prev,
                );
            },
            onSettled: inv,
        }),
    };
}

export function useBrandMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: BRANDS });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => brandApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) =>
                brandApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => brandApi.remove(id), onSuccess: inv }),
    };
}

export function useAssetModelMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: MODELS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; brand_id?: number | null; description?: string }) => assetModelApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; brand_id?: number | null; description?: string }) =>
                assetModelApi.update(v.id, { name: v.name, brand_id: v.brand_id, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => assetModelApi.remove(id), onSuccess: inv }),
    };
}

export function useCategoryMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: CATS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; name_th?: string; icon?: string | null; description?: string }) => categoryApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; name_th?: string; icon?: string | null; description?: string }) =>
                categoryApi.update(v.id, { name: v.name, name_th: v.name_th, icon: v.icon, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => categoryApi.remove(id), onSuccess: inv }),
    };
}

export function useVendorMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: VENDORS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; name_th?: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; name_th?: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.update(v.id, { name: v.name, name_th: v.name_th, contact: v.contact, phone: v.phone, email: v.email, address: v.address }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => vendorApi.remove(id), onSuccess: inv }),
    };
}

export function useWarehouseMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WAREHOUSES });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; description?: string }) => warehouseApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) =>
                warehouseApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => warehouseApi.remove(id), onSuccess: inv }),
    };
}

export function useUnitMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: UNITS });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => unitApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) => unitApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => unitApi.remove(id), onSuccess: inv }),
    };
}

export function useWarrantyTypeMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WARRANTY_TYPES });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => warrantyTypeApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) =>
                warrantyTypeApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => warrantyTypeApi.remove(id), onSuccess: inv }),
    };
}
