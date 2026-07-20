import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { AvatarStack } from '@/shared/components/avatar-stack';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Building2, Folder, Globe, KeyRound, Layers, Package, Plus, Tag, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { MembersDrawer, type MemberTarget } from '../components/members-drawer';
import { ResourceModal } from '../components/resource-modal';
import { useEmailGroups, useFileShares, useSocialPlatforms, useSoftware } from '../hooks/use-access';

type Tab = AccessKind;
/** Any of the four access resource shapes — used for the create/edit modal state. */
type AnyResource = EmailGroup | FileShare | SocialPlatform | Software;

/** SearchableSelect sentinel for the "no filter" option. */
const ALL = '__all__';
/** Software licence types, in display order (matches the resource form). */
const LICENSES = ['subscription', 'perpetual', 'open_source', 'free'] as const;

/** Compact KPI card (icon tile + big number + label). */
function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

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
                <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${color}18`, color }}>
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
    const canManage = can('access.manage');
    const [tab, setTab] = useState<Tab>('email-groups');
    const [editing, setEditing] = useState<{ kind: AccessKind; row: AnyResource | null } | null>(null);
    const [members, setMembers] = useState<MemberTarget | null>(null);
    // Client-side filters per tab (department for email/file; licence + brand for software).
    const [egDept, setEgDept] = useState('');
    const [fsDept, setFsDept] = useState('');
    const [swLicense, setSwLicense] = useState('');
    const [swPublisher, setSwPublisher] = useState('');

    const emailGroups = useEmailGroups();
    const fileShares = useFileShares();
    const social = useSocialPlatforms();
    const software = useSoftware();

    const egRows = useMemo(() => emailGroups.data ?? [], [emailGroups.data]);
    const fsRows = useMemo(() => fileShares.data ?? [], [fileShares.data]);
    const spRows = useMemo(() => social.data ?? [], [social.data]);
    const swRows = useMemo(() => software.data ?? [], [software.data]);

    const totalGrants = useMemo(
        () => [...egRows, ...fsRows, ...spRows, ...swRows].reduce((sum, r) => sum + (r.members_count ?? 0), 0),
        [egRows, fsRows, spRows, swRows],
    );

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

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'email-groups', label: t('access_email_groups'), count: egRows.length },
        { id: 'file-shares', label: t('access_file_shares'), count: fsRows.length },
        { id: 'social-platforms', label: t('access_social'), count: spRows.length },
        { id: 'software', label: t('access_software'), count: swRows.length },
    ];

    const newLabel: Record<Tab, string> = {
        'email-groups': t('access_new_group'),
        'file-shares': t('access_new_share'),
        'social-platforms': t('access_new_platform'),
        software: t('access_new_software'),
    };

    // "+ New …" button rendered inside each table's search row (right side), gated by manage.
    const addButton = (kind: Tab) =>
        canManage ? (
            <Button onClick={() => setEditing({ kind, row: null })}>
                <Plus className="h-4 w-4" /> {newLabel[kind]}
            </Button>
        ) : undefined;

    const openEmailGroup = (g: EmailGroup) =>
        setMembers({
            kind: 'email-groups',
            id: g.id,
            name: g.name,
            detail: g.email,
            owner: g.owner,
            ownerEmployeeId: g.owner_employee_id,
            code: g.code,
            metaLabel: t('access_department'),
            metaValue: g.department,
        });
    // Compose the split size columns for display: null = unspecified (—), 0 = unlimited,
    // otherwise a thousands-separated value with its unit ("5,000 GB").
    const sizeText = (size?: number | null, unit?: string | null) => {
        if (size == null) return null;
        if (size === 0) return t('access_size_unlimited');
        return `${size.toLocaleString()}${unit ? ` ${unit}` : ''}`;
    };
    const openFileShare = (s: FileShare) =>
        setMembers({
            kind: 'file-shares',
            id: s.id,
            name: s.name,
            detail: s.path,
            owner: s.owner,
            ownerEmployeeId: s.owner_employee_id,
            code: s.code,
            metaLabel: t('access_size'),
            metaValue: sizeText(s.size, s.size_unit),
        });
    const openSocial = (p: SocialPlatform) =>
        setMembers({
            kind: 'social-platforms',
            id: p.id,
            name: p.name,
            detail: p.url,
            color: p.color,
            code: p.code,
            metaLabel: t('access_policy'),
            metaValue: p.policy,
        });
    const openSoftware = (s: Software) =>
        setMembers({
            kind: 'software',
            id: s.id,
            name: s.name,
            detail: s.publisher,
            code: s.code,
            metaLabel: t('access_license_type'),
            metaValue: t(`access_lic_${s.license_type}`),
        });

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
        { key: 'department', header: t('access_department'), className: 'w-[16%]', render: (s) => s.department ?? '—' },
        {
            key: 'size',
            header: t('access_size'),
            className: 'w-[16%]',
            render: (s) => <span className="font-mono text-[12.5px] whitespace-nowrap">{sizeText(s.size, s.size_unit) ?? '—'}</span>,
        },
        { key: 'owner', header: t('access_owner'), className: 'w-[18%]', render: (s) => <OwnerCell owner={s.owner} photoUrl={s.owner_photo_url} /> },
        { key: 'members', header: t('access_members'), className: 'w-[16%]', render: (s) => <AvatarStack members={s.members ?? []} /> },
        { ...actionsCol<FileShare>(openFileShare), className: 'w-[8%]' },
    ];

    const spColumns: Column<SocialPlatform>[] = [
        { key: 'name', header: t('access_name'), render: (p) => <NameCell icon={Globe} color={p.color ?? '#6366f1'} name={p.name} sub={p.url} /> },
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
                    <h1 className="text-xl font-semibold">{t('access_title')}</h1>
                    <p className="text-muted-foreground mt-0.5 text-sm">{t('access_sub')}</p>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <StatCard label={t('access_email_groups')} value={egRows.length} icon={Users} />
                <StatCard label={t('access_file_shares')} value={fsRows.length} icon={Folder} />
                <StatCard label={t('access_social')} value={spRows.length} icon={Globe} />
                <StatCard label={t('access_software')} value={swRows.length} icon={Package} />
                <StatCard label={t('access_total_grants')} value={totalGrants} icon={Layers} />
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
                            <span className="ml-1.5 font-mono text-xs opacity-60">{tb.count}</span>
                            {tab === tb.id && <span className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded" />}
                        </button>
                    ))}
                </div>

                <div className="p-4">
                    {tab === 'email-groups' && (
                        <DataTable
                            columns={egColumns}
                            rows={egFiltered}
                            rowKey={(g) => g.id}
                            searchable={(g) => `${g.name} ${g.email} ${g.department ?? ''}`}
                            onRowClick={openEmailGroup}
                            loading={emailGroups.isLoading}
                            actions={
                                <div className="flex gap-2">
                                    {emailFilter}
                                    {addButton('email-groups')}
                                </div>
                            }
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
                            actions={
                                <div className="flex gap-2">
                                    {fileFilter}
                                    {addButton('file-shares')}
                                </div>
                            }
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
                            actions={
                                <div className="flex gap-2">
                                    {softwareFilter}
                                    {addButton('software')}
                                </div>
                            }
                        />
                    )}
                </div>
            </Card>

            <ResourceModal open={!!editing} kind={editing?.kind ?? 'email-groups'} row={editing?.row ?? null} onClose={() => setEditing(null)} />
            <MembersDrawer
                target={members}
                canManage={canManage}
                onClose={() => setMembers(null)}
                onEdit={(tg) => {
                    const rows: Record<AccessKind, AnyResource[]> = {
                        'email-groups': egRows,
                        'file-shares': fsRows,
                        'social-platforms': spRows,
                        software: swRows,
                    };
                    const row = rows[tg.kind]?.find((r) => r.id === tg.id) ?? null;
                    setMembers(null);
                    if (row) setEditing({ kind: tg.kind, row });
                }}
            />
        </div>
    );
}
