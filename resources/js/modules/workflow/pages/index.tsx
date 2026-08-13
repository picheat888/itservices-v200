import { useT } from '@/lang';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn, toRecordId } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Clock, Eye, ListChecks, Pencil, Search, Workflow as WorkflowIcon, Zap, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkflowEditorDialog } from '../components/workflow-editor-dialog';
import { WorkflowStrip } from '../components/workflow-strip';
import { WorkflowViewDialog } from '../components/workflow-view-dialog';
import { useWorkflows } from '../hooks/use-workflows';

/**
 * Workflows admin page: the approval routes, one card per request type,
 * with a read-only view dialog and the step editor. Steps resolve against each
 * requester's reporting line at submit time — this page only edits definitions.
 */
export default function WorkflowsPage() {
    const t = useT();
    const { data, isLoading } = useWorkflows();
    // Memoised so the search filter below is not handed a new array every render.
    const workflows = useMemo(() => data?.data ?? [], [data]);
    const measureDays = data?.meta.measure_days ?? 30;

    const [search, setSearch] = useState('');

    // Both dialogs are URL-driven (?view=<id> / ?edit=<id>), so a reload or a shared link
    // reopens exactly what was open. `open()` writes one param and drops the other, which is
    // what makes "open one at a time" a property of the URL rather than a rule to remember.
    const [searchParams, setSearchParams] = useSearchParams();
    const open = (mode: 'view' | 'edit' | null, id?: number) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('view');
                p.delete('edit');
                if (mode && id != null) {
                    p.set(mode, String(id));
                }
                return p;
            },
            { replace: true },
        );

    // toRecordId rejects '?view=abc': Number('abc') is NaN, which slips past an `!= null`
    // guard and would look up a workflow that can never exist.
    const viewingId = toRecordId(searchParams.get('view'));
    const editingId = toRecordId(searchParams.get('edit'));
    // Resolved from the list rather than fetched: this module has no show endpoint, and the
    // routes come with the request types — a dozen rows, all of them already here.
    const byId = (id: number | null) => (id == null ? null : (workflows.find((w) => w.id === id) ?? null));
    const viewing = byId(viewingId);
    const editing = byId(editingId);
    // Only once the list has actually arrived: while it is loading, an id nobody can match yet
    // is not a dead link. `data` rather than `isLoading` — a refetch must not accuse the URL.
    const missing = data != null && (viewingId != null || editingId != null) && !viewing && !editing;

    const filtered = useMemo(() => {
        if (!search.trim()) return workflows;
        const q = search.toLowerCase();
        return workflows.filter((w) =>
            [w.name, t(REQUEST_TYPE_META[w.request_type].labelKey), ...w.steps.map((s) => s.label)].join(' ').toLowerCase().includes(q),
        );
    }, [workflows, search, t]);

    const totalSteps = workflows.reduce((sum, w) => sum + w.steps.length, 0);
    const longest = workflows.reduce((max, w) => Math.max(max, w.steps.filter((s) => s.kind === 'approval').length), 0);
    const autoCount = workflows.filter((w) => w.auto_ticket).length;

    // Measured, not configured: the mean of the requests each route actually decided
    // inside the API's window, weighted by how many there were — a route that ran
    // twice should not swing the figure as hard as one that ran fifty times.
    const measured = workflows.map((w) => w.measured).filter((m): m is NonNullable<typeof m> => m != null);
    const measuredRequests = measured.reduce((sum, m) => sum + m.requests, 0);
    const avgDecisionDays = measuredRequests
        ? Math.round((measured.reduce((sum, m) => sum + m.avg_days * m.requests, 0) / measuredRequests) * 10) / 10
        : null;

    return (
        <div className="space-y-5">
            {/* Page head — no "new workflow" action: the eleven routes come with the
                request types, and this module exists to adjust their steps. */}
            <div>
                <h1 className="text-2xl font-bold">{t('wf_title')}</h1>
                <p className="text-muted-foreground text-sm">{t('wf_sub')}</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat
                    icon={WorkflowIcon}
                    label={t('wf_kpi_active')}
                    value={String(workflows.filter((w) => w.active).length)}
                    sub={`${workflows.length} ${t('wf_kpi_active_sub')}`}
                />
                <Stat
                    icon={ListChecks}
                    label={t('wf_kpi_steps')}
                    value={String(totalSteps)}
                    sub={`${t('wf_kpi_steps_sub')} ${longest} ${t('wf_kpi_steps_sub_tail')}`}
                />
                <Stat
                    icon={Clock}
                    label={t('wf_kpi_decision')}
                    value={avgDecisionDays != null ? `${avgDecisionDays}${t('wf_days_suffix')}` : '—'}
                    // States the window and the sample, so a figure that moves week to
                    // week is not read as a target somebody set.
                    sub={
                        measuredRequests
                            ? `${t('wf_kpi_decision_window').replace('{days}', String(measureDays))} · ${measuredRequests} ${t('wf_kpi_decision_requests')}`
                            : t('wf_kpi_decision_none').replace('{days}', String(measureDays))
                    }
                />
                <Stat icon={Zap} label={t('wf_kpi_auto')} value={`${autoCount}/${workflows.length}`} sub={t('wf_kpi_auto_sub')} />
            </div>

            {/* Card list */}
            <Card className="overflow-hidden p-0">
                <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
                    <div className="relative w-full max-w-xs">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input className="h-9 pl-9" placeholder={t('wf_search_ph')} value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <p className="text-muted-foreground ml-auto hidden text-xs sm:block">{t('wf_search_hint')}</p>
                </div>

                <div className="space-y-3 p-4">
                    {isLoading &&
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="border-border rounded-md border p-4">
                                <Skeleton className="h-4 w-56" />
                                <Skeleton className="mt-3 h-12 w-full" />
                            </div>
                        ))}

                    {!isLoading && filtered.length === 0 && <p className="text-muted-foreground py-10 text-center text-sm">{t('wf_no_match')}</p>}

                    {filtered.map((wf) => {
                        const approvals = wf.steps.filter((s) => s.kind === 'approval').length;
                        return (
                            <div
                                key={wf.id}
                                // rounded-md, never larger than the enclosing card's rounded-lg.
                                className={cn(
                                    'border-border hover:border-brand/40 cursor-pointer rounded-md border px-4 pt-3.5 pb-4 transition-colors',
                                    !wf.active && 'opacity-70',
                                )}
                                onClick={() => open('view', wf.id)}
                            >
                                <div className="mb-3.5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-base font-bold tracking-tight">{wf.name}</span>
                                            <StatusBadge tone={wf.active ? 'green' : 'gray'}>
                                                {wf.active ? t('wf_active') : t('wf_inactive')}
                                            </StatusBadge>
                                            {wf.auto_ticket && (
                                                <StatusBadge tone="blue" dot={false}>
                                                    <Zap className="h-3 w-3" />
                                                    {t('wf_auto_ticket')}
                                                </StatusBadge>
                                            )}
                                        </div>
                                        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            <span className="bg-muted rounded-full px-2 py-0.5 font-medium">
                                                {t(REQUEST_TYPE_META[wf.request_type].labelKey)}
                                            </span>
                                            <span className="font-mono">
                                                {approvals} {t(approvals === 1 ? 'req_catalog_approval_one' : 'req_catalog_approval_many')}
                                            </span>
                                            {/* What this route took in practice, or nothing at all rather than a zero. */}
                                            {wf.measured && (
                                                <span className="font-mono">
                                                    · {t('wf_row_decision')} {wf.measured.avg_days}
                                                    {t('wf_days_suffix')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="outline" size="sm" onClick={() => open('view', wf.id)}>
                                            <Eye className="h-3.5 w-3.5" />
                                            {t('wf_view')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => open('edit', wf.id)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                            {t('wf_edit')}
                                        </Button>
                                    </div>
                                </div>
                                <WorkflowStrip steps={wf.steps} />
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* A ?view= / ?edit= id that matches nothing rendered a page with no dialog and no
                explanation. This says the record is gone and clears the dead param. */}
            <RecordMissingDialog open={missing} onClose={() => open(null)} />
            <WorkflowViewDialog workflow={viewing} measureDays={measureDays} onClose={() => open(null)} onEdit={(w) => open('edit', w.id)} />
            <WorkflowEditorDialog workflow={editing} onClose={() => open(null)} />
        </div>
    );
}

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground min-w-0 text-sm">{label}</div>
                {/* Brand-tinted tile — follows the theme colour set in Settings. */}
                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            <div className="text-muted-foreground mt-1 truncate text-xs">{sub}</div>
        </Card>
    );
}
