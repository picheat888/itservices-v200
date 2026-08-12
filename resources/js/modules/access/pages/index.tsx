import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { AvatarStack } from '@/shared/components/avatar-stack';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Building2, Folder, Globe, KeyRound, Package, Plus, Tag, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccessDashboard } from '../components/access-dashboard';
import { MembersDrawer, type MemberTarget } from '../components/members-drawer';
import { ResourceModal } from '../components/resource-modal';
import { useEmailGroups, useFileShares, useSocialPlatforms, useSoftware } from '../hooks/use-access';

/** The overview tab plus the four resource registries. */
type Tab = 'dashboard' | AccessKind;

/** Valid tab ids (URL guard) — the active tab is mirrored in the URL `?tab=`. */
const TAB_IDS = ['dashboard', 'email-groups', 'file-shares', 'social-platforms', 'software'] as const;
const isTab = (v: string | null): v is Tab => v != null && (TAB_IDS as readonly string[]).includes(v);
/** Any of the four access resource shapes — used for the create/edit modal state. */
type AnyResource = EmailGroup | FileShare | SocialPlatform | Software;

/** SearchableSelect sentinel for the "no filter" option. */
const ALL = '__all__';
/** Software licence types, in display order (matches the resource form). */
const LICENSES = ['subscription', 'perpetual', 'open_source', 'free'] as const;

/** Owner cell: small avatar (photo or brand-chip initials) + name. */
function OwnerCell({ owner, photoUrl }: { owner?: string | null; photoUrl?: string | null }) {
    if (!owner) return <span className="text-muted-foreground">—</span>;
    return (
        <div className="flex items-center gap-2 whitespace-nowrap">
            <UserAvatar name={owner} photoUrl={photoUrl} className="h-7 w-7" textClassName="text-[10px]" />
            <span className="text-sm">{owner}</span>
        </div>
    );
}

/** Colored icon tile (or a logo image when provided) + name/sub used in the registry name columns. */
function NameCell({
    icon: Icon,
    color,
    name,
    sub,
    logoUrl,
}: {
    icon: typeof Users;
    color: string;
    name: string;
    sub?: string | null;
    logoUrl?: string | null;
}) {
    return (
        <div className="flex items-center gap-3">
            {logoUrl ? (
                <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `${color}18`, color }}>
                    <Icon className="h-4 w-4" />
                </span>
            )}
            <div className="min-w-0">
                <div className="font-medium">{name}</div>
                {sub && <div className="text-muted-foreground max-w-[240px] truncate font-mono text-[11.5px]">{sub}</div>}
            </div>
        </div>
    );
}

/**
 * Access Directory page. A header (title + context-aware "+ New …"), a KPI row
 * (group/share/social/software counts + total grants), and a single card with a
 * tab row that switches between the four resource registries. Every registry uses
 * the shared DataTable (same look as the other list pages) — search, pagination
 * and loading shimmer come from it. Rows open the member manager drawer.
 */
export default function AccessControlPage() {
    const t = useT();
    const { can } = useAuth();
    // Granular gates (master access.module opens the page): Overview + each registry's
    // tab has its own view key; add/edit/delete sit under it — edit also covers
    // owner/member management.
    const canOverview = can('access.overview');
    const canView: Record<AccessKind, boolean> = {
        'email-groups': can('access.email_view'),
        'file-shares': can('access.file_view'),
        'social-platforms': can('access.social_view'),
        software: can('access.software_view'),
    };
    const canAdd: Record<AccessKind, boolean> = {
        'email-groups': can('access.email_add'),
        'file-shares': can('access.file_add'),
        'social-platforms': can('access.social_add'),
        software: can('access.software_add'),
    };
    const canEdit: Record<AccessKind, boolean> = {
        'email-groups': can('access.email_edit'),
        'file-shares': can('access.file_edit'),
        'social-platforms': can('access.social_edit'),
        software: can('access.software_edit'),
    };
    const canDelete: Record<AccessKind, boolean> = {
        'email-groups': can('access.email_delete'),
        'file-shares': can('access.file_delete'),
        'social-platforms': can('access.social_delete'),
        software: can('access.software_delete'),
    };
    // Active tab lives in the URL (?tab=) so a reload / shared link stays put — the URL
    // is the single source of truth (no separate state, no localStorage). Default = the
    // Overview when permitted, otherwise the first registry.
    const [searchParams, setSearchParams] = useSearchParams();
    const [editing, setEditing] = useState<{ kind: AccessKind; row: AnyResource | null } | null>(null);

    // Coerce the URL tab onto one the user may actually see: Overview needs its key,
    // a registry tab needs its view key; otherwise fall back to the first visible tab.
    const visibleKinds = (['email-groups', 'file-shares', 'social-platforms', 'software'] as AccessKind[]).filter((k) => canView[k]);
    const firstTab: Tab = canOverview ? 'dashboard' : (visibleKinds[0] ?? 'email-groups');
    const urlTab = searchParams.get('tab');
    const resolvedTab: Tab = isTab(urlTab) ? urlTab : firstTab;
    const tabAllowed = resolvedTab === 'dashboard' ? canOverview : canView[resolvedTab];
    const tab: Tab = tabAllowed ? resolvedTab : firstTab;
    // The manage drawer (?view=<id>) and the create form (?add=1) are URL-driven too; both derive below.
    // Only a real record id can match a row; Number('abc') is NaN and matched none.
    const viewId = toRecordId(searchParams.get('view'));
    // ?add=1 is a presence flag — the create form's kind comes from the active (?tab) registry.
    const adding = searchParams.get('add') != null && tab !== 'dashboard';

    // Switch tab — mirror it in the URL (?tab=) and close any open drawer / create form.
    const setTab = (next: Tab) => {
        setEditing(null);
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('view');
                p.delete('add');
                if (next === 'dashboard') {
                    p.delete('tab');
                } else {
                    p.set('tab', next);
                }
                return p;
            },
            { replace: true },
        );
    };

    // Open a resource's manage drawer by (kind, id) — deep-linked as ?tab=<kind>&view=<id>.
    // The URL is the single source of truth; the drawer content is derived in `members`.
    const openResource = (kind: AccessKind, id: number) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('tab', kind);
                p.set('view', String(id));
                p.delete('add');
                return p;
            },
            { replace: true },
        );

    // Close the drawer — just drop ?open from the URL (members recomputes to null; no reopen race).
    const closeDrawer = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('view');
                return p;
            },
            { replace: true },
        );

    // Open the "add" form for a kind — deep-linked as ?tab=<kind>&add=1 (row stays null = create).
    const openAdd = (kind: AccessKind) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('tab', kind);
                p.set('add', '1');
                p.delete('view');
                return p;
            },
            { replace: true },
        );

    // Close the create/edit modal — clear the edit state and drop ?add.
    const closeModal = () => {
        setEditing(null);
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('add');
                return p;
            },
            { replace: true },
        );
    };
    // Client-side filters per tab (department for email/file; licence + brand for software).
    const [egDept, setEgDept] = useState('');
    const [fsDept, setFsDept] = useState('');
    const [swLicense, setSwLicense] = useState('');
    const [swPublisher, setSwPublisher] = useState('');

    const emailGroups = useEmailGroups(canView['email-groups']);
    const fileShares = useFileShares(canView['file-shares']);
    const social = useSocialPlatforms(canView['social-platforms']);
    const software = useSoftware(canView.software);

    const egRows = useMemo(() => emailGroups.data ?? [], [emailGroups.data]);
    const fsRows = useMemo(() => fileShares.data ?? [], [fileShares.data]);
    const spRows = useMemo(() => social.data ?? [], [social.data]);
    const swRows = useMemo(() => software.data ?? [], [software.data]);

    // Distinct filter option values, derived from the loaded rows.
    const egDepts = useMemo(() => [...new Set(egRows.map((g) => g.department).filter(Boolean) as string[])].sort(), [egRows]);
    const fsDepts = useMemo(() => [...new Set(fsRows.map((s) => s.department).filter(Boolean) as string[])].sort(), [fsRows]);
    const swPublishers = useMemo(() => [...new Set(swRows.map((s) => s.publisher).filter(Boolean) as string[])].sort(), [swRows]);

    // Rows after the client-side filters (the DataTable still applies its own text search on top).
    const egFiltered = useMemo(() => (egDept ? egRows.filter((g) => g.department === egDept) : egRows), [egRows, egDept]);
    const fsFiltered = useMemo(() => (fsDept ? fsRows.filter((s) => s.department === fsDept) : fsRows), [fsRows, fsDept]);
    const swFiltered = useMemo(
        () => swRows.filter((s) => (!swLicense || s.license_type === swLicense) && (!swPublisher || s.publisher === swPublisher)),
        [swRows, swLicense, swPublisher],
    );

    // Small label above a filter select (icon + text), matching the Asset filter panel.
    const fieldLabel = (icon: ReactNode, label: string) => (
        <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
            {icon}
            {label}
        </div>
    );

    // "Filters" popover next to the search box (client-side), one per tab that needs it.
    const emailFilter = (
        <FilterPopover count={egDept ? 1 : 0} onClear={() => setEgDept('')} resultCount={egFiltered.length}>
            {() => (
                <div>
                    {fieldLabel(<Building2 className="h-3.5 w-3.5" />, t('access_department'))}
                    <SearchableSelect
                        active={!!egDept}
                        value={egDept || ALL}
                        onChange={(v) => setEgDept(v === ALL ? '' : v)}
                        options={[{ value: ALL, label: t('all'), search: t('all') }, ...egDepts.map((d) => ({ value: d, label: d, search: d }))]}
                    />
                </div>
            )}
        </FilterPopover>
    );
    const fileFilter = (
        <FilterPopover count={fsDept ? 1 : 0} onClear={() => setFsDept('')} resultCount={fsFiltered.length}>
            {() => (
                <div>
                    {fieldLabel(<Building2 className="h-3.5 w-3.5" />, t('access_department'))}
                    <SearchableSelect
                        active={!!fsDept}
                        value={fsDept || ALL}
                        onChange={(v) => setFsDept(v === ALL ? '' : v)}
                        options={[{ value: ALL, label: t('all'), search: t('all') }, ...fsDepts.map((d) => ({ value: d, label: d, search: d }))]}
                    />
                </div>
            )}
        </FilterPopover>
    );
    const softwareFilter = (
        <FilterPopover
            count={(swLicense ? 1 : 0) + (swPublisher ? 1 : 0)}
            width={420}
            onClear={() => {
                setSwLicense('');
                setSwPublisher('');
            }}
            resultCount={swFiltered.length}
        >
            {() => (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        {fieldLabel(<KeyRound className="h-3.5 w-3.5" />, t('access_license_type'))}
                        <SearchableSelect
                            active={!!swLicense}
                            value={swLicense || ALL}
                            onChange={(v) => setSwLicense(v === ALL ? '' : v)}
                            options={[
                                { value: ALL, label: t('all'), search: t('all') },
                                ...LICENSES.map((l) => ({ value: l, label: t(`access_lic_${l}`), search: t(`access_lic_${l}`) })),
                            ]}
                        />
                    </div>
                    <div>
                        {fieldLabel(<Tag className="h-3.5 w-3.5" />, t('access_publisher'))}
                        <SearchableSelect
                            active={!!swPublisher}
                            value={swPublisher || ALL}
                            onChange={(v) => setSwPublisher(v === ALL ? '' : v)}
                            options={[
                                { value: ALL, label: t('all'), search: t('all') },
                                ...swPublishers.map((p) => ({ value: p, label: p, search: p })),
                            ]}
                        />
                    </div>
                </div>
            )}
        </FilterPopover>
    );

    // Every tab is permission-gated — hide the tab itself (not just its content).
    const tabs: { id: Tab; label: string }[] = [
        ...(canOverview ? [{ id: 'dashboard' as Tab, label: t('access_tab_overview') }] : []),
        ...(canView['email-groups'] ? [{ id: 'email-groups' as Tab, label: t('access_email_groups') }] : []),
        ...(canView['file-shares'] ? [{ id: 'file-shares' as Tab, label: t('access_file_shares') }] : []),
        ...(canView['social-platforms'] ? [{ id: 'social-platforms' as Tab, label: t('access_social') }] : []),
        ...(canView.software ? [{ id: 'software' as Tab, label: t('access_software') }] : []),
    ];

    const newLabel: Record<AccessKind, string> = {
        'email-groups': t('access_new_group'),
        'file-shares': t('access_new_share'),
        'social-platforms': t('access_new_platform'),
        software: t('access_new_software'),
    };

    // "+ New …" button rendered inside each table's search row (right side), gated per registry.
    const addButton = (kind: AccessKind) =>
        canAdd[kind] ? (
            <Button onClick={() => openAdd(kind)}>
                <Plus className="h-4 w-4" /> {newLabel[kind]}
            </Button>
        ) : undefined;

    // Compose the split size columns for display: null = unspecified (—), 0 = unlimited,
    // otherwise a thousands-separated value with its unit ("5,000 GB").
    const sizeText = (size?: number | null, unit?: string | null) => {
        if (size == null) return null;
        if (size === 0) return t('access_size_unlimited');
        return `${size.toLocaleString()}${unit ? ` ${unit}` : ''}`;
    };

    // Build the drawer's header/meta payload from a registry row (fields differ per kind).
    const buildTarget = (kind: AccessKind, row: AnyResource): MemberTarget => {
        if (kind === 'email-groups') {
            const g = row as EmailGroup;
            return {
                kind,
                id: g.id,
                name: g.name,
                detail: g.email,
                owner: g.owner,
                ownerEmployeeId: g.owner_employee_id,
                code: g.code,
                metaLabel: t('access_department'),
                metaValue: g.department,
            };
        }
        if (kind === 'file-shares') {
            const s = row as FileShare;
            return {
                kind,
                id: s.id,
                name: s.name,
                detail: s.path,
                owner: s.owner,
                ownerEmployeeId: s.owner_employee_id,
                code: s.code,
                metaLabel: t('access_size'),
                metaValue: sizeText(s.size, s.size_unit),
            };
        }
        if (kind === 'social-platforms') {
            const p = row as SocialPlatform;
            return {
                kind,
                id: p.id,
                name: p.name,
                detail: p.url,
                color: p.color,
                code: p.code,
                logo: p.logo_url,
                metaLabel: t('access_policy'),
                metaValue: p.policy,
            };
        }
        const s = row as Software;
        return {
            kind,
            id: s.id,
            name: s.name,
            detail: s.publisher,
            code: s.code,
            logo: s.logo_url,
            metaLabel: t('access_license_type'),
            metaValue: t(`access_lic_${s.license_type}`),
        };
    };

    // The open drawer is derived from the URL (?view=<id> on a registry tab): find the row in
    // the loaded list and build its target. Single source of truth — no separate state, so
    // closing (dropping ?open) can never race a reopen. null = drawer closed.
    const members = useMemo<MemberTarget | null>(() => {
        if (!viewId || tab === 'dashboard') {
            return null;
        }
        const lists: Record<AccessKind, AnyResource[]> = {
            'email-groups': egRows,
            'file-shares': fsRows,
            'social-platforms': spRows,
            software: swRows,
        };
        const row = lists[tab].find((r) => r.id === Number(viewId));
        return row ? buildTarget(tab, row) : null;
    }, [viewId, tab, egRows, fsRows, spRows, swRows]); // eslint-disable-line react-hooks/exhaustive-deps

    // Row-click / "Manage" handlers just deep-link the resource — the URL drives the drawer.
    const openEmailGroup = (g: EmailGroup) => openResource('email-groups', g.id);
    const openFileShare = (s: FileShare) => openResource('file-shares', s.id);
    const openSocial = (p: SocialPlatform) => openResource('social-platforms', p.id);
    const openSoftware = (s: Software) => openResource('software', s.id);

    // Shared trailing action column: Manage members (Edit now lives in the drawer footer).
    // Stops propagation so the row-click (open members) doesn't also fire.
    const actionsCol = <T extends AnyResource>(open: (r: T) => void): Column<T> => ({
        key: 'actions',
        header: t('actions'),
        align: 'right',
        render: (r) => (
            <div className="flex items-center justify-end gap-1.5">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        open(r);
                    }}
                >
                    <Users className="h-3.5 w-3.5" /> {t('access_manage_members')}
                </Button>
            </div>
        ),
    });

    const egColumns: Column<EmailGroup>[] = [
        { key: 'name', header: t('access_name'), render: (g) => <NameCell icon={Users} color="#7c3aed" name={g.name} sub={g.email} /> },
        { key: 'owner', header: t('access_owner'), render: (g) => <OwnerCell owner={g.owner} photoUrl={g.owner_photo_url} /> },
        { key: 'members', header: t('access_members'), render: (g) => <AvatarStack members={g.members ?? []} /> },
        { key: 'department', header: t('access_department'), render: (g) => g.department ?? '—' },
        actionsCol<EmailGroup>(openEmailGroup),
    ];

    // Fixed 26/16/16/18/16/8 split across name / department / size / owner / members / actions.
    const fsColumns: Column<FileShare>[] = [
        {
            key: 'name',
            header: t('access_name'),
            className: 'w-[26%]',
            render: (s) => <NameCell icon={Folder} color="#0d9488" name={s.name} sub={s.path} />,
        },
        {
            key: 'size',
            header: t('access_size'),
            className: 'w-[16%]',
            render: (s) => <span className="font-mono text-[12.5px] whitespace-nowrap">{sizeText(s.size, s.size_unit) ?? '—'}</span>,
        },
        { key: 'owner', header: t('access_owner'), className: 'w-[18%]', render: (s) => <OwnerCell owner={s.owner} photoUrl={s.owner_photo_url} /> },
        { key: 'department', header: t('access_department'), className: 'w-[16%]', render: (s) => s.department ?? '—' },
        { key: 'members', header: t('access_members'), className: 'w-[16%]', render: (s) => <AvatarStack members={s.members ?? []} /> },
        { ...actionsCol<FileShare>(openFileShare), className: 'w-[8%]' },
    ];

    const spColumns: Column<SocialPlatform>[] = [
        {
            key: 'name',
            header: t('access_name'),
            render: (p) => <NameCell icon={Globe} color={p.color ?? '#6366f1'} name={p.name} sub={p.url} logoUrl={p.logo_url} />,
        },
        { key: 'policy', header: t('access_policy'), render: (p) => p.policy ?? '—' },
        { key: 'members', header: t('access_members'), render: (p) => <AvatarStack members={p.members ?? []} /> },
        actionsCol<SocialPlatform>(openSocial),
    ];

    const swColumns: Column<Software>[] = [
        { key: 'name', header: t('access_name'), render: (s) => <NameCell icon={Package} color="#f59e0b" name={s.name} logoUrl={s.logo_url} /> },
        { key: 'publisher', header: t('access_publisher'), render: (s) => s.publisher ?? '—' },
        { key: 'license_type', header: t('access_license_type'), render: (s) => t(`access_lic_${s.license_type}`) },
        {
            key: 'seats',
            header: t('access_seats'),
            render: (s) => {
                const used = s.seats_used ?? s.members?.length ?? 0;
                const over = s.seats != null && used > s.seats;
                return (
                    <span className={cn('font-mono text-[12.5px]', over && 'text-destructive font-semibold')}>
                        {used}
                        {s.seats != null ? `/${s.seats}` : ''}
                    </span>
                );
            },
        },
        { key: 'members', header: t('access_members'), render: (s) => <AvatarStack members={s.members ?? []} /> },
        actionsCol<Software>(openSoftware),
    ];

    return (
        <div className="space-y-5">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{t('access_title')}</h1>
                    <p className="text-muted-foreground mt-0.5 text-sm">{t('access_sub')}</p>
                </div>
            </div>

            {/* Tab card */}
            <Card className="overflow-hidden p-0">
                <div className="border-border flex items-center gap-1 border-b px-2">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={`relative px-3 py-3 text-sm font-medium ${tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {tb.label}
                            {tab === tb.id && <span className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded" />}
                        </button>
                    ))}
                </div>

                <div className="p-4">
                    {tab === 'dashboard' && <AccessDashboard onOpenTab={setTab} onOpenResource={openResource} />}
                    {tab === 'email-groups' && (
                        <DataTable
                            columns={egColumns}
                            rows={egFiltered}
                            rowKey={(g) => g.id}
                            searchable={(g) => `${g.name} ${g.email} ${g.department ?? ''}`}
                            onRowClick={openEmailGroup}
                            loading={emailGroups.isLoading}
                            filters={emailFilter}
                            actions={addButton('email-groups')}
                        />
                    )}
                    {tab === 'file-shares' && (
                        <DataTable
                            columns={fsColumns}
                            rows={fsFiltered}
                            rowKey={(s) => s.id}
                            searchable={(s) => `${s.name} ${s.path} ${s.department ?? ''}`}
                            onRowClick={openFileShare}
                            loading={fileShares.isLoading}
                            filters={fileFilter}
                            actions={addButton('file-shares')}
                        />
                    )}
                    {tab === 'social-platforms' && (
                        <DataTable
                            columns={spColumns}
                            rows={spRows}
                            rowKey={(p) => p.id}
                            searchable={(p) => `${p.name} ${p.url ?? ''} ${p.policy ?? ''}`}
                            onRowClick={openSocial}
                            loading={social.isLoading}
                            actions={addButton('social-platforms')}
                        />
                    )}
                    {tab === 'software' && (
                        <DataTable
                            columns={swColumns}
                            rows={swFiltered}
                            rowKey={(s) => s.id}
                            searchable={(s) => `${s.name} ${s.publisher ?? ''}`}
                            onRowClick={openSoftware}
                            loading={software.isLoading}
                            filters={softwareFilter}
                            actions={addButton('software')}
                        />
                    )}
                </div>
            </Card>

            <ResourceModal
                open={adding || !!editing}
                kind={editing?.kind ?? (tab !== 'dashboard' ? tab : 'email-groups')}
                row={editing?.row ?? null}
                onClose={closeModal}
            />
            <MembersDrawer
                target={members}
                canEdit={members ? canEdit[members.kind] : false}
                canDelete={members ? canDelete[members.kind] : false}
                onClose={closeDrawer}
                onEdit={(tg) => {
                    // Open the edit modal OVER the drawer without dropping ?open, so closing/saving
                    // the modal reveals the manage drawer again (bounce back) instead of nothing.
                    const rows: Record<AccessKind, AnyResource[]> = {
                        'email-groups': egRows,
                        'file-shares': fsRows,
                        'social-platforms': spRows,
                        software: swRows,
                    };
                    const row = rows[tg.kind]?.find((r) => r.id === tg.id) ?? null;
                    if (row) setEditing({ kind: tg.kind, row });
                }}
            />
        </div>
    );
}
