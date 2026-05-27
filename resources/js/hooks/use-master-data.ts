import { assetModelApi, brandApi, categoryApi, vendorApi, warehouseApi } from '@/services/masterDataApi';
import type { AssetModel, Brand, Category, CategoryType, Vendor, Warehouse } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BRANDS = ['brands'] as const;
const MODELS = ['asset-models'] as const;
const CATS = ['categories'] as const;
const VENDORS = ['vendors'] as const;
const WAREHOUSES = ['warehouses'] as const;

export const useBrands = () => useQuery({ queryKey: BRANDS, queryFn: brandApi.list });
export const useAssetModels = () => useQuery({ queryKey: MODELS, queryFn: assetModelApi.list });
export const useCategories = () => useQuery({ queryKey: CATS, queryFn: categoryApi.list });
export const useVendors = () => useQuery({ queryKey: VENDORS, queryFn: vendorApi.list });
export const useWarehouses = () => useQuery({ queryKey: WAREHOUSES, queryFn: warehouseApi.list });

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
            mutationFn: (p: { name: string; type: CategoryType; description?: string }) => categoryApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; type: CategoryType; description?: string }) =>
                categoryApi.update(v.id, { name: v.name, type: v.type, description: v.description }),
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
            mutationFn: (p: { name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.update(v.id, { name: v.name, contact: v.contact, phone: v.phone, email: v.email, address: v.address }),
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
