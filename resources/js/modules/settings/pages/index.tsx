import { useT } from '@/lang';
import { NoAccess, useAuth } from '@/modules/auth';
import { useLocationMutations, useLocations } from '@/modules/employee';
import { Column, DataTable } from '@/shared/components/data-table';
import { Field } from '@/shared/components/field';
import { PageTabs } from '@/shared/components/page-tabs';
import { SaveButton } from '@/shared/components/save-button';
import { SearchSelect } from '@/shared/components/search-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { toastDeleteError } from '@/shared/lib/api-errors';
import { resolveBrand } from '@/shared/lib/brand-color';
import { localPair } from '@/shared/lib/local-name';
import { countryOptions, currencyOptions } from '@/shared/lib/locale-data';
import { getLucideIcon } from '@/shared/lib/lucide-icons';
import { cn, isEmail } from '@/shared/lib/utils';
import type { AssetModel, Brand, Category, LocationItem, Vendor, Warehouse } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm, useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Boxes,
    Building2,
    Inbox,
    Info,
    Loader2,
    Mail,
    MapPin,
    Pencil,
    Plus,
    Send,
    Shield,
    SlidersHorizontal,
    Ticket,
    Trash2,
    Upload,
} from 'lucide-react';
import { Fragment, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { settingsApi, type BrandingPayload, type CompanyPayload, type MailSettingsPayload, type SecuritySettings } from '../api/settingsApi';
import { BrandModal } from '../components/brand-modal';
import { CategoryModal } from '../components/category-modal';
import { DateTimeSection } from '../components/datetime-section';
import { FIELD_ROW, FORM_STACK, FORM_WIDTH } from '../components/form-layout';
import { LocationModal } from '../components/location-modal';
import { LookupSection, masterDataEmpty } from '../components/lookup-section';
import { ModelModal } from '../components/model-modal';
import { RequestDataSection } from '../components/request-data-section';
import { SEGMENT_LEGEND } from '../components/segmented-radio';
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
    useWriteoffReasonMutations,
    useWriteoffReasons,
} from '../hooks/use-master-data';
import {
    useResetLogo,
    useSaveFailed,
    useSettings,
    useUpdateAssetColors,
    useUpdateBranding,
    useUpdateCompany,
    useUpdateDisplay,
    useUploadLogo,
} from '../hooks/use-settings';
import { IDLE_SECTION, type SavedSectionProps, type SectionSaver, type SectionStatus } from '../types';

/** A section tells the page whether it holds unsaved local edits. */
type OnDirtyChange = (dirty: boolean) => void;

type Section = 'system' | 'company' | 'master-data' | 'email' | 'tickets' | 'request-data' | 'assets' | 'security';

// Theme accent options — kept to Blue / Purple / Black per branding guidelines.
// Theme colours that read at 4.5:1 as text on white and on their own buttons, stay apart in dark mode, and stay clear of the status reds, greens and ambers.
const THEME_ACCENTS: { hex: string; nameKey: string }[] = [
    { hex: '#2563eb', nameKey: 'set_accent_blue' },
    { hex: '#1e40af', nameKey: 'set_accent_navy' },
    { hex: '#4f46e5', nameKey: 'set_accent_indigo' },
    { hex: '#7c3aed', nameKey: 'set_accent_violet' },
    { hex: '#0369a1', nameKey: 'set_accent_ocean' },
    { hex: '#0f172a', nameKey: 'set_accent_ink' },
];

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

const COMPANY_KEYS = ['company_name', 'legal_name', 'tax_id', 'industry', 'address', 'country', 'currency'] as const;
const BRANDING_KEYS = ['brand_name', 'brand_sub'] as const;

/** The given fields of a form or loaded settings, e.g. the company payload. */
function fieldsOf<K extends keyof SettingsForm>(source: Pick<SettingsForm, K>, keys: readonly K[]): Pick<SettingsForm, K> {
    return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<SettingsForm, K>;
}

/** True when any of the given fields differs from the loaded values. */
const differs = (form: SettingsForm, loaded: SettingsForm, keys: readonly (keyof SettingsForm)[]) => keys.some((key) => form[key] !== loaded[key]);

const VALID_SECTIONS: Section[] = ['system', 'company', 'master-data', 'email', 'tickets', 'request-data', 'assets', 'security'];

/** A ?tab= value this page has — checked, never cast, so ?tab=garbage falls back instead of opening nothing. */
const isSection = (v: string | null): v is Section => VALID_SECTIONS.includes(v as Section);

/** Drops the shown list's search, page and Master Data sub-tab (?search, page, list); ?per stays. */
const clearListParams = (params: URLSearchParams) => {
    for (const key of ['search', 'page', 'list']) params.delete(key);
};

/** Focuses the control of the first invalid Field (by its `name`) inside a form. */
const focusFirstError = (form: HTMLElement | null, errors: Record<string, string | undefined>) => {
    const first = Object.keys(errors).find((key) => errors[key]);
    if (!first) return;
    form?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] button`)?.focus();
};

/** Shimmer stand-in for a settings form while its saved values load. */
function FormSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className={FORM_STACK} aria-hidden="true">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={FIELD_ROW}>
                    {[0, 1].map((j) => (
                        <div key={j} className="space-y-2">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const { can } = useAuth();
    // Active section in ?tab= (no ?tab= = Company); each press is a history entry.
    const [section, changeSection] = useTabParam(isSection, 'company');
    // Unsaved local edits in the open section (it reports them up); switching away asks first.
    const [sectionDirty, setSectionDirty] = useState(false);
    const guardSwitch = useDiscardGuard(sectionDirty);
    // A new section starts with no search on page 1 (rows-per-page stays).
    const openSection = (next: Section) => {
        if (next === section) return;
        guardSwitch(() => changeSection(next, { extra: clearListParams }));
    };
    const { data, isLoading } = useSettings();
    const update = useUpdateCompany();
    const [form, setForm] = useState<SettingsForm>(emptyForm);
    const loaded = useRef<SettingsForm | null>(null);

    // Every Settings save refreshes `data`; a group with unsaved edits keeps them.
    useEffect(() => {
        if (!data) return;
        const before = loaded.current;
        loaded.current = { ...fieldsOf(data, COMPANY_KEYS), ...fieldsOf(data, BRANDING_KEYS) };
        setForm((f) => {
            const next = { ...f };
            for (const keys of [COMPANY_KEYS, BRANDING_KEYS]) {
                if (!before || !differs(f, before, keys)) Object.assign(next, fieldsOf(data, keys));
            }
            return next;
        });
    }, [data]);

    const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((f) => ({ ...f, [k]: v }));
    const takeSaved = (saved: SettingsForm, keys: readonly (keyof SettingsForm)[]) => setForm((f) => ({ ...f, ...fieldsOf(saved, keys) }));

    const saveCompany = async () => {
        if (companyDirty && !(await confirmEdit({ name: t('set_company_title') }))) return;
        const payload: CompanyPayload = fieldsOf(form, COMPANY_KEYS);
        update.mutate(payload, { onSuccess: (saved) => takeSaved(saved, COMPANY_KEYS) });
    };

    // Save is enabled only once a field actually differs from what was loaded.
    const companyDirty = !!data && differs(form, data, COMPANY_KEYS);
    const brandingFormDirty = !!data && differs(form, data, BRANDING_KEYS);
    // Company/System edits survive section switches, but reload/close still warns.
    useDiscardGuard(companyDirty || brandingFormDirty);

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

    // Below lg the nav scrolls sideways; keep the active section in view.
    const navRef = useRef<HTMLElement>(null);
    useEffect(() => {
        navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [section]);

    if (nav.length === 0) return <NoAccess title={t('set_empty_no_access')} hint={t('set_empty_no_access_hint')} />;

    // If ?tab= points at a section the user can't see, fall back to the first visible one.
    const activeSection = nav.some((n) => n.id === section) ? section : nav[0].id;

    return (
        <div className="settings-page space-y-6">
            <div className="mb-3">
                <h1 className="text-2xl font-bold">{t('settings')}</h1>
                <p className="text-muted-foreground text-sm">{t('settings_sub')}</p>
            </div>

            <Card className="grid grid-cols-1 overflow-clip p-0 lg:grid-cols-[220px_1fr]">
                <nav
                    ref={navRef}
                    aria-label={t('settings_sections')}
                    className="border-border flex gap-1 overflow-x-auto border-b p-3 lg:flex-col lg:border-r lg:border-b-0"
                >
                    {nav.map((n) => {
                        const Icon = n.icon;
                        const active = activeSection === n.id;
                        return (
                            <button
                                key={n.id}
                                type="button"
                                onClick={() => openSection(n.id)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors',
                                    active ? 'bg-brand/10 text-brand-ink font-semibold' : 'text-muted-foreground hover:bg-accent/50',
                                )}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {n.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-6">
                    {activeSection === 'system' && (
                        <SystemTab form={form} set={set} logoUrl={data?.logo_url ?? null} loading={isLoading} onDirtyChange={setSectionDirty} />
                    )}
                    {activeSection === 'company' && (
                        <CompanyTab
                            form={form}
                            set={set}
                            onSave={saveCompany}
                            saving={update.isPending}
                            saved={update.isSuccess}
                            dirty={companyDirty}
                            loading={isLoading}
                        />
                    )}
                    {activeSection === 'master-data' && <MasterDataTab />}
                    {activeSection === 'email' && <EmailTab onDirtyChange={setSectionDirty} />}
                    {activeSection === 'assets' && <AssetsTab onDirtyChange={setSectionDirty} onOpenSection={openSection} />}
                    {activeSection === 'tickets' && <TicketsSlaTab onDirtyChange={setSectionDirty} />}
                    {activeSection === 'request-data' && <RequestDataTab />}
                    {activeSection === 'security' && <SecurityTab onDirtyChange={setSectionDirty} />}
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

const MD_TABS = ['brands', 'models', 'categories', 'vendors', 'warehouses', 'locations', 'units', 'warranty-types'] as const;
type MdTab = (typeof MD_TABS)[number];

/** MasterDataTab — sub-tab navigation (?list=, no ?list= = Brands) over the lookup lists. */
function MasterDataTab() {
    const t = useT();
    const list = useListParams();
    const tab: MdTab = MD_TABS.find((id) => id === list.get('list')) ?? MD_TABS[0];
    // A new sub-tab starts with no search on page 1, in the same URL write.
    const setTab = (next: MdTab) => {
        if (next === tab) return;
        list.setParams({ list: next === MD_TABS[0] ? null : next, search: null, page: null });
    };

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

            <PageTabs tabs={tabs} active={tab} onChange={setTab} className="mb-5" />

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

/** Icon-only Edit + Delete buttons for a master data row, named after the row. */
function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
    const t = useT();
    return (
        <div className="flex justify-end gap-1">
            <button
                type="button"
                onClick={onEdit}
                aria-label={`${t('edit')} ${name}`}
                className="hover:bg-accent focus-visible:ring-ring/50 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={onDelete}
                aria-label={`${t('delete')} ${name}`}
                className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
            >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    );
}

/** BrandsList — CRUD list for asset/stock brands. */
function BrandsList() {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const { data: brands = [], isLoading } = useBrands();
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
            header: t('md_description_col'),
            render: (b) => <span className="text-muted-foreground text-sm">{b.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (b) => (
                <RowActions
                    name={b.name}
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
                loading={isLoading}
                rowKey={(b) => b.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_name_desc')}
                searchable={(b) => `${b.name} ${b.description ?? ''}`}
                empty={masterDataEmpty(t, 'brands', list.table.search.value.trim() !== '', t('md_add_brand'))}
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

/** ModelsList — CRUD list for asset models, with optional brand association. */
function ModelsList() {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const { data: models = [], isLoading } = useAssetModels();
    const { remove } = useAssetModelMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editModel, setEditModel] = useState<AssetModel | null>(null);

    // Brand has its own column, so a leading "Brand " prefix is dropped
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
                    <span className="bg-accent text-foreground/80 rounded px-1.5 py-0.5 text-xs">{m.brand.name}</span>
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
                    name={displayName(m)}
                    onEdit={() => setEditModel(m)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: displayName(m) } }))) return;
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
                loading={isLoading}
                rowKey={(m) => m.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_models')}
                searchable={(m) => `${m.name} ${m.brand?.name ?? ''}`}
                empty={masterDataEmpty(t, 'models', list.table.search.value.trim() !== '', t('md_add_model'))}
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

/** CategoriesList — CRUD list for categories. */
function CategoriesList() {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const lang = useUiStore((s) => s.lang);
    const { data: categories = [], isLoading } = useCategories();
    const { remove } = useCategoryMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editCategory, setEditCategory] = useState<Category | null>(null);

    // Display the category name in the active UI language (Thai falls back to the English name).
    const displayName = (c: Category) => localPair(c.name, c.name_th, lang) || '—';

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
            header: t('md_description_col'),
            render: (c) => <span className="text-muted-foreground text-sm">{c.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (c) => (
                <RowActions
                    name={displayName(c)}
                    onEdit={() => setEditCategory(c)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: displayName(c) } }))) return;
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
                loading={isLoading}
                rowKey={(c) => c.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_name_desc')}
                searchable={(c) => `${c.name} ${c.name_th ?? ''} ${c.description ?? ''}`}
                empty={masterDataEmpty(t, 'categories', list.table.search.value.trim() !== '', t('md_add_category'))}
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

/** VendorsList — CRUD list for suppliers/vendors with contact details. */
function VendorsList() {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const lang = useUiStore((s) => s.lang);
    const { data: vendors = [], isLoading } = useVendors();
    const { remove } = useVendorMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editVendor, setEditVendor] = useState<Vendor | null>(null);

    // Display the vendor name in the active UI language (Thai falls back to the English name).
    const displayName = (v: Vendor) => localPair(v.name, v.name_th, lang) || '—';

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
            render: (v) => <span className="text-muted-foreground text-sm tabular-nums">{v.phone || '—'}</span>,
        },
        {
            key: 'email',
            header: t('md_email'),
            render: (v) => <span className="text-muted-foreground text-sm">{v.email || '—'}</span>,
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
                <RowActions
                    name={displayName(v)}
                    onEdit={() => setEditVendor(v)}
                    onDelete={async () => {
                        if (!(await confirm({ variant: 'danger', entity: { name: displayName(v) } }))) return;
                        try {
                            await remove.mutateAsync(v.id);
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
                rows={vendors}
                loading={isLoading}
                rowKey={(v) => v.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_vendors')}
                searchable={(v) => `${v.name} ${v.name_th ?? ''} ${v.contact ?? ''} ${v.email ?? ''} ${v.phone ?? ''}`}
                empty={masterDataEmpty(t, 'vendors', list.table.search.value.trim() !== '', t('md_add_vendor'))}
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

/** WarehousesList — CRUD list for stock warehouses. */
function WarehousesList() {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const { data: warehouses = [], isLoading } = useWarehouses();
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
            header: t('md_description_col'),
            render: (w) => <span className="text-muted-foreground text-sm">{w.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (w) => (
                <RowActions
                    name={w.name}
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
                loading={isLoading}
                rowKey={(w) => w.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_name_desc')}
                searchable={(w) => `${w.name} ${w.description ?? ''}`}
                empty={masterDataEmpty(t, 'warehouses', list.table.search.value.trim() !== '', t('md_add_warehouse'))}
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
    const list = useListParams();
    const { data: locations = [], isLoading } = useLocations();
    const { remove } = useLocationMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editLocation, setEditLocation] = useState<LocationItem | null>(null);

    const columns: Column<LocationItem>[] = [
        {
            key: 'name',
            header: t('loc_name'),
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
                    name={loc.name}
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
                loading={isLoading}
                rowKey={(loc) => loc.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_locations')}
                searchable={(loc) => loc.name}
                empty={masterDataEmpty(t, 'locations', list.table.search.value.trim() !== '', t('add_location'))}
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
    const { data: units = [], isLoading } = useUnits();
    const mutations = useUnitMutations();
    return (
        <LookupSection
            rows={units}
            loading={isLoading}
            mutations={mutations}
            addLabel={t('md_add_unit')}
            editLabel={t('md_edit_unit')}
            nameLabel={t('md_unit_name')}
            addButtonLabel={t('md_add_unit')}
            emptyName="units"
        />
    );
}

/** Warranty types lookup (Stock module master data). */
function WarrantyTypesList() {
    const t = useT();
    const { data: warranties = [], isLoading } = useWarrantyTypes();
    const mutations = useWarrantyTypeMutations();
    return (
        <LookupSection
            rows={warranties}
            loading={isLoading}
            mutations={mutations}
            addLabel={t('md_add_warranty_type')}
            editLabel={t('md_edit_warranty_type')}
            nameLabel={t('md_warranty_type_name')}
            addButtonLabel={t('md_add_warranty_type')}
            emptyName="warranty_types"
        />
    );
}

const MAIL_KEY = ['mail-settings'] as const;

/** SMTP server settings (mail_settings) — host/port/credentials/from + test send. */
function EmailTab({ onDirtyChange }: { onDirtyChange: OnDirtyChange }) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: MAIL_KEY, queryFn: settingsApi.getMail });
    const formRef = useRef<HTMLDivElement>(null);
    const testHintId = useId();

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

    const failed = useSaveFailed();
    const update = useMutation({
        mutationFn: (payload: MailSettingsPayload) => settingsApi.updateMail(payload),
        onSuccess: (d) => {
            qc.setQueryData(MAIL_KEY, d);
            setSaved(true);
        },
        onError: failed,
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

    // Password is required only until one is stored; blank then keeps it
    const handleSave = async () => {
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
        if (Object.keys(next).length > 0) {
            focusFirstError(formRef.current, next);
            return;
        }
        if (dirty && !(await confirmEdit({ name: t('set_email') }))) return;
        update.mutate(form);
    };

    // A blank password keeps the stored one, so only a typed one counts as an edit
    const dirty =
        !!data &&
        (form.host !== (data.host ?? '') ||
            form.port !== (data.port ?? 587) ||
            form.username !== (data.username ?? '') ||
            (form.encryption ?? null) !== (data.encryption ?? null) ||
            form.from_address !== (data.from_address ?? '') ||
            form.from_name !== (data.from_name ?? '') ||
            (form.password ?? '') !== '');
    // Report unsaved edits up so the page asks before switching section.
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    return (
        <div className={FORM_WIDTH}>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_email')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_email_desc')}</p>
            </div>

            {isLoading ? (
                <FormSkeleton rows={3} />
            ) : (
                <div ref={formRef} className={FORM_STACK}>
                    <div className={FIELD_ROW}>
                        <Field label={t('set_email_host')} name="host" required error={errors.host}>
                            <Input
                                value={form.host ?? ''}
                                onChange={(e) => set('host', e.target.value)}
                                placeholder="smtp.example.com"
                                autoComplete="off"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </Field>
                        {/* Port and encryption share the right column */}
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t('set_email_port')} name="port" required error={errors.port}>
                                <Input
                                    type="number"
                                    value={form.port ?? ''}
                                    onChange={(e) => set('port', e.target.value ? Number(e.target.value) : null)}
                                    placeholder="587"
                                    className="tabular-nums"
                                />
                            </Field>
                            <Field label={t('set_email_encryption')}>
                                {(control) => (
                                    <Select
                                        value={form.encryption ?? 'auto'}
                                        onValueChange={(v) => set('encryption', v === 'auto' ? null : (v as 'tls' | 'ssl'))}
                                    >
                                        <SelectTrigger {...control}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">{t('set_email_enc_auto')}</SelectItem>
                                            <SelectItem value="tls">TLS</SelectItem>
                                            <SelectItem value="ssl">SSL</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </Field>
                        </div>
                    </div>

                    <div className={FIELD_ROW}>
                        <Field label={t('set_email_username')} name="username" required error={errors.username}>
                            <Input
                                value={form.username ?? ''}
                                onChange={(e) => set('username', e.target.value)}
                                autoComplete="off"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder="user@example.com"
                            />
                        </Field>
                        <Field
                            label={t('set_email_password')}
                            name="password"
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
                            />
                        </Field>
                    </div>

                    <div className={FIELD_ROW}>
                        <Field label={t('set_email_from_address')} name="from_address" required error={errors.from_address}>
                            <Input
                                type="email"
                                value={form.from_address ?? ''}
                                onChange={(e) => set('from_address', e.target.value)}
                                placeholder="noreply@example.com"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </Field>
                        <Field label={t('set_email_from_name')} name="from_name" required error={errors.from_name}>
                            <Input
                                value={form.from_name ?? ''}
                                onChange={(e) => set('from_name', e.target.value)}
                                placeholder={t('set_brand_name_ph')}
                            />
                        </Field>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                        {dirty && (
                            <span id={testHintId} className="text-muted-foreground text-xs">
                                {t('set_email_test_save_first')}
                            </span>
                        )}
                        <Button
                            variant="outline"
                            onClick={() => test.mutate()}
                            disabled={test.isPending || dirty}
                            aria-describedby={dirty ? testHintId : undefined}
                        >
                            {test.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Send className="h-4 w-4" aria-hidden="true" />
                            )}
                            {test.isPending ? t('set_email_test_sending') : t('email_test')}
                        </Button>
                        <SaveButton onClick={handleSave} loading={update.isPending} success={saved} disabled={!dirty}>
                            {t('save')}
                        </SaveButton>
                    </div>
                </div>
            )}
        </div>
    );
}

const SECURITY_KEY = ['security-settings'] as const;

/** Session inactivity timeout + password expiry policy (app_settings). */
function SecurityTab({ onDirtyChange }: { onDirtyChange: OnDirtyChange }) {
    const t = useT();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: SECURITY_KEY, queryFn: settingsApi.getSecurity });

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

    const failed = useSaveFailed();
    const update = useMutation({
        mutationFn: (payload: SecuritySettings) => settingsApi.updateSecurity(payload),
        onSuccess: (d) => {
            qc.setQueryData(SECURITY_KEY, d);
            setSaved(true);
        },
        onError: failed,
    });

    const setVal = (k: keyof SecuritySettings, v: number) => {
        setForm((f) => ({ ...f, [k]: Math.max(0, v) }));
        setSaved(false);
    };

    // Every loaded key is compared, so a policy added later is covered too
    const dirty = !!data && (Object.keys(data) as (keyof SecuritySettings)[]).some((k) => form[k] !== data[k]);
    // Report unsaved edits up so the page asks before switching section.
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    return (
        <div className={FORM_WIDTH}>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_security')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_security_desc')}</p>
            </div>

            <div className="border-border border-t">
                {isLoading ? (
                    <PolicyRowsSkeleton rows={2} />
                ) : (
                    <>
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
                    </>
                )}
            </div>

            <div className="mt-8 mb-5">
                <h2 className="text-lg font-semibold">{t('set_retention')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_retention_desc')}</p>
            </div>

            <div className="border-border border-t">
                {isLoading ? (
                    <PolicyRowsSkeleton rows={4} />
                ) : (
                    <>
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
                    </>
                )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-5">
                <SaveButton onClick={() => update.mutate(form)} loading={update.isPending} success={saved} disabled={!dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}

/** Shimmer stand-in for policy rows while their saved values load. */
function PolicyRowsSkeleton({ rows }: { rows: number }) {
    return (
        <div aria-hidden="true">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="border-border flex items-center justify-between gap-4 border-b py-3.5">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-full max-w-sm" />
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Skeleton className="h-9 w-32" />
                        <Skeleton className="h-5 w-9 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Security policy row: label + help, preset Select and on/off Switch (0 = off, shown as `offLabel`). */
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
    const labelId = useId();
    const on = value > 0;
    // Keep an out-of-list custom value selectable so existing data isn't lost.
    const options = on && !presets.includes(value) ? [...presets, value].sort((a, b) => a - b) : presets;

    return (
        <div className="border-border flex items-center justify-between gap-4 border-b py-3.5">
            <div className="min-w-0">
                <div id={labelId} className="text-sm font-semibold">
                    {label}
                </div>
                <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {on ? (
                    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
                        <SelectTrigger className="w-32 tabular-nums" aria-labelledby={labelId}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((n) => (
                                <SelectItem key={n} value={String(n)} className="tabular-nums">
                                    {n} {unit}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-muted-foreground text-xs">{offLabel ?? t('policy_off')}</span>
                )}
                <Switch checked={on} onChange={(next) => onChange(next ? defaultValue : 0)} aria-label={label} />
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
// Each swatch carries a colour name so a screen reader says "สีเขียว", not a hex code.
const ASSET_STATUS_PALETTE = [
    { hex: '#0284c7', nameKey: 'set_color_blue' },
    { hex: '#059669', nameKey: 'set_color_green' },
    { hex: '#d97706', nameKey: 'set_color_amber' },
    { hex: '#dc2626', nameKey: 'set_color_red' },
    { hex: '#7c3aed', nameKey: 'set_color_violet' },
    { hex: '#0ea5e9', nameKey: 'set_color_sky' },
    { hex: '#64748b', nameKey: 'set_color_slate' },
] as const;
const ASSET_STATUS_ROWS: { key: string; labelKey: string }[] = [
    { key: 'deployed', labelKey: 'asset_deployed' },
    { key: 'ready', labelKey: 'asset_ready' },
    { key: 'pending_acceptance', labelKey: 'asset_pending_accept' },
    { key: 'common', labelKey: 'asset_common' },
    { key: 'pending_return', labelKey: 'asset_pending_return' },
    { key: 'writeoff', labelKey: 'asset_writeoff' },
];

/** AssetsTab — asset status badge colours (system-wide) and write-off reasons. */
function AssetsTab({ onDirtyChange, onOpenSection }: { onDirtyChange: OnDirtyChange; onOpenSection: (next: Section) => void }) {
    const t = useT();
    const storeColors = useUiStore((s) => s.assetStatusColors);
    const update = useUpdateAssetColors();
    const [draft, setDraft] = useState<Record<string, string>>(storeColors);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setDraft(storeColors);
    }, [storeColors]);

    const dirty = ASSET_STATUS_ROWS.some((r) => draft[r.key] !== storeColors[r.key]);
    // Report unsaved edits up so the page asks before switching section.
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    const setColor = (key: string, color: string) => {
        setDraft((d) => ({ ...d, [key]: color }));
        setSaved(false);
    };

    return (
        <div className={FORM_WIDTH}>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_assets_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_assets_desc')}</p>
            </div>

            <div className="bg-muted/50 text-muted-foreground mb-5 flex items-center gap-2 rounded-md px-3.5 py-2.5 text-xs">
                <Boxes className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                    {t('set_assets_masterdata_note')
                        .split('{link}')
                        .map((part, i) => (
                            <Fragment key={i}>
                                {i > 0 && (
                                    <Link
                                        to="/settings?tab=master-data"
                                        onClick={(e) => {
                                            // Plain clicks switch through the page's guard; modified clicks still open a new tab.
                                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                            e.preventDefault();
                                            onOpenSection('master-data');
                                        }}
                                        className="text-foreground font-semibold underline-offset-2 hover:underline"
                                    >
                                        {t('set_master_data')}
                                    </Link>
                                )}
                                {part}
                            </Fragment>
                        ))}
                </span>
            </div>

            {/* Badge colours */}
            <h3 className="text-sm font-semibold">{t('set_assets_colors_title')}</h3>
            <p className="text-muted-foreground mt-0.5 mb-2.5 text-xs">{t('set_assets_colors_note')}</p>
            <div className="space-y-3">
                {ASSET_STATUS_ROWS.map((r) => {
                    const cur = draft[r.key];
                    const label = t(r.labelKey);
                    return (
                        <div key={r.key} className="border-border grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border px-3.5 py-3">
                            {/* Badge at its own width */}
                            <div>
                                <StatusBadge color={cur}>{label}</StatusBadge>
                            </div>
                            <fieldset className="m-0 min-w-0 border-0 p-0">
                                <legend className="sr-only">{label}</legend>
                                <div className="flex gap-1.5">
                                    {ASSET_STATUS_PALETTE.map((c) => {
                                        const selected = cur?.toLowerCase() === c.hex.toLowerCase();
                                        return (
                                            <label key={c.hex} className="relative" title={t(c.nameKey)}>
                                                <input
                                                    type="radio"
                                                    name={`asset-status-color-${r.key}`}
                                                    value={c.hex}
                                                    checked={selected}
                                                    onChange={() => setColor(r.key, c.hex)}
                                                    aria-label={t(c.nameKey)}
                                                    className="peer sr-only"
                                                />
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        'ring-offset-background peer-focus-visible:outline-brand block h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                                                        selected ? 'ring-foreground' : 'hover:ring-border ring-transparent',
                                                    )}
                                                    style={{ background: c.hex }}
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        </div>
                    );
                })}
            </div>

            <div className="bg-muted/50 text-muted-foreground mt-5 flex items-center gap-2 rounded-md px-3.5 py-2.5 text-xs">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
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

            <WriteoffReasonsSection />
        </div>
    );
}

/** Write-off reasons — the list the write-off dialog picks from, counted by the write-off report. */
function WriteoffReasonsSection() {
    const t = useT();
    const { data: reasons = [], isLoading } = useWriteoffReasons();
    const mutations = useWriteoffReasonMutations();
    return (
        <div className="border-border mt-6 border-t pt-5">
            <h3 className="text-sm font-semibold">{t('set_wo_reasons_title')}</h3>
            <p className="text-muted-foreground mt-0.5 mb-2.5 text-xs">{t('set_wo_reasons_desc')}</p>
            <LookupSection
                rows={reasons}
                loading={isLoading}
                mutations={mutations}
                addLabel={t('set_wo_reason_add')}
                editLabel={t('set_wo_reason_edit')}
                nameLabel={t('set_wo_reason_name')}
                addButtonLabel={t('set_wo_reason_add')}
                emptyName="writeoff_reasons"
            />
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
    loading,
}: {
    form: SettingsForm;
    set: SetFn;
    onSave: () => void;
    saving: boolean;
    saved: boolean;
    dirty: boolean;
    loading: boolean;
}) {
    const t = useT();
    const formRef = useRef<HTMLDivElement>(null);

    // UX only (Laravel re-validates): the 5 core fields are required, Tax ID is 13 digits
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
        if (Object.keys(next).length > 0) {
            focusFirstError(formRef.current, next);
            return;
        }
        onSave();
    };

    return (
        <div className={FORM_WIDTH}>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_company_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_company_desc')}</p>
            </div>
            {loading ? (
                <FormSkeleton rows={4} />
            ) : (
                <div ref={formRef} className={FORM_STACK}>
                    <div className={FIELD_ROW}>
                        <Field label={t('set_company_name')} name="company_name" required error={errors.company_name}>
                            <Input
                                value={form.company_name}
                                onChange={(e) => {
                                    set('company_name', e.target.value);
                                    clearErr('company_name');
                                }}
                                placeholder={t('set_company_name_ph')}
                            />
                        </Field>
                        <Field label={t('set_legal_name')} name="legal_name" required error={errors.legal_name}>
                            <Input
                                value={form.legal_name}
                                onChange={(e) => {
                                    set('legal_name', e.target.value);
                                    clearErr('legal_name');
                                }}
                                placeholder={t('set_legal_name_ph')}
                            />
                        </Field>
                    </div>
                    <div className={FIELD_ROW}>
                        <Field label={t('set_tax_id')} name="tax_id" required error={errors.tax_id}>
                            <Input
                                className="tabular-nums"
                                value={form.tax_id}
                                inputMode="numeric"
                                maxLength={13}
                                onChange={(e) => {
                                    set('tax_id', e.target.value);
                                    clearErr('tax_id');
                                }}
                                placeholder="0000000000000"
                            />
                        </Field>
                        <Field label={t('set_industry')} name="industry" required error={errors.industry}>
                            <Input
                                value={form.industry}
                                onChange={(e) => {
                                    set('industry', e.target.value);
                                    clearErr('industry');
                                }}
                                placeholder={t('set_industry_ph')}
                            />
                        </Field>
                    </div>
                    <Field label={t('set_address')} name="address" required error={errors.address}>
                        <Input
                            value={form.address}
                            onChange={(e) => {
                                set('address', e.target.value);
                                clearErr('address');
                            }}
                            placeholder={t('set_address_ph')}
                        />
                    </Field>
                    <div className={FIELD_ROW}>
                        <Field label={t('set_country')}>
                            <SearchSelect
                                value={form.country}
                                onChange={(v) => set('country', v)}
                                options={countryOptions}
                                placeholder={t('set_country_ph')}
                            />
                        </Field>
                        <Field label={t('set_currency')}>
                            <SearchSelect
                                value={form.currency}
                                onChange={(v) => set('currency', v)}
                                options={currencyOptions}
                                placeholder={t('set_currency_ph')}
                            />
                        </Field>
                    </div>
                    <SaveRow onSave={handleSave} saving={saving} saved={saved} disabled={!dirty} />
                </div>
            )}
        </div>
    );
}

/** Section header used inside System: title + description, like the other sections. */
function SystemSectionHead({ title, desc }: { title: string; desc: string }) {
    return (
        <div className="mb-5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{desc}</p>
        </div>
    );
}

/** Settings → System: Branding (name, logo, theme color) and Date and time under one Save button. */
function SystemTab({
    form,
    set,
    logoUrl,
    loading,
    onDirtyChange,
}: {
    form: SettingsForm;
    set: SetFn;
    logoUrl: string | null;
    loading: boolean;
    onDirtyChange: OnDirtyChange;
}) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const [brandStatus, setBrandStatus] = useState<SectionStatus>(IDLE_SECTION);
    const [dateStatus, setDateStatus] = useState<SectionStatus>(IDLE_SECTION);
    const brandSaver = useRef<SectionSaver>(null);
    const dateSaver = useRef<SectionSaver>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const dirty = brandStatus.dirty || dateStatus.dirty;

    useEffect(() => {
        onDirtyChange(brandStatus.guard || dateStatus.guard);
        return () => onDirtyChange(false);
    }, [brandStatus.guard, dateStatus.guard, onDirtyChange]);

    useEffect(() => {
        if (dirty) setSaved(false);
    }, [dirty]);

    // Saves only the sections with edits; the tick shows when every one went through.
    const save = async () => {
        if (brandStatus.dirty && !(await confirmEdit({ name: t('set_branding') }))) return;
        setSaving(true);
        setSaved(false);
        const results: boolean[] = [];
        if (brandStatus.dirty && brandSaver.current) results.push(await brandSaver.current.save());
        if (dateStatus.dirty && dateSaver.current) results.push(await dateSaver.current.save());
        setSaving(false);
        setSaved(results.length > 0 && results.every(Boolean));
    };

    return (
        <div className={FORM_WIDTH}>
            <SystemSectionHead title={t('set_branding')} desc={t('set_branding_desc')} />
            {loading ? (
                <FormSkeleton rows={2} />
            ) : (
                <BrandingSection form={form} set={set} logoUrl={logoUrl} onStatusChange={setBrandStatus} saverRef={brandSaver} />
            )}

            <div className="border-border mt-8 border-t pt-8">
                <SystemSectionHead title={t('set_datetime')} desc={t('set_datetime_desc')} />
                <DateTimeSection onStatusChange={setDateStatus} saverRef={dateSaver} />
            </div>

            <div className="mt-5">
                <SaveRow onSave={save} saving={saving} saved={saved} disabled={!dirty || (brandStatus.dirty && brandStatus.blocked)} />
            </div>
        </div>
    );
}

/** System → Branding: brand name and subtitle (held by the page), logo and theme color. */
function BrandingSection({
    form,
    set,
    logoUrl,
    onStatusChange,
    saverRef,
}: {
    form: SettingsForm;
    set: SetFn;
    logoUrl: string | null;
} & SavedSectionProps) {
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
    // Local theme-color draft — committed system-wide only when Save is pressed.
    const [accent, setAccent] = useState(storeAccent);

    // Keep the accent draft in sync if the stored theme changes elsewhere.
    useEffect(() => {
        setAccent(storeAccent);
    }, [storeAccent]);

    // Something to save once a branding field, the theme color, the logo file, or a pending reset differs from what was loaded.
    const dirty =
        !!data && (form.brand_name !== data.brand_name || form.brand_sub !== data.brand_sub || accent !== storeAccent || !!file || pendingReset);
    // Only the logo/colour drafts live here; brand name/sub are held by the page and survive a switch.
    const localDirty = accent !== storeAccent || !!file || pendingReset;
    const blocked = !form.brand_name.trim();
    useEffect(() => {
        onStatusChange({ dirty, guard: localDirty, blocked });
    }, [dirty, localDirty, blocked, onStatusChange]);

    // One object URL per picked file, revoked when the file changes or the section unmounts
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) {
            setFileUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setFileUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    // Reset previews the default logo; otherwise the picked file, the custom logo, or the default.
    const previewUrl = pendingReset ? DEFAULT_LOGO : (fileUrl ?? (logoUrl || DEFAULT_LOGO));
    const logoHelpId = useId();

    // Reset pending state whenever the server logo changes (e.g. after save).
    useEffect(() => {
        setPendingReset(false);
    }, [logoUrl]);

    const pick = (f?: File) => {
        setError(null);
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
        try {
            // Logo: reset takes priority, then upload, otherwise leave unchanged.
            if (pendingReset) {
                await resetLogo.mutateAsync();
                setPendingReset(false);
            } else if (file) {
                await uploadLogo.mutateAsync(file);
                setFile(null);
            }
            const savedBrand = await update.mutateAsync({ brand_name: form.brand_name, brand_sub: form.brand_sub });
            set('brand_name', savedBrand.brand_name);
            set('brand_sub', savedBrand.brand_sub);
            // Persist the theme color only when it changed (density/radius stay fixed).
            if (accent !== storeAccent) {
                await updateDisplay.mutateAsync({ theme_accent: accent });
            }
            return true;
        } catch {
            // useSaveFailed already toasted the refusal.
            return false;
        }
    };
    useImperativeHandle(saverRef, () => ({ save }));

    // A saved colour outside the palette stays selectable, so nothing changes until someone picks.
    const currentAccent = accent.toLowerCase();
    const swatches = THEME_ACCENTS.some((a) => a.hex === currentAccent)
        ? THEME_ACCENTS
        : [...THEME_ACCENTS, { hex: currentAccent, nameKey: 'set_accent_current' }];
    const picked = swatches.find((a) => a.hex === currentAccent);

    // Show reset button only when there is something to reset (logo exists or file selected) and reset not already pending.
    const showReset = (logoUrl || file) && !pendingReset;

    return (
        <div className={FORM_STACK}>
            <div className={FIELD_ROW}>
                <Field label={t('set_brand_name')} required error={blocked ? t('set_err_brand_name') : undefined}>
                    <Input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} placeholder={t('set_brand_name_ph')} />
                </Field>
                <Field label={t('set_brand_sub')}>
                    <Input value={form.brand_sub} onChange={(e) => set('brand_sub', e.target.value)} placeholder={t('set_brand_sub_ph')} />
                </Field>
            </div>

            <div className={FIELD_ROW}>
                <Field label={t('set_logo')} error={error ?? undefined}>
                    {(control) => (
                        <div className="flex items-center gap-4">
                            <div className="border-border bg-muted/30 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                                <img src={previewUrl} alt="" className="h-full w-full object-contain" />
                            </div>
                            <div>
                                <input
                                    name="logo"
                                    ref={inputRef}
                                    type="file"
                                    accept="image/png"
                                    className="hidden"
                                    onChange={(e) => pick(e.target.files?.[0])}
                                />
                                <div className="flex items-center gap-2">
                                    <Button
                                        id={control.id}
                                        variant="outline"
                                        onClick={() => inputRef.current?.click()}
                                        aria-label={`${t('set_logo_upload')} ${t('set_logo')}`}
                                        aria-invalid={control['aria-invalid']}
                                        aria-describedby={[control['aria-describedby'], logoHelpId].filter(Boolean).join(' ')}
                                    >
                                        <Upload className="h-4 w-4" aria-hidden="true" />
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
                                                if (inputRef.current) inputRef.current.value = '';
                                            }}
                                        >
                                            {t('reset_default')}
                                        </Button>
                                    )}
                                </div>
                                <p id={logoHelpId} className="text-muted-foreground mt-2 text-xs">
                                    <span className="block">{t('set_logo_help')}</span>
                                    <span className="block">{t('set_logo_usage')}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </Field>
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className={SEGMENT_LEGEND}>{t('set_theme_color')}</legend>
                    <div className="flex flex-wrap items-center gap-2">
                        {swatches.map((a) => (
                            <label key={a.hex} className="relative" title={t(a.nameKey)}>
                                <input
                                    type="radio"
                                    name="theme-accent"
                                    value={a.hex}
                                    checked={a.hex === currentAccent}
                                    onChange={() => setAccent(a.hex)}
                                    aria-label={t(a.nameKey)}
                                    className="peer sr-only"
                                />
                                <span
                                    aria-hidden
                                    className={cn(
                                        'ring-offset-background peer-focus-visible:outline-brand block h-8 w-8 cursor-pointer rounded-full ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                                        a.hex === currentAccent ? 'ring-foreground' : 'hover:ring-border ring-transparent',
                                    )}
                                    style={{ background: resolveBrand(a.hex, dark) }}
                                />
                            </label>
                        ))}
                    </div>
                    {picked && <p className="text-muted-foreground mt-1.5 text-xs">{t(picked.nameKey)}</p>}
                </fieldset>
            </div>
        </div>
    );
}
