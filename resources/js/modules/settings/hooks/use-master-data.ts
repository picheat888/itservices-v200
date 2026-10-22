import { FRESH_LIST, type LookupOptions } from '@/shared/lib/freshness';
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
    writeoffReasonApi,
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
const WRITEOFF_REASONS = ['writeoff-reasons'] as const;
// Admin list; must stay distinct from the request module's ['request-options'] (New Request form payload)
const REQUEST_OPTION_MASTER = ['request-option-master'] as const;

export const useBrands = (opts: LookupOptions = {}) => useQuery({ queryKey: BRANDS, queryFn: brandApi.list, ...FRESH_LIST, ...opts });
export const useAssetModels = (opts: LookupOptions = {}) => useQuery({ queryKey: MODELS, queryFn: assetModelApi.list, ...FRESH_LIST, ...opts });
export const useCategories = (opts: LookupOptions = {}) => useQuery({ queryKey: CATS, queryFn: categoryApi.list, ...FRESH_LIST, ...opts });
export const useVendors = (opts: LookupOptions = {}) => useQuery({ queryKey: VENDORS, queryFn: vendorApi.list, ...FRESH_LIST, ...opts });
export const useWarehouses = (opts: LookupOptions = {}) => useQuery({ queryKey: WAREHOUSES, queryFn: warehouseApi.list, ...FRESH_LIST, ...opts });
export const useUnits = (opts: LookupOptions = {}) => useQuery({ queryKey: UNITS, queryFn: unitApi.list, ...FRESH_LIST, ...opts });
export const useWarrantyTypes = (opts: LookupOptions = {}) =>
    useQuery({ queryKey: WARRANTY_TYPES, queryFn: warrantyTypeApi.list, ...FRESH_LIST, ...opts });
export const useWriteoffReasons = (opts: LookupOptions = {}) =>
    useQuery({ queryKey: WRITEOFF_REASONS, queryFn: writeoffReasonApi.list, ...FRESH_LIST, ...opts });
export const useRequestOptionLists = () => useQuery({ queryKey: REQUEST_OPTION_MASTER, queryFn: requestOptionApi.list });

type RequestOptionCache = { lists: RequestOptionList[]; options: RequestOption[] };

/** Re-order one list in the cached options, leaving every other list's rows in place. */
function applyOrder(options: RequestOption[], order: RequestOptionOrder): RequestOption[] {
    const rank = new Map(order.ids.map((id, i) => [id, i]));
    const inList = (o: RequestOption) => o.request_type === order.request_type && o.field_key === order.field_key;
    const moved = options.filter(inList).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    let next = 0;

    return options.map((o) => (inList(o) ? moved[next++] : o));
}

/** Choice-list writes also invalidate the request module's cached New Request form options. */
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
            // Paint the new order at once so the dropped row doesn't spring back
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
        create: useMutation({ mutationFn: (p: { name: string; description?: string | null }) => brandApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string | null }) =>
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
            mutationFn: (p: { name: string; brand_id?: number | null; description?: string | null }) => assetModelApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; brand_id?: number | null; description?: string | null }) =>
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
            mutationFn: (p: { name: string; name_th?: string | null; icon?: string | null; description?: string | null }) => categoryApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; name_th?: string | null; icon?: string | null; description?: string | null }) =>
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
            mutationFn: (p: {
                name: string;
                name_th?: string;
                contact?: string | null;
                phone?: string | null;
                email?: string | null;
                address?: string | null;
            }) => vendorApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: {
                id: number;
                name: string;
                name_th?: string;
                contact?: string | null;
                phone?: string | null;
                email?: string | null;
                address?: string | null;
            }) =>
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
            mutationFn: (p: { name: string; description?: string | null }) => warehouseApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string | null }) =>
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
        create: useMutation({ mutationFn: (p: { name: string; description?: string | null }) => unitApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string | null }) =>
                unitApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => unitApi.remove(id), onSuccess: inv }),
    };
}

export function useWriteoffReasonMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WRITEOFF_REASONS });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string | null }) => writeoffReasonApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string | null }) =>
                writeoffReasonApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => writeoffReasonApi.remove(id), onSuccess: inv }),
    };
}

export function useWarrantyTypeMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WARRANTY_TYPES });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string | null }) => warrantyTypeApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string | null }) =>
                warrantyTypeApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => warrantyTypeApi.remove(id), onSuccess: inv }),
    };
}
