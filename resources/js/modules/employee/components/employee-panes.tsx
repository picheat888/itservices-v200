// Read-only parts of an employee record shared by the Employee viewer and My Profile:
// rail rows, identity chips, and the Assets / Tickets / Requests / Access tabs.
import { useT } from '@/lang';
import { TicketCategoryIcon, TicketStatusBadge } from '@/modules/ticket';
import { DataTable, type Column } from '@/shared/components/data-table';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { EmptyPane } from '@/shared/components/empty-pane';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import { isOnBehalfRequest, REQUEST_ONBOARDING_BADGE, REQUEST_STATUS_META, REQUEST_TYPE_META, requestTitle } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { EmployeeAccess, EmployeeAccessRow } from '@/shared/types';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, Folder, Globe, Inbox, Laptop, Mail, Package, Shield, Tag, Ticket, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { EmployeeHeldAsset, EmployeeRequestedTicket, EmployeeServiceRequest } from '../api/employeeApi';
import { HELD_STATUS_META } from '../lib/held-assets';

export const RAIL_HEADING = 'text-muted-foreground border-border border-b pb-1.5 text-xs font-bold';

/** A chip of identity under the name (code, position, department…). */
export function IdChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                'bg-muted border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
            )}
        >
            <Icon className="text-muted-foreground h-3 w-3" aria-hidden />
            {children}
        </span>
    );
}

// Rail field row with an optional copy button
export function RailRow({
    icon,
    label,
    value,
    loading,
    copied,
    onCopy,
}: {
    icon: React.ReactNode;
    label: string;
    value?: string | null;
    /** The value is still on its way: a placeholder bar instead of "—" */
    loading?: boolean;
    copied?: boolean;
    onCopy?: (value: string) => void;
}) {
    const t = useT();
    return (
        <div className="group flex items-start gap-2.5">
            <div className="bg-muted text-muted-foreground grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg">{icon}</div>
            <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-xs">{label}</div>
                {loading && !value ? (
                    <Skeleton className="mt-1.5 h-3 w-24" />
                ) : (
                    <div className={'mt-0.5 text-[13px] leading-snug font-medium break-words'}>{value || '—'}</div>
                )}
            </div>
            {onCopy && value && (
                <button
                    type="button"
                    onClick={() => onCopy(value)}
                    aria-label={`${t('emp_v_copy')} ${label}`}
                    title={t('emp_v_copy')}
                    className={cn(
                        'hover:bg-accent focus-visible:ring-brand grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(pointer:coarse)]:opacity-100',
                        copied && 'text-emerald-700 opacity-100 dark:text-emerald-400',
                    )}
                >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    );
}

/** Access tab: read-only, grouped by kind, owners first; granting and revoking live in the Access Directory. */
export function AccessPane({ access, loading, emptyText }: { access: EmployeeAccess | undefined; loading?: boolean; emptyText: string }) {
    const t = useT();
    const accessLoading = loading;

    const accessGroups = [
        { key: 'email_groups' as const, label: t('emp_v_email_groups'), icon: <Mail className="h-3.5 w-3.5" /> },
        { key: 'file_shares' as const, label: t('emp_v_file_shares'), icon: <Folder className="h-3.5 w-3.5" /> },
        { key: 'social' as const, label: t('emp_v_social'), icon: <Globe className="h-3.5 w-3.5" /> },
        { key: 'software' as const, label: t('access_software'), icon: <Package className="h-3.5 w-3.5" /> },
    ];

    // Role/level pill per group: email groups owner/member, file shares owner/level, others none
    const rolePill = (key: string, r: EmployeeAccessRow): { label: string; cls: string } | null => {
        const owner = { label: t('emp_v_role_owner'), cls: 'bg-brand/15 text-brand-ink' };
        const muted = 'bg-muted text-muted-foreground';
        if (key === 'email_groups') return r.is_owner ? owner : { label: t('emp_v_role_member'), cls: muted };
        if (key === 'file_shares') {
            if (r.is_owner) return owner;
            if (r.access_level === 'Write') return { label: t('emp_v_level_read_write'), cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' };
            if (r.access_level === 'Read') return { label: t('emp_v_level_read'), cls: muted };
            if (r.access_level) return { label: r.access_level, cls: muted };
        }
        return null;
    };

    // Leading tile: uploaded logo, else the resource initial on its own colour or a brand tint
    const leadingTile = (key: string, r: EmployeeAccessRow) => {
        if (r.resource_logo) {
            return <img src={r.resource_logo} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />;
        }
        const color = r.resource_color ?? null;
        const style = color ? { background: `${color}22`, color } : undefined;
        const brandTint = color ? '' : 'bg-brand/15 text-brand-ink';
        const content =
            key === 'email_groups' ? (
                <Mail className="h-4 w-4" />
            ) : key === 'file_shares' ? (
                <Folder className="h-4 w-4" />
            ) : (
                <span className="text-[12px] font-bold">{(r.resource_name?.trim()[0] ?? '?').toUpperCase()}</span>
            );
        return (
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', brandTint)} style={style}>
                {content}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            {/* Placeholder rows while loading, so it never reads as no access */}
            {accessLoading && (
                <div className="space-y-2" aria-busy="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-1">
                            <div className="bg-muted h-3 w-28 animate-pulse rounded" />
                            <div className="border-border bg-card h-10 animate-pulse rounded-lg border" />
                        </div>
                    ))}
                </div>
            )}
            {access?.outstanding && (
                <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{t('emp_v_access_outstanding')}</span>
                </div>
            )}
            {accessGroups.map((grp) => {
                // Owners first, then by name
                const rows = [...(access?.[grp.key] ?? [])].sort(
                    (a, b) => Number(!!b.is_owner) - Number(!!a.is_owner) || (a.resource_name ?? '').localeCompare(b.resource_name ?? ''),
                );
                if (rows.length === 0) return null;
                return (
                    <div key={grp.key} className="space-y-1">
                        <div className="text-muted-foreground flex items-center gap-2 text-[12.5px] font-bold">
                            {grp.icon}
                            {grp.label}
                            <span className="bg-muted inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 text-[11px] font-bold">
                                {rows.length}
                            </span>
                        </div>
                        {rows.map((r) => {
                            const pill = rolePill(grp.key, r);
                            return (
                                <div key={r.id} className="border-border bg-card flex items-center gap-3 rounded-lg border px-3 py-1.5">
                                    {leadingTile(grp.key, r)}
                                    {grp.key === 'software' ? (
                                        // One line: brand (resource_detail) bold, then the name
                                        <div className="min-w-0 flex-1 truncate text-[13px] leading-tight">
                                            {r.resource_detail && <span className="font-bold">{r.resource_detail} </span>}
                                            {r.resource_name}
                                        </div>
                                    ) : grp.key === 'social' ? (
                                        // One line: platform name, then the URL in
                                        <div className="min-w-0 flex-1 truncate text-[13px] leading-tight">
                                            <span className="font-semibold">{r.resource_name}</span>
                                            {r.resource_detail && <span className="text-muted-foreground ml-2 text-[11px]">{r.resource_detail}</span>}
                                        </div>
                                    ) : (
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] leading-tight font-medium">{r.resource_name}</div>
                                            <div className="text-muted-foreground truncate text-[11px] leading-tight">
                                                {r.resource_detail ?? r.resource_code}
                                            </div>
                                        </div>
                                    )}
                                    {pill && (
                                        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', pill.cls)}>
                                            {pill.label}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
            {access && access.email_groups.length + access.file_shares.length + access.social.length + access.software.length === 0 && (
                <EmptyPane icon={Shield} text={emptyText} />
            )}
        </div>
    );
}

/** Assets tab: read-only table of what the employee currently holds. */
export function AssetsPane({
    assets,
    lang,
    loading,
    emptyText,
}: {
    assets: EmployeeHeldAsset[];
    lang: string;
    loading?: boolean;
    emptyText: string;
}) {
    const t = useT();
    const fmt = useDateFormat();
    // Empty only counts once this person's list has actually arrived; while it is on
    // its way the table shows its own loading rows (below).
    if (assets.length === 0 && !loading) {
        return <EmptyPane icon={Laptop} text={emptyText} />;
    }

    const columns: Column<EmployeeHeldAsset>[] = [
        {
            key: 'device',
            header: t('emp_v_col_device'),
            render: (a) => {
                const meta = HELD_STATUS_META[a.status] ?? null;
                const type = localPair(a.type, a.type_th, lang) ?? '—';
                return (
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="bg-accent text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Laptop className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-xs font-medium">{a.model ?? a.asset_code}</div>
                            {/* Type, then the status with its dot */}
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                                <span>{type}</span>
                                <span className={cn('ml-1.5 h-1.5 w-1.5 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                                <span>{meta ? t(meta.key) : a.status}</span>
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'tag',
            header: t('emp_v_col_tag'),
            render: (a) =>
                a.tag ? (
                    <span className="bg-brand/10 text-brand-ink inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                        <Tag className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate">{a.tag}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                ),
        },
        {
            key: 'serial',
            header: t('emp_v_col_serial'),
            render: (a) => <span className="text-foreground text-xs">{a.serial ?? a.asset_code}</span>,
        },
        {
            key: 'received',
            header: t('emp_v_col_received'),
            render: (a) => <span className="text-muted-foreground text-xs font-semibold">{fmt.date(a.owned_since)}</span>,
        },
    ];

    // Same compact treatment as the Tickets tab: fillHeight sizes rows to the pane and the
    // wrapper tightens the density token so both tabs read as one table style.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={48} columns={columns} rows={assets} rowKey={(a) => a.id} loading={loading} />
        </div>
    );
}

/** Tickets tab: read-only table of the tickets this employee has requested. */
export function TicketsPane({
    tickets,
    loading,
    emptyText,
}: {
    tickets: Omit<EmployeeRequestedTicket, 'priority'>[];
    loading?: boolean;
    emptyText: string;
}) {
    const t = useT();
    if (tickets.length === 0 && !loading) {
        return <EmptyPane icon={Ticket} text={emptyText} />;
    }

    const columns: Column<Omit<EmployeeRequestedTicket, 'priority'>>[] = [
        {
            key: 'requested',
            header: t('ticket_request_at'),
            className: 'w-[14%]',
            render: (tk) => <DateTimeCell value={tk.created_at} className="text-muted-foreground font-semibold" />,
        },
        {
            key: 'subject',
            header: t('ticket_subject'),
            // max-w-0 stops the no-wrap truncate text from stretching the column past its
            // 50% share (auto table layout sizes columns by content otherwise).
            className: 'w-[50%] max-w-0',
            // Two-line cell: subject on top, ticket number underneath.
            render: (tk) => (
                <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{tk.subject}</div>
                    <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{tk.ticket_no}</div>
                </div>
            ),
        },
        {
            key: 'category',
            header: t('ticket_category'),
            className: 'w-[16%]',
            render: (tk) => (
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <TicketCategoryIcon category={tk.category} className="h-3.5 w-3.5" />
                    {t(`ticket_cat_${tk.category}`)}
                </span>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            className: 'w-[20%]',
            render: (tk) => <TicketStatusBadge status={tk.status} t={t} />,
        },
    ];

    // fillHeight sizes rows-per-page to the pane's real height, so the tab never scrolls
    // on any screen — extra tickets flow to the pager. The wrapper keeps the height chain
    // intact (flex-1/min-h-0) and tightens the density token so compact rows fit more.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={44} columns={columns} rows={tickets} rowKey={(tk) => tk.id} loading={loading} />
        </div>
    );
}

/** Requests tab: read-only table of requests this employee owns; rows stay unclickable (Request permission not required here). */
export function RequestsPane({ requests, loading, emptyText }: { requests: EmployeeServiceRequest[]; loading?: boolean; emptyText: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (requests.length === 0 && !loading) {
        return <EmptyPane icon={Inbox} text={emptyText} />;
    }

    const columns: Column<EmployeeServiceRequest>[] = [
        {
            key: 'submitted',
            header: t('req_col_submitted'),
            className: 'w-[14%]',
            render: (r) => <DateTimeCell value={r.created_at} className="text-muted-foreground font-semibold" />,
        },
        {
            key: 'title',
            // max-w-0 keeps the truncating cell inside its share of the table (see TicketsPane).
            className: 'w-[50%] max-w-0',
            header: t('req_col_title'),
            // The service name is written in the reader's language, never the filer's; the
            // reference underneath is what both of them would quote to each other.
            render: (r) => (
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-medium">{requestTitle(r, t, lang)}</span>
                        {isOnBehalfRequest(r) && (
                            <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} dot={false} className="shrink-0">
                                {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                            </StatusBadge>
                        )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{r.reference}</div>
                </div>
            ),
        },
        {
            key: 'type',
            header: t('req_col_type'),
            className: 'w-[16%]',
            render: (r) => {
                const meta = REQUEST_TYPE_META[r.type];
                const Icon = meta.icon;
                return (
                    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                        {t(meta.labelKey)}
                    </span>
                );
            },
        },
        {
            key: 'status',
            header: t('req_col_status'),
            className: 'w-[20%]',
            render: (r) => <StatusBadge tone={REQUEST_STATUS_META[r.status].tone}>{t(REQUEST_STATUS_META[r.status].labelKey)}</StatusBadge>,
        },
    ];

    // Same sizing as the Tickets tab so the two read as one table style.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={44} columns={columns} rows={requests} rowKey={(r) => r.id} loading={loading} />
        </div>
    );
}
