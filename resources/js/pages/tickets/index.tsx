import { TableSkeleton } from '@/components/shared/skeletons';
import { AssignTicketModal } from '@/components/tickets/assign-ticket-modal';
import { CreateTicketDrawer } from '@/components/tickets/create-ticket-drawer';
import { ResolveTicketModal, type ResolveMode } from '@/components/tickets/resolve-ticket-modal';
import { TakeCaseModal } from '@/components/tickets/take-case-modal';
import { TicketDetailDrawer } from '@/components/tickets/ticket-detail-drawer';
import { TICKET_CATEGORIES, TicketCategoryIcon, TicketPriorityBadge, TicketStatusBadge } from '@/components/tickets/ticket-meta';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useTickets, useTicketSummary } from '@/hooks/use-tickets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Role, Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/types';
import { Box, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Plus, RefreshCcw, Search, Ticket as TicketIcon } from 'lucide-react';
import { useState } from 'react';

type Tab = 'dashboard' | 'all' | 'mine';
const ALL = '__all__';

/** Formats an average-response duration (minutes) as "42m" or "1h 5m"; "—" when null. */
function formatMinutes(minutes: number | null): string {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Box }) {
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

export default function TicketsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const isIT = isSuper || perms.includes('tickets.view_all');
    const canCreate = isSuper || perms.includes('tickets.create');

    const [tab, setTab] = useState<Tab>(isIT ? 'dashboard' : 'all');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
    const [catFilter, setCatFilter] = useState<TicketCategory | ''>('');
    const [priFilter, setPriFilter] = useState<TicketPriority | ''>('');
    const [page, setPage] = useState(1);

    const [createOpen, setCreateOpen] = useState(false);
    const [detail, setDetail] = useState<Ticket | null>(null);
    const [takeTicket, setTakeTicket] = useState<Ticket | null>(null);
    const [assignTicket, setAssignTicket] = useState<Ticket | null>(null);
    const [resolveState, setResolveState] = useState<{ ticket: Ticket; mode: ResolveMode } | null>(null);

    const { data: summary } = useTicketSummary(isIT);
    const { data: listData, isLoading } = useTickets({
        page,
        per_page: 20,
        search,
        status: statusFilter || undefined,
        category: catFilter || undefined,
        priority: priFilter || undefined,
        mine: tab === 'mine' || undefined,
    });

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    const cats = summary?.by_category ?? [];
    const maxCat = Math.max(1, ...cats.map((c) => c.count));

    const openDetail = (tk: Ticket) => setDetail(tk);
    const startResolve = (tk: Ticket, mode: ResolveMode) => {
        setDetail(null);
        setResolveState({ ticket: tk, mode });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('tickets_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('tickets_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canCreate && (
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="h-4 w-4" />
                            {t('new_ticket')}
                        </Button>
                    )}
                </div>
            </div>

            {isIT && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard label={t('ticket_open')} value={summary?.open ?? 0} icon={TicketIcon} />
                    <StatCard label={t('ticket_in_progress')} value={summary?.in_progress ?? 0} icon={RefreshCcw} />
                    <StatCard label={t('ticket_avg_response')} value={formatMinutes(summary?.avg_response_minutes ?? null)} icon={Clock} />
                    <StatCard
                        label={t('ticket_sla_met')}
                        value={summary?.sla_met_pct == null ? '—' : `${summary.sla_met_pct}%`}
                        icon={CheckCircle2}
                    />
                </div>
            )}

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(isIT ? (['dashboard', 'all', 'mine'] as Tab[]) : (['all'] as Tab[])).map((tb) => (
                        <button
                            key={tb}
                            onClick={() => {
                                setTab(tb);
                                setPage(1);
                            }}
                            className={cn(
                                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb === 'dashboard' ? t('ticket_tab_dashboard') : tb === 'all' ? t('ticket_tab_all') : t('ticket_tab_mine')}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' && isIT && (
                    <div className="space-y-6 p-5">
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('ticket_by_category')}</div>
                            <div className="space-y-2">
                                {cats.map((c) => (
                                    <div key={c.category} className="flex items-center gap-3">
                                        <div className="flex w-28 items-center gap-2 text-sm">
                                            <TicketCategoryIcon category={c.category} className="text-muted-foreground h-4 w-4" />
                                            {t(`ticket_cat_${c.category}`)}
                                        </div>
                                        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                            <div className="bg-brand h-full rounded-full" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                                        </div>
                                        <div className="w-8 text-right font-mono text-sm">{c.count}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('ticket_latest')}</div>
                            <TicketTable rows={rows.slice(0, 5)} t={t} lang={lang} onRow={openDetail} compact />
                        </div>
                    </div>
                )}

                {(tab === 'all' || tab === 'mine') && (
                    <>
                        <div className="flex flex-wrap items-center gap-2 p-3">
                            <div className="relative min-w-[200px] flex-1">
                                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t('ticket_search')}
                                    className="h-9 pl-9"
                                />
                            </div>
                            <Select
                                value={statusFilter || ALL}
                                onValueChange={(v) => {
                                    setStatusFilter(v === ALL ? '' : (v as TicketStatus));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-36">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('ticket_all')}</SelectItem>
                                    {(['open', 'in_progress', 'completed', 'canceled'] as TicketStatus[]).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {t(`ticket_${s}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={catFilter || ALL}
                                onValueChange={(v) => {
                                    setCatFilter(v === ALL ? '' : (v as TicketCategory));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-36">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('ticket_all')}</SelectItem>
                                    {TICKET_CATEGORIES.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {t(`ticket_cat_${c}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={priFilter || ALL}
                                onValueChange={(v) => {
                                    setPriFilter(v === ALL ? '' : (v as TicketPriority));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-36">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('ticket_all')}</SelectItem>
                                    {(['critical', 'high', 'medium', 'low'] as TicketPriority[]).map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {t(`ticket_prio_${p}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="text-muted-foreground ml-auto font-mono text-xs">{meta?.total ?? 0}</div>
                        </div>

                        {isLoading ? (
                            <TableSkeleton />
                        ) : rows.length === 0 ? (
                            <div className="text-muted-foreground px-4 py-16 text-center text-sm">{t('ticket_none')}</div>
                        ) : (
                            <TicketTable rows={rows} t={t} lang={lang} onRow={openDetail} />
                        )}

                        {meta && rows.length > 0 && (
                            <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                                <span>
                                    {meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1}–
                                    {Math.min(meta.current_page * meta.per_page, meta.total)} {t('ticket_of')} {meta.total}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={!!meta && page >= meta.last_page}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            <CreateTicketDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
            <TicketDetailDrawer
                ticket={detail}
                onClose={() => setDetail(null)}
                isIT={isIT}
                isSuper={isSuper}
                meId={user?.id}
                onTake={(tk) => {
                    setDetail(null);
                    setTakeTicket(tk);
                }}
                onAssign={(tk) => {
                    setDetail(null);
                    setAssignTicket(tk);
                }}
                onResolve={startResolve}
            />
            <TakeCaseModal ticket={takeTicket} onClose={() => setTakeTicket(null)} />
            <AssignTicketModal ticket={assignTicket} onClose={() => setAssignTicket(null)} />
            <ResolveTicketModal ticket={resolveState?.ticket ?? null} mode={resolveState?.mode ?? null} onClose={() => setResolveState(null)} />
        </div>
    );
}

/** Shared ticket table used by both the dashboard preview and the list tabs. */
function TicketTable({
    rows,
    t,
    lang,
    onRow,
    compact,
}: {
    rows: Ticket[];
    t: (k: string) => string;
    lang: string;
    onRow: (tk: Ticket) => void;
    compact?: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                        <th className="px-4 py-2.5">ID</th>
                        <th className="px-4 py-2.5">{t('ticket_subject')}</th>
                        <th className="px-4 py-2.5">{t('ticket_category')}</th>
                        <th className="px-4 py-2.5">{t('ticket_priority')}</th>
                        <th className="px-4 py-2.5">{t('status')}</th>
                        {!compact && <th className="px-4 py-2.5">{t('ticket_requester')}</th>}
                        <th className="px-4 py-2.5">{t('ticket_assignee')}</th>
                        {!compact && <th className="px-4 py-2.5">{t('ticket_updated')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((tk) => (
                        <tr
                            key={tk.id}
                            className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0"
                            onClick={() => onRow(tk)}
                        >
                            <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.ticket_no}</td>
                            <td className="max-w-[280px] truncate px-4 py-2.5 font-medium">
                                {lang === 'th' && tk.subject_th ? tk.subject_th : tk.subject}
                            </td>
                            <td className="px-4 py-2.5">
                                <span className="flex items-center gap-2">
                                    <TicketCategoryIcon category={tk.category} className="text-muted-foreground h-4 w-4" />
                                    {t(`ticket_cat_${tk.category}`)}
                                </span>
                            </td>
                            <td className="px-4 py-2.5">
                                <TicketPriorityBadge priority={tk.priority} t={t} />
                            </td>
                            <td className="px-4 py-2.5">
                                <TicketStatusBadge status={tk.status} t={t} />
                            </td>
                            {!compact && (
                                <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.requester_code ?? tk.requester_name}</td>
                            )}
                            <td className="px-4 py-2.5">
                                {tk.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>}
                            </td>
                            {!compact && <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.updated_at?.slice(0, 10)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
