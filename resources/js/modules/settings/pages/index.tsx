import { useT } from '@/lang';
import { NoAccess, useAuth } from '@/modules/auth';
import { useLocationMutations, useLocations } from '@/modules/employee';
import { Column, DataTable } from '@/shared/components/data-table';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchSelect } from '@/shared/components/search-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { toastDeleteError } from '@/shared/lib/api-errors';
import { resolveBrand } from '@/shared/lib/brand-color';
import { countryOptions, currencyOptions } from '@/shared/lib/locale-data';
import { getLucideIcon } from '@/shared/lib/lucide-icons';
import { cn, isEmail } from '@/shared/lib/utils';
import type { AssetModel, Brand, Category, LocationItem, Vendor, Warehouse } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Boxes,
    Building2,
    Construction,
    Inbox,
    Info,
    Mail,
    MapPin,
    Pencil,
    Plus,
    Send,
    Shield,
    SlidersHorizontal,
    Sparkles,
    Ticket,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { settingsApi, type BrandingPayload, type CompanyPayload, type MailSettingsPayload, type SecuritySettings } from '../api/settingsApi';
import { BrandModal } from '../components/brand-modal';
import { CategoryModal } from '../components/category-modal';
import { LocationModal } from '../components/location-modal';
import { LookupSection } from '../components/lookup-section';
import { ModelModal } from '../components/model-modal';
import { RequestDataSection } from '../components/request-data-section';
import { TicketsSlaTab } from '../components/tickets-sla-tab';
import { VendorModal } from '../components/vendor-modal';
import { WarehouseModal } from '../components/warehouse-modal';
import {
    useAssetModelMutations,
    useAssetModels,
    useBrandMutations,
    useBrands,
    useCategories,
    useCategoryMutations,
    useUnitMutations,
    useUnits,
    useVendorMutations,
    useVendors,
    useWarehouseMutations,
    useWarehouses,
    useWarrantyTypeMutations,
    useWarrantyTypes,
} from '../hooks/use-master-data';
import {
    useResetLogo,
    useSettings,
    useUpdateAssetColors,
    useUpdateBranding,
    useUpdateCompany,
    useUpdateDisplay,
    useUploadLogo,
} from '../hooks/use-settings';

type Section = 'system' | 'company' | 'master-data' | 'email' | 'tickets' | 'request-data' | 'assets' | 'security';

// Theme accent options — kept to Blue / Purple / Black per branding guidelines.
const ACCENTS = ['#2563eb', '#7c3aed', '#0f172a'];

// Bundled default web logo (public/logo.svg) — shown when no custom logo is set.
const DEFAULT_LOGO = '/logo.svg';

// Combined local form type covering both company and branding fields.
type SettingsForm = CompanyPayload & BrandingPayload;

const emptyForm: SettingsForm = {
    brand_name: '',
    brand_sub: '',
    company_name: '',
    legal_name: '',
    tax_id: '',
    industry: '',
    address: '',
    country: 'Thailand',
    currency: 'THB',
};

const VALID_SECTIONS: Section[] = ['system', 'company', 'master-data', 'email', 'tickets', 'request-data', 'assets', 'security'];

function sectionFromHash(): Section {
    const s = window.location.hash.replace('#', '') as Section;
    return VALID_SECTIONS.includes(s) ? s : 'company';
}

export default function SettingsPage() {
    const t = useT();
    const { can } = useAuth();
    const [section, setSection] = useState<Section>(sectionFromHash);
    const { data } = useSettings();

    const changeSection = (s: Section) => {
        setSection(s);
        window.location.hash = s;
    };
    const update = useUpdateCompany();
    const [form, setForm] = useState<SettingsForm>(emptyForm);

    useEffect(() => {
        if (data) {
            setForm({
                brand_name: data.brand_name,
                brand_sub: data.brand_sub,
                company_name: data.company_name,
                legal_name: data.legal_name,
                tax_id: data.tax_id,
                industry: data.industry,
                address: data.address,
                country: data.country,
                currency: data.currency,
            });
        }
    }, [data]);

    const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((f) => ({ ...f, [k]: v }));

    /** Extracts only the company fields for the PUT /settings/company endpoint. */
    const companyPayload = (): CompanyPayload => ({
        company_name: form.company_name,
        legal_name: form.legal_name,
        tax_id: form.tax_id,
        industry: form.industry,
        address: form.address,
        country: form.country,
        currency: form.currency,
    });

    // Save is enabled only once a company field actually differs from what was loaded.
    const companyDirty =
        !!data &&
        (form.company_name !== data.company_name ||
            form.legal_name !== data.legal_name ||
            form.tax_id !== data.tax_id ||
            form.industry !== data.industry ||
            form.address !== data.address ||
            form.country !== data.country ||
            form.currency !== data.currency);

    const allNav: { id: Section; label: string; icon: typeof Building2; perm: string }[] = [
        { id: 'company', label: t('set_company'), icon: Building2, perm: 'settings.company' },
        { id: 'system', label: t('set_system'), icon: SlidersHorizontal, perm: 'settings.system' },
        { id: 'master-data', label: t('set_master_data'), icon: Boxes, perm: 'settings.masterdata' },
        { id: 'email', label: t('set_email'), icon: Mail, perm: 'settings.email' },
        { id: 'tickets', label: t('set_tickets'), icon: Ticket, perm: 'settings.sla' },
        { id: 'request-data', label: t('set_request_data'), icon: Inbox, perm: 'settings.requestdata' },
        { id: 'assets', label: t('set_assets'), icon: Box, perm: 'settings.assets' },
        { id: 'security', label: t('set_security'), icon: Shield, perm: 'settings.security' },
    ];
    const nav = allNav.filter((n) => can(n.perm));

    if (nav.length === 0) return <NoAccess />;

    // If the hash/section points at a tab the user can't see, fall back to the first visible one.
    const activeSection = nav.some((n) => n.id === section) ? section : nav[0].id;

    return (
        <div className="settings-page space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('settings')}</h1>
                <p className="text-muted-foreground text-sm">{t('settings_sub')}</p>
            </div>

            <Card className="grid grid-cols-1 overflow-hidden p-0 lg:grid-cols-[220px_1fr]">
                <nav className="border-border flex gap-1 overflow-x-auto border-b p-3 lg:flex-col lg:border-r lg:border-b-0">
                    {nav.map((n) => {
                        const Icon = n.icon;
                        return (
                            <button
                                key={n.id}
                                onClick={() => changeSection(n.id)}
                                className={cn(
                                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors',
                                    activeSection === n.id ? 'bg-brand/10 text-brand font-semibold' : 'text-muted-foreground hover:bg-accent/50',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {n.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-6">
                    {activeSection === 'system' && <SystemTab form={form} set={set} logoUrl={data?.logo_url ?? null} />}
                    {activeSection === 'company' && (
                        <CompanyTab
                            form={form}
                            set={set}
                            onSave={() => update.mutate(companyPayload())}
                            saving={update.isPending}
                            saved={update.isSuccess}
                            dirty={companyDirty}
                        />
                    )}
                    {activeSection === 'master-data' && <MasterDataTab />}
                    {activeSection === 'email' && <EmailTab />}
                    {activeSection === 'assets' && <AssetsTab />}
                    {activeSection === 'tickets' && <TicketsSlaTab />}
                    {activeSection === 'request-data' && <RequestDataTab />}
                    {activeSection === 'security' && <SecurityTab />}
                    {!VALID_SECTIONS.includes(activeSection) && <ComingSoon />}
                </div>
            </Card>
        </div>
    );
}

// ─── Request Data Tab ────────────────────────────────────────────────────────

/**
 * RequestDataTab — the choice lists the request form's selects offer. Its own
 * section rather than a ninth Master Data sub-tab: those lists are shared lookup
 * tables for Assets/Contracts/Stock, while these belong to one module and are
 * reached while configuring requests, not while configuring inventory.
 */
function RequestDataTab() {
    const t = useT();

    return (
        <div>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_request_data')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_request_data_desc')}</p>
            </div>
            <RequestDataSection />
        </div>
    );
}

// ─── Master Data Tab ─────────────────────────────────────────────────────────

type MdTab = 'brands' | 'models' | 'categories' | 'vendors' | 'warehouses' | 'locations' | 'units' | 'warranty-types';

/**
 * MasterDataTab — top-level container with sub-tab navigation.
 * Renders one of: BrandsList, ModelsList, CategoriesList, VendorsList,
 * WarehousesList, or LocationsList based on the selected tab.
 */
function MasterDataTab() {
    const t = useT();
    const [tab, setTab] = useState<MdTab>('brands');

    const tabs: { id: MdTab; label: string }[] = [
        { id: 'brands', label: t('md_brands') },
        { id: 'models', label: t('md_models') },
        { id: 'categories', label: t('md_categories') },
        { id: 'vendors', label: t('md_vendors') },
        { id: 'warehouses', label: t('md_warehouses') },
        { id: 'locations', label: t('set_locations') },
        { id: 'units', label: t('md_units') },
        { id: 'warranty-types', label: t('md_warranty_types') },
    ];

    return (
        <div>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_master_data')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_master_data_desc')}</p>
            </div>

            <div className="mb-5 flex flex-wrap gap-1 border-b pb-3">
                {tabs.map((tb) => (
                    <button
                        key={tb.id}
                        onClick={() => setTab(tb.id)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tab === tb.id ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-accent/50',
                        )}
                    >
                        {tb.label}
                    </button>
                ))}
            </div>

            {tab === 'brands' && <BrandsList />}
            {tab === 'models' && <ModelsList />}
            {tab === 'categories' && <CategoriesList />}
            {tab === 'vendors' && <VendorsList />}
            {tab === 'warehouses' && <WarehousesList />}
            {tab === 'locations' && <LocationsList />}
            {tab === 'units' && <UnitsList />}
            {tab === 'warranty-types' && <WarrantyTypesList />}
        </div>
    );
}

/**
 * RowActions — shared edit/save/cancel/delete control cluster for the master
 * data tables. Shows Save + Cancel while a row is in edit mode, otherwise the
 * Edit + Delete buttons.
 */
function RowActions({
    editing,
    onSave,
    onCancel,
    onEdit,
    onDelete,
    saving,
}: {
    editing?: boolean;
    onSave?: () => void;
    onCancel?: () => void;
    onEdit: () => void;
    onDelete: () => void;
    saving?: boolean;
}) {
    const t = useT();
    if (editing) {
        return (
            <div className="flex justify-end gap-1">
                <Button size="sm" onClick={onSave} disabled={saving}>
                    {t('save')}
                </Button>
                <button onClick={onCancel} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                    <X className="h-4 w-4" />
                </button>
            </div>
        );
    }
    return (
        <div className="flex justify-end gap-1">
            <button onClick={onEdit} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}

/**
 * BrandsList — CRUD list for asset/stock brands.
 * Uses useBrands + useBrandMutations hooks.
 */
function BrandsList() {
    const t = useT();
    const confirm = useConfirm();
    const { data: brands = [] } = useBrands();
    const { remove } = useBrandMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editBrand, setEditBrand] = useState<Brand | null>(null);

    const columns: Column<Brand>[] = [
        {
            key: 'name',
            header: t('md_brand_name'),
            render: (b) => <span className="text-sm font-medium">{b.name}</span>,
        },
        {
            key: 'description',
            header: t('md_description'),
            render: (b) => <span className="text-muted-foreground text-sm">{b.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (b) => (
                <RowActions
                    onEdit={() => setEditBrand(b)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: b.name } }))) return;
                        try {
                            await remove.mutateAsync(b.id);
                        } catch (e) {
                            toastDeleteError(e, t);
                        }
                    }}
                />
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={brands}
                rowKey={(b) => b.id}
                searchable={(b) => `${b.name} ${b.description ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('md_add_brand')}
                    </Button>
                }
            />
            <BrandModal
                open={addOpen || !!editBrand}
                brand={editBrand}
                onClose={() => {
                    setAddOpen(false);
                    setEditBrand(null);
                }}
            />
        </div>
    );
}

/**
 * ModelsList — CRUD list for asset models, with optional brand association.
 * Uses useAssetModels + useAssetModelMutations hooks.
 */
function ModelsList() {
    const t = useT();
    const confirm = useConfirm();
    const { data: models = [] } = useAssetModels();
    const { remove } = useAssetModelMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editModel, setEditModel] = useState<AssetModel | null>(null);

    // Legacy model names are stored as "Brand Model" (e.g. "Dell Latitude 5540").
    // The brand has its own column, so strip a leading brand prefix for display.
    const displayName = (m: AssetModel) => {
        const brand = m.brand?.name;
        return brand && m.name.startsWith(`${brand} `) ? m.name.slice(brand.length + 1) : m.name;
    };

    const columns: Column<AssetModel>[] = [
        {
            key: 'name',
            header: t('md_model_name'),
            render: (m) => <span className="text-sm font-medium">{displayName(m)}</span>,
        },
        {
            key: 'brand',
            header: t('md_brand'),
            render: (m) =>
                m.brand ? (
                    <span className="bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-xs">{m.brand.name}</span>
                ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (m) => (
                <RowActions
                    onEdit={() => setEditModel(m)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: m.name } }))) return;
                        try {
                            await remove.mutateAsync(m.id);
                        } catch (e) {
                            toastDeleteError(e, t);
                        }
                    }}
                />
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={models}
                rowKey={(m) => m.id}
                searchable={(m) => `${m.name} ${m.brand?.name ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('md_add_model')}
                    </Button>
                }
            />
            <ModelModal
                open={addOpen || !!editModel}
                model={editModel}
                onClose={() => {
                    setAddOpen(false);
                    setEditModel(null);
                }}
            />
        </div>
    );
}

/**
 * CategoriesList — CRUD list for categories.
 * Uses useCategories + useCategoryMutations hooks.
 */
function CategoriesList() {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { data: categories = [] } = useCategories();
    const { remove } = useCategoryMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editCategory, setEditCategory] = useState<Category | null>(null);

    // Display the category name in the active UI language (Thai falls back to the English name).
    const displayName = (c: Category) => (lang === 'th' ? c.name_th || c.name : c.name) || '—';

    const columns: Column<Category>[] = [
        {
            key: 'name',
            header: t('md_category_name'),
            render: (c) => {
                const Icon = getLucideIcon(c.icon);
                return (
                    <span className="flex items-center gap-2 text-sm font-medium">
                        {Icon && <Icon className="text-muted-foreground h-4 w-4 shrink-0" />}
                        {displayName(c)}
                    </span>
                );
            },
        },
        {
            key: 'description',
            header: t('md_description'),
            render: (c) => <span className="text-muted-foreground text-sm">{c.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (c) => (
                <RowActions
                    onEdit={() => setEditCategory(c)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: c.name } }))) return;
                        try {
                            await remove.mutateAsync(c.id);
                        } catch (e) {
                            toastDeleteError(e, t);
                        }
                    }}
                />
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={categories}
                rowKey={(c) => c.id}
                searchable={(c) => `${c.name} ${c.name_th ?? ''} ${c.description ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('md_add_category')}
                    </Button>
                }
            />
            <CategoryModal
                open={addOpen || !!editCategory}
                category={editCategory}
                onClose={() => {
                    setAddOpen(false);
                    setEditCategory(null);
                }}
            />
        </div>
    );
}

/**
 * VendorsList — CRUD list for suppliers/vendors with contact details.
 * Uses useVendors + useVendorMutations hooks.
 */
function VendorsList() {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { data: vendors = [] } = useVendors();
    const { remove } = useVendorMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editVendor, setEditVendor] = useState<Vendor | null>(null);

    // Display the vendor name in the active UI language (Thai falls back to the English name).
    const displayName = (v: Vendor) => (lang === 'th' ? v.name_th || v.name : v.name) || '—';

    const columns: Column<Vendor>[] = [
        {
            key: 'name',
            header: t('md_vendor_name'),
            render: (v) => <span className="text-sm font-medium">{displayName(v)}</span>,
        },
        {
            key: 'contact',
            header: t('md_contact'),
            render: (v) => <span className="text-muted-foreground text-sm">{v.contact || '—'}</span>,
        },
        {
            key: 'phone',
            header: t('md_phone'),
            render: (v) => <span className="text-muted-foreground text-sm">{v.phone || '—'}</span>,
        },
        {
            key: 'email',
            header: t('md_email'),
            render: (v) => <span className="text-muted-foreground font-mono text-xs">{v.email || '—'}</span>,
        },
        {
            key: 'address',
            header: t('md_address'),
            render: (v) => <span className="text-muted-foreground text-sm">{v.address || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (v) => (
                <div className="flex justify-end gap-1">
                    <button onClick={() => setEditVendor(v)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        onClick={async () => {
                            if (!(await confirm({ variant: 'danger', entity: { name: v.name } }))) return;
                            try {
                                await remove.mutateAsync(v.id);
                            } catch (e) {
                                toastDeleteError(e, t);
                            }
                        }}
                        className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={vendors}
                rowKey={(v) => v.id}
                searchable={(v) => `${v.name} ${v.name_th ?? ''} ${v.contact ?? ''} ${v.email ?? ''} ${v.phone ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('md_add_vendor')}
                    </Button>
                }
            />
            <VendorModal
                open={addOpen || !!editVendor}
                vendor={editVendor}
                onClose={() => {
                    setAddOpen(false);
                    setEditVendor(null);
                }}
            />
        </div>
    );
}

/**
 * WarehousesList — CRUD list for stock warehouses.
 * Uses useWarehouses + useWarehouseMutations hooks.
 */
function WarehousesList() {
    const t = useT();
    const confirm = useConfirm();
    const { data: warehouses = [] } = useWarehouses();
    const { remove } = useWarehouseMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);

    const columns: Column<Warehouse>[] = [
        {
            key: 'name',
            header: t('md_warehouse_name'),
            render: (w) => <span className="text-sm font-medium">{w.name}</span>,
        },
        {
            key: 'description',
            header: t('md_description'),
            render: (w) => <span className="text-muted-foreground text-sm">{w.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (w) => (
                <RowActions
                    onEdit={() => setEditWarehouse(w)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: w.name } }))) return;
                        try {
                            await remove.mutateAsync(w.id);
                        } catch (e) {
                            toastDeleteError(e, t);
                        }
                    }}
                />
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={warehouses}
                rowKey={(w) => w.id}
                searchable={(w) => `${w.name} ${w.description ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('md_add_warehouse')}
                    </Button>
                }
            />
            <WarehouseModal
                open={addOpen || !!editWarehouse}
                warehouse={editWarehouse}
                onClose={() => {
                    setAddOpen(false);
                    setEditWarehouse(null);
                }}
            />
        </div>
    );
}

// ─── Locations List (sub-tab within Master Data) ──────────────────────────────

function LocationsList() {
    const t = useT();
    const confirm = useConfirm();
    const { data: locations = [] } = useLocations();
    const { remove } = useLocationMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editLocation, setEditLocation] = useState<LocationItem | null>(null);

    const columns: Column<LocationItem>[] = [
        {
            key: 'name',
            header: t('set_locations'),
            render: (loc) => (
                <span className="flex items-center gap-2 text-sm">
                    <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
                    {loc.name}
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (loc) => (
                <RowActions
                    onEdit={() => setEditLocation(loc)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: loc.name } }))) return;
                        try {
                            await remove.mutateAsync(loc.id);
                        } catch (e) {
                            toastDeleteError(e, t, 'location_in_use', 'location_in_use_title');
                        }
                    }}
                />
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={locations}
                rowKey={(loc) => loc.id}
                searchable={(loc) => loc.name}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('add_location')}
                    </Button>
                }
            />
            <LocationModal
                open={addOpen || !!editLocation}
                location={editLocation}
                onClose={() => {
                    setAddOpen(false);
                    setEditLocation(null);
                }}
            />
        </div>
    );
}

/** Units lookup (Stock module master data). */
function UnitsList() {
    const t = useT();
    const { data: units = [] } = useUnits();
    const mutations = useUnitMutations();
    return (
        <LookupSection
            rows={units}
            mutations={mutations}
            addLabel={t('md_add_unit')}
            editLabel={t('md_edit_unit')}
            nameLabel={t('md_unit_name')}
            addButtonLabel={t('md_add_unit')}
        />
    );
}

/** Warranty types lookup (Stock module master data). */
function WarrantyTypesList() {
    const t = useT();
    const { data: warranties = [] } = useWarrantyTypes();
    const mutations = useWarrantyTypeMutations();
    return (
        <LookupSection
            rows={warranties}
            mutations={mutations}
            addLabel={t('md_add_warranty_type')}
            editLabel={t('md_edit_warranty_type')}
            nameLabel={t('md_warranty_type_name')}
            addButtonLabel={t('md_add_warranty_type')}
        />
    );
}

function ComingSoon() {
    const t = useT();
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <Construction className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground mt-3 max-w-sm text-sm">{t('settings_coming_soon')}</p>
        </div>
    );
}

const MAIL_KEY = ['mail-settings'] as const;

/** SMTP server settings (mail_settings) — host/port/credentials/from + test send. */
function EmailTab() {
    const t = useT();
    const qc = useQueryClient();
    const { data } = useQuery({ queryKey: MAIL_KEY, queryFn: settingsApi.getMail });

    const [form, setForm] = useState<MailSettingsPayload>({
        host: '',
        port: 587,
        username: '',
        password: '',
        encryption: 'tls',
        from_address: '',
        from_name: '',
    });
    const [hasPassword, setHasPassword] = useState(false);
    const [saved, setSaved] = useState(false);
    type MailErrorKey = 'host' | 'port' | 'username' | 'password' | 'from_address' | 'from_name';
    const [errors, setErrors] = useState<Partial<Record<MailErrorKey, string>>>({});

    useEffect(() => {
        if (!data) return;
        setForm({
            host: data.host ?? '',
            port: data.port ?? 587,
            username: data.username ?? '',
            password: '',
            encryption: data.encryption ?? null,
            from_address: data.from_address ?? '',
            from_name: data.from_name ?? '',
        });
        setHasPassword(data.has_password);
    }, [data]);

    const update = useMutation({
        mutationFn: (payload: MailSettingsPayload) => settingsApi.updateMail(payload),
        onSuccess: (d) => {
            qc.setQueryData(MAIL_KEY, d);
            setSaved(true);
        },
    });

    const test = useMutation({
        mutationFn: () => settingsApi.testMail(),
        onSuccess: (res) => {
            useToastStore
                .getState()
                .push(
                    res.sent ? `${t('email_test_sent')} ${res.to ?? ''}` : t('email_test_failed'),
                    res.sent ? 'success' : 'error',
                    res.sent ? undefined : t('email_test_failed_title'),
                );
        },
        onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            useToastStore.getState().push(msg ?? t('email_test_failed'), 'error', t('email_test_failed_title'));
        },
    });

    const set = <K extends keyof MailSettingsPayload>(k: K, v: MailSettingsPayload[K]) => {
        setForm((f) => ({ ...f, [k]: v }));
        setSaved(false);
        if (errors[k as MailErrorKey]) setErrors((e) => ({ ...e, [k]: undefined }));
    };

    // All SMTP fields are required + format-checked. Password is required only on
    // first setup; once one is stored, a blank field keeps the existing password.
    const handleSave = () => {
        const next: Partial<Record<MailErrorKey, string>> = {};
        if (!form.host?.trim()) next.host = t('set_err_required');
        if (form.port == null || `${form.port}`.trim() === '') {
            next.port = t('set_err_required');
        } else if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
            next.port = t('set_email_err_port');
        }
        if (!form.username?.trim()) next.username = t('set_err_required');
        if (!hasPassword && !form.password?.trim()) next.password = t('set_err_required');
        if (!form.from_address?.trim()) {
            next.from_address = t('set_err_required');
        } else if (!isEmail(form.from_address)) {
            next.from_address = t('set_email_err_address');
        }
        if (!form.from_name?.trim()) next.from_name = t('set_err_required');

        setErrors(next);
        if (Object.keys(next).length > 0) return;
        update.mutate(form);
    };

    const errorClass = (k: MailErrorKey) => (errors[k] ? 'border-destructive focus-visible:ring-destructive' : '');

    // Save is enabled only after a field changes. A blank password means "keep
    // the current one" (not a change); typing any password counts as dirty.
    const dirty =
        !!data &&
        (form.host !== (data.host ?? '') ||
            form.port !== (data.port ?? 587) ||
            form.username !== (data.username ?? '') ||
            (form.encryption ?? null) !== (data.encryption ?? null) ||
            form.from_address !== (data.from_address ?? '') ||
            form.from_name !== (data.from_name ?? '') ||
            (form.password ?? '') !== '');

    return (
        <div className="max-w-xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_email')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_email_desc')}</p>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                    <Field label={t('set_email_host')} required error={errors.host}>
                        <Input
                            value={form.host ?? ''}
                            onChange={(e) => set('host', e.target.value)}
                            placeholder="smtp.example.com"
                            aria-invalid={!!errors.host}
                            className={cn('font-mono', errorClass('host'))}
                        />
                    </Field>
                    <Field label={t('set_email_port')} required error={errors.port}>
                        <Input
                            type="number"
                            value={form.port ?? ''}
                            onChange={(e) => set('port', e.target.value ? Number(e.target.value) : null)}
                            placeholder="587"
                            aria-invalid={!!errors.port}
                            className={cn('font-mono', errorClass('port'))}
                        />
                    </Field>
                </div>

                <Field label={t('set_email_username')} required error={errors.username}>
                    <Input
                        value={form.username ?? ''}
                        onChange={(e) => set('username', e.target.value)}
                        className={cn('font-mono', errorClass('username'))}
                        autoComplete="off"
                        placeholder="user@example.com"
                        aria-invalid={!!errors.username}
                    />
                </Field>

                <Field
                    label={t('set_email_password')}
                    required={!hasPassword}
                    error={errors.password}
                    help={hasPassword ? t('set_email_password_hint') : undefined}
                >
                    <Input
                        type="password"
                        value={form.password ?? ''}
                        onChange={(e) => set('password', e.target.value)}
                        placeholder={hasPassword ? '••••••••' : t('set_email_password_ph')}
                        autoComplete="new-password"
                        aria-invalid={!!errors.password}
                        className={cn(errorClass('password'))}
                    />
                </Field>

                <Field label={t('set_email_encryption')}>
                    <Select value={form.encryption ?? 'auto'} onValueChange={(v) => set('encryption', v === 'auto' ? null : (v as 'tls' | 'ssl'))}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="tls">TLS</SelectItem>
                            <SelectItem value="ssl">SSL</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t('set_email_from_address')} required error={errors.from_address}>
                        <Input
                            value={form.from_address ?? ''}
                            onChange={(e) => set('from_address', e.target.value)}
                            placeholder="noreply@example.com"
                            aria-invalid={!!errors.from_address}
                            className={cn('font-mono', errorClass('from_address'))}
                        />
                    </Field>
                    <Field label={t('set_email_from_name')} required error={errors.from_name}>
                        <Input
                            value={form.from_name ?? ''}
                            onChange={(e) => set('from_name', e.target.value)}
                            placeholder="IT Service Desk"
                            aria-invalid={!!errors.from_name}
                            className={cn(errorClass('from_name'))}
                        />
                    </Field>
                </div>

                <div className="flex items-center gap-2 pt-2">
                    <SaveButton onClick={handleSave} loading={update.isPending} success={saved} disabled={!dirty}>
                        {t('save')}
                    </SaveButton>
                    <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                        <Send className="h-4 w-4" />
                        {t('email_test')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

const SECURITY_KEY = ['security-settings'] as const;

/** Session inactivity timeout + password expiry policy (app_settings). */
function SecurityTab() {
    const t = useT();
    const qc = useQueryClient();
    const { data } = useQuery({ queryKey: SECURITY_KEY, queryFn: settingsApi.getSecurity });

    const [form, setForm] = useState<SecuritySettings>({
        session_timeout_minutes: 0,
        password_expiry_days: 0,
        email_log_body_days: 0,
        email_log_days: 0,
        audit_log_days: 0,
        notification_days: 0,
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data) setForm(data);
    }, [data]);

    const update = useMutation({
        mutationFn: (payload: SecuritySettings) => settingsApi.updateSecurity(payload),
        onSuccess: (d) => {
            qc.setQueryData(SECURITY_KEY, d);
            setSaved(true);
        },
    });

    const setVal = (k: keyof SecuritySettings, v: number) => {
        setForm((f) => ({ ...f, [k]: Math.max(0, v) }));
        setSaved(false);
    };

    // Save is enabled only once a policy value differs from what was loaded. Comparing every
    // key rather than naming two of them, so a window added later cannot be left out of this.
    const dirty = !!data && (Object.keys(data) as (keyof SecuritySettings)[]).some((k) => form[k] !== data[k]);

    return (
        <div className="max-w-xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_security')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_security_desc')}</p>
            </div>

            <div className="border-border border-t">
                <SecurityPolicyRow
                    label={t('set_session_timeout')}
                    sub={t('set_session_timeout_help')}
                    value={form.session_timeout_minutes}
                    presets={[1, 5, 10, 15, 30, 60, 120]}
                    defaultValue={30}
                    unit={t('unit_minutes')}
                    onChange={(v) => setVal('session_timeout_minutes', v)}
                />
                <SecurityPolicyRow
                    label={t('set_password_expiry')}
                    sub={t('set_password_expiry_help')}
                    value={form.password_expiry_days}
                    presets={[30, 60, 90, 180, 365]}
                    defaultValue={90}
                    unit={t('unit_days')}
                    onChange={(v) => setVal('password_expiry_days', v)}
                />
            </div>

            <div className="mt-8 mb-5">
                <h2 className="text-lg font-semibold">{t('set_retention')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_retention_desc')}</p>
            </div>

            <div className="border-border border-t">
                <SecurityPolicyRow
                    label={t('set_email_body_days')}
                    sub={t('set_email_body_days_help')}
                    value={form.email_log_body_days}
                    presets={[30, 60, 90, 180, 365]}
                    defaultValue={90}
                    unit={t('unit_days')}
                    offLabel={t('policy_keep_forever')}
                    onChange={(v) => setVal('email_log_body_days', v)}
                />
                <SecurityPolicyRow
                    label={t('set_email_log_days')}
                    sub={t('set_email_log_days_help')}
                    value={form.email_log_days}
                    presets={[90, 180, 365, 730, 1095]}
                    defaultValue={730}
                    unit={t('unit_days')}
                    offLabel={t('policy_keep_forever')}
                    onChange={(v) => setVal('email_log_days', v)}
                />
                <SecurityPolicyRow
                    label={t('set_audit_log_days')}
                    sub={t('set_audit_log_days_help')}
                    value={form.audit_log_days}
                    presets={[365, 730, 1095, 1825, 2555]}
                    defaultValue={1825}
                    unit={t('unit_days')}
                    offLabel={t('policy_keep_forever')}
                    onChange={(v) => setVal('audit_log_days', v)}
                />
                <SecurityPolicyRow
                    label={t('set_notification_days')}
                    sub={t('set_notification_days_help')}
                    value={form.notification_days}
                    presets={[30, 60, 90, 180, 365]}
                    defaultValue={90}
                    unit={t('unit_days')}
                    offLabel={t('policy_keep_forever')}
                    onChange={(v) => setVal('notification_days', v)}
                />
            </div>

            <div className="flex items-center justify-end gap-3 pt-5">
                <SaveButton onClick={() => update.mutate(form)} loading={update.isPending} success={saved} disabled={!dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}

/** Pill on/off switch matching the design's Toggle (36×20, accent when on). */
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-input')}
        >
            <span
                className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')}
            />
        </button>
    );
}

/**
 * Single policy row in the Security tab — label + description on the left,
 * an on/off switch plus a preset-value dropdown on the right (only shown when
 * the policy is enabled). A value of 0 means the rule is off; toggling on
 * restores `defaultValue`.
 *
 * `offLabel` is what 0 reads as. It defaults to "Off", which is right for a rule that
 * stops being enforced — but a retention window switched off means the rows are kept
 * forever, and "Off" next to a log that grows without bound says the opposite.
 */
function SecurityPolicyRow({
    label,
    sub,
    value,
    presets,
    defaultValue,
    unit,
    offLabel,
    onChange,
}: {
    label: string;
    sub: string;
    value: number;
    presets: number[];
    defaultValue: number;
    unit: string;
    offLabel?: string;
    onChange: (v: number) => void;
}) {
    const t = useT();
    const on = value > 0;
    // Keep an out-of-list custom value selectable so existing data isn't lost.
    const options = on && !presets.includes(value) ? [...presets, value].sort((a, b) => a - b) : presets;

    return (
        <div className="border-border flex items-center justify-between gap-4 border-b py-3.5">
            <div className="min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {on ? (
                    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
                        <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n} {unit}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-muted-foreground text-xs">{offLabel ?? t('policy_off')}</span>
                )}
                <Switch checked={on} onChange={(next) => onChange(next ? defaultValue : 0)} />
            </div>
        </div>
    );
}

interface SetFn {
    <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]): void;
}

function SaveRow({ onSave, saving, saved, disabled }: { onSave: () => void; saving: boolean; saved: boolean; disabled?: boolean }) {
    const t = useT();
    return (
        <div className="flex items-center justify-end gap-3 pt-2">
            <SaveButton onClick={onSave} loading={saving} success={saved} disabled={disabled}>
                {t('save')}
            </SaveButton>
        </div>
    );
}

// Swatch palette + the asset statuses shown in the color editor (mirrors the design).
const ASSET_STATUS_PALETTE = ['#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0ea5e9', '#64748b'];
const ASSET_STATUS_ROWS: { key: string; labelKey: string }[] = [
    { key: 'deployed', labelKey: 'asset_deployed' },
    { key: 'ready', labelKey: 'asset_ready' },
    { key: 'pending_acceptance', labelKey: 'asset_pending_accept' },
    { key: 'common', labelKey: 'asset_common' },
    { key: 'pending_return', labelKey: 'asset_pending_return' },
    { key: 'writeoff', labelKey: 'asset_writeoff' },
];

/**
 * AssetsTab — system-wide asset status badge color editor. Picks a color per
 * status from a fixed palette; on Save the colors persist to app_settings and
 * sync into the UI store so every asset badge updates across the system.
 */
function AssetsTab() {
    const t = useT();
    const storeColors = useUiStore((s) => s.assetStatusColors);
    const update = useUpdateAssetColors();
    const [draft, setDraft] = useState<Record<string, string>>(storeColors);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setDraft(storeColors);
    }, [storeColors]);

    const dirty = ASSET_STATUS_ROWS.some((r) => draft[r.key] !== storeColors[r.key]);

    const setColor = (key: string, color: string) => {
        setDraft((d) => ({ ...d, [key]: color }));
        setSaved(false);
    };

    return (
        <div className="max-w-3xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_assets_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_assets_desc')}</p>
            </div>

            <div className="bg-muted/50 text-muted-foreground mb-5 flex items-center gap-2 rounded-md px-3.5 py-2.5 text-xs">
                <Boxes className="h-4 w-4 shrink-0" />
                <span>
                    {t('set_assets_masterdata_note')} <span className="text-foreground font-semibold">{t('set_master_data')}</span>
                </span>
            </div>

            <p className="text-muted-foreground mb-3 text-xs">{t('set_assets_colors_note')}</p>
            <div className="space-y-3">
                {ASSET_STATUS_ROWS.map((r) => {
                    const cur = draft[r.key];
                    return (
                        <div key={r.key} className="border-border grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border px-3.5 py-3">
                            <StatusBadge color={cur}>{t(r.labelKey)}</StatusBadge>
                            <div className="flex gap-1.5">
                                {ASSET_STATUS_PALETTE.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setColor(r.key, c)}
                                        aria-label={c}
                                        className={cn(
                                            'ring-offset-background h-7 w-7 rounded-full ring-2 ring-offset-2 transition-all',
                                            cur?.toLowerCase() === c.toLowerCase() ? 'ring-foreground' : 'ring-transparent',
                                        )}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-md bg-blue-500/10 px-3.5 py-2.5 text-xs text-blue-600 dark:text-blue-400">
                <Info className="h-4 w-4 shrink-0" />
                <span>{t('set_assets_apply_note')}</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-5">
                <SaveButton
                    onClick={() => update.mutate({ asset_status_colors: draft }, { onSuccess: () => setSaved(true) })}
                    loading={update.isPending}
                    success={saved}
                    disabled={!dirty}
                >
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}

function CompanyTab({
    form,
    set,
    onSave,
    saving,
    saved,
    dirty,
}: {
    form: SettingsForm;
    set: SetFn;
    onSave: () => void;
    saving: boolean;
    saved: boolean;
    dirty: boolean;
}) {
    const t = useT();

    // Client-side validation (UX only — Laravel re-validates on PUT /settings/company).
    // The 5 core company fields are required; Tax ID must be exactly 13 digits.
    type CompanyErrorKey = 'company_name' | 'legal_name' | 'tax_id' | 'industry' | 'address';
    const [errors, setErrors] = useState<Partial<Record<CompanyErrorKey, string>>>({});

    const clearErr = (k: CompanyErrorKey) => {
        if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    };

    const handleSave = () => {
        const next: Partial<Record<CompanyErrorKey, string>> = {};
        if (!form.company_name.trim()) next.company_name = t('set_err_required');
        if (!form.legal_name.trim()) next.legal_name = t('set_err_required');
        if (!form.tax_id.trim()) {
            next.tax_id = t('set_err_required');
        } else if (!/^\d{13}$/.test(form.tax_id.trim())) {
            next.tax_id = t('set_err_tax_id');
        }
        if (!form.industry.trim()) next.industry = t('set_err_required');
        if (!form.address.trim()) next.address = t('set_err_required');

        setErrors(next);
        if (Object.keys(next).length > 0) return;
        onSave();
    };

    const errorClass = (k: CompanyErrorKey) => (errors[k] ? 'border-destructive focus-visible:ring-destructive' : '');

    return (
        <div className="max-w-3xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_company_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_company_desc')}</p>
            </div>
            <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <Field label={t('set_company_name')} required error={errors.company_name}>
                        <Input
                            value={form.company_name}
                            aria-invalid={!!errors.company_name}
                            className={cn(errorClass('company_name'))}
                            onChange={(e) => {
                                set('company_name', e.target.value);
                                clearErr('company_name');
                            }}
                            placeholder={t('set_company_name_ph')}
                        />
                    </Field>
                    <Field label={t('set_legal_name')} required error={errors.legal_name}>
                        <Input
                            value={form.legal_name}
                            aria-invalid={!!errors.legal_name}
                            className={cn(errorClass('legal_name'))}
                            onChange={(e) => {
                                set('legal_name', e.target.value);
                                clearErr('legal_name');
                            }}
                            placeholder={t('set_legal_name_ph')}
                        />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label={t('set_tax_id')} required error={errors.tax_id}>
                        <Input
                            className={cn('font-mono', errorClass('tax_id'))}
                            value={form.tax_id}
                            aria-invalid={!!errors.tax_id}
                            inputMode="numeric"
                            maxLength={13}
                            onChange={(e) => {
                                set('tax_id', e.target.value);
                                clearErr('tax_id');
                            }}
                            placeholder="0000000000000"
                        />
                    </Field>
                    <Field label={t('set_industry')} required error={errors.industry}>
                        <Input
                            value={form.industry}
                            aria-invalid={!!errors.industry}
                            className={cn(errorClass('industry'))}
                            onChange={(e) => {
                                set('industry', e.target.value);
                                clearErr('industry');
                            }}
                            placeholder="Manufacturing"
                        />
                    </Field>
                </div>
                <Field label={t('set_address')} required error={errors.address}>
                    <Input
                        value={form.address}
                        aria-invalid={!!errors.address}
                        className={cn(errorClass('address'))}
                        onChange={(e) => {
                            set('address', e.target.value);
                            clearErr('address');
                        }}
                        placeholder={t('set_address_ph')}
                    />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label={t('set_country')}>
                        <SearchSelect
                            value={form.country}
                            onChange={(v) => set('country', v)}
                            options={countryOptions}
                            placeholder="Select country…"
                        />
                    </Field>
                    <Field label={t('set_currency')}>
                        <SearchSelect
                            value={form.currency}
                            onChange={(v) => set('currency', v)}
                            options={currencyOptions}
                            placeholder="Select currency…"
                        />
                    </Field>
                </div>
                <SaveRow onSave={handleSave} saving={saving} saved={saved} disabled={!dirty} />
            </div>
        </div>
    );
}

/** Section header used inside System: a bare brand-tinted icon (no chip) beside the title + description. */
function SystemSectionHead({ icon: Icon, title, desc }: { icon: typeof Sparkles; title: string; desc: string }) {
    return (
        <div className="mb-5 flex items-start gap-2.5">
            <Icon className="text-brand mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} />
            <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-muted-foreground text-sm">{desc}</p>
            </div>
        </div>
    );
}

/**
 * Settings → System: a single Branding section covering brand name, logo and
 * the system-wide theme color — all saved with one button. Corner radius and
 * density are fixed (no per-user controls).
 */
function SystemTab({ form, set, logoUrl }: { form: SettingsForm; set: SetFn; logoUrl: string | null }) {
    const t = useT();
    return (
        <div className="max-w-2xl">
            <SystemSectionHead icon={Sparkles} title={t('set_branding')} desc={t('set_branding_desc')} />
            <BrandingTab form={form} set={set} logoUrl={logoUrl} embedded />
        </div>
    );
}

function BrandingTab({ form, set, logoUrl, embedded = false }: { form: SettingsForm; set: SetFn; logoUrl: string | null; embedded?: boolean }) {
    const t = useT();
    const { data } = useSettings();
    const update = useUpdateBranding();
    const updateDisplay = useUpdateDisplay();
    const uploadLogo = useUploadLogo();
    const resetLogo = useResetLogo();
    const storeAccent = useUiStore((s) => s.accent);
    const dark = useUiStore((s) => s.dark);
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [pendingReset, setPendingReset] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    // Local theme-color draft — committed system-wide only when Save is pressed.
    const [accent, setAccent] = useState(storeAccent);

    // Keep the accent draft in sync if the stored theme changes elsewhere.
    useEffect(() => {
        setAccent(storeAccent);
    }, [storeAccent]);

    // Save is enabled once a branding field, the theme color, the logo file, or a
    // pending reset differs from what was loaded — an untouched form stays disabled.
    const dirty =
        !!data && (form.brand_name !== data.brand_name || form.brand_sub !== data.brand_sub || accent !== storeAccent || !!file || pendingReset);

    // When pendingReset is true, show no logo (as if already cleared).
    // When a new file is picked after reset, cancel the pending reset.
    // Reset previews the default logo; otherwise the picked file, the custom logo, or the default.
    const previewUrl = pendingReset ? DEFAULT_LOGO : file ? URL.createObjectURL(file) : logoUrl || DEFAULT_LOGO;
    useEffect(
        () => () => {
            if (file) URL.revokeObjectURL(URL.createObjectURL(file));
        },
        [file],
    );

    // Reset pending state whenever the server logo changes (e.g. after save).
    useEffect(() => {
        setPendingReset(false);
    }, [logoUrl]);

    const pick = (f?: File) => {
        setError(null);
        setSaved(false);
        setPendingReset(false);
        if (!f) return;
        if (f.type !== 'image/png') {
            setError(t('set_logo_bad_type'));
            return;
        }
        if (f.size > 2 * 1024 * 1024) {
            setError(t('set_logo_too_big'));
            return;
        }
        setFile(f);
    };

    const save = async () => {
        setSaved(false);
        // Handle logo: reset takes priority, then upload, otherwise leave unchanged.
        if (pendingReset) {
            await resetLogo.mutateAsync();
            setPendingReset(false);
        } else if (file) {
            await uploadLogo.mutateAsync(file);
        }
        await update.mutateAsync({ brand_name: form.brand_name, brand_sub: form.brand_sub });
        // Persist the theme color only when it changed (density/radius stay fixed).
        if (accent !== storeAccent) {
            await updateDisplay.mutateAsync({ theme_accent: accent });
        }
        setFile(null);
        setSaved(true);
    };

    const busy = update.isPending || uploadLogo.isPending || resetLogo.isPending || updateDisplay.isPending;
    // Show reset button only when there is something to reset (logo exists or file selected) and reset not already pending.
    const showReset = (logoUrl || file) && !pendingReset;

    const body = (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
                <Field label={t('set_brand_name')}>
                    <Input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} placeholder={t('set_brand_name_ph')} />
                </Field>
                <Field label={t('set_brand_sub')}>
                    <Input value={form.brand_sub} onChange={(e) => set('brand_sub', e.target.value)} placeholder={t('set_brand_sub_ph')} />
                </Field>
            </div>

            <Field label={t('set_logo')} error={error ?? undefined}>
                <div className="flex items-center gap-4">
                    <div className="border-border bg-muted/30 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                        <img src={previewUrl} alt="logo" className="h-full w-full object-contain" />
                    </div>
                    <div>
                        <input ref={inputRef} type="file" accept="image/png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => inputRef.current?.click()}>
                                <Upload className="h-4 w-4" />
                                {t('set_logo_upload')}
                            </Button>
                            {showReset && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-destructive text-xs"
                                    onClick={() => {
                                        setFile(null);
                                        setPendingReset(true);
                                        setSaved(false);
                                        if (inputRef.current) inputRef.current.value = '';
                                    }}
                                >
                                    {t('reset_default')}
                                </Button>
                            )}
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">{t('set_logo_help')}</p>
                    </div>
                </div>
            </Field>

            <Field label={t('set_theme_color')}>
                <div className="flex gap-2">
                    {ACCENTS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => {
                                setAccent(c);
                                setSaved(false);
                            }}
                            className={cn(
                                'ring-offset-background h-8 w-8 rounded-full ring-2 ring-offset-2 transition-all',
                                accent.toLowerCase() === c.toLowerCase() ? 'ring-foreground' : 'ring-transparent',
                            )}
                            style={{ background: resolveBrand(c, dark) }}
                            aria-label={c}
                        />
                    ))}
                </div>
            </Field>

            <div className="flex items-center justify-end gap-3 pt-2">
                <SaveButton onClick={save} loading={busy} success={saved} disabled={!form.brand_name.trim() || !dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );

    if (embedded) {
        return body;
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_branding')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_branding_desc')}</p>
            </div>
            {body}
        </div>
    );
}
