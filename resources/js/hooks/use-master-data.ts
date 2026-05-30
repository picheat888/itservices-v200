import { assetModelApi, brandApi, categoryApi, stockStatusApi, unitApi, vendorApi, warehouseApi, warrantyTypeApi } from '@/services/masterDataApi';
import type { AssetModel, Brand, Category, StockStatus, Unit, Vendor, Warehouse, WarrantyType } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BRANDS = ['brands'] as const;
const MODELS = ['asset-models'] as const;
const CATS = ['categories'] as const;
const VENDORS = ['vendors'] as const;
const WAREHOUSES = ['warehouses'] as const;
const UNITS = ['units'] as const;
const STOCK_STATUSES = ['stock-statuses'] as const;
const WARRANTY_TYPES = ['warranty-types'] as const;

export const useBrands = () => useQuery({ queryKey: BRANDS, queryFn: brandApi.list });
export const useAssetModels = () => useQuery({ queryKey: MODELS, queryFn: assetModelApi.list });
export const useCategories = () => useQuery({ queryKey: CATS, queryFn: categoryApi.list });
export const useVendors = () => useQuery({ queryKey: VENDORS, queryFn: vendorApi.list });
export const useWarehouses = () => useQuery({ queryKey: WAREHOUSES, queryFn: warehouseApi.list });
export const useUnits = () => useQuery({ queryKey: UNITS, queryFn: unitApi.list });
export const useStockStatuses = () => useQuery({ queryKey: STOCK_STATUSES, queryFn: stockStatusApi.list });
export const useWarrantyTypes = () => useQuery({ queryKey: WARRANTY_TYPES, queryFn: warrantyTypeApi.list });

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
            mutationFn: (p: { name: string; name_th?: string; description?: string; track_serial?: boolean }) => categoryApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; name_th?: string; description?: string; track_serial?: boolean }) =>
                categoryApi.update(v.id, { name: v.name, name_th: v.name_th, description: v.description, track_serial: v.track_serial }),
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

export function useStockStatusMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: STOCK_STATUSES });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => stockStatusApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) => stockStatusApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => stockStatusApi.remove(id), onSuccess: inv }),
    };
}

export function useWarrantyTypeMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WARRANTY_TYPES });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => warrantyTypeApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) => warrantyTypeApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => warrantyTypeApi.remove(id), onSuccess: inv }),
    };
}
