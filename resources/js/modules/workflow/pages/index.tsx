import { translate, useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailed } from '@/shared/components/load-failed';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge } from '@/shared/components/status-badge';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { cn, toRecordId } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Clock, Eye, ListChecks, Pencil, Search, Workflow as WorkflowIcon, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkflowEditorDialog } from '../components/workflow-editor-dialog';
import { WorkflowStrip } from '../components/workflow-strip';
import { WorkflowViewDialog } from '../components/workflow-view-dialog';
import { useWorkflows } from '../hooks/use-workflows';

/** Workflows admin page: one card per request type's approval route, with a view dialog and the step editor. */
export default function WorkflowsPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    const { data, isLoading, isError, refetch } = useWorkflows();
    const workflows = useMemo(() => data?.data ?? [], [data]);
    const measureDays = data?.meta.measure_days ?? 30;

    // Card search lives in the URL (?search).
    const list = useListParams();
    const search = list.get('search');
    const setSearch = (value: string) => list.setFilter('search', value);

    // Dialogs are URL-driven (?view=<id> / ?edit=<id>); open() keeps only one of them.
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

    const viewingId = toRecordId(searchParams.get('view'));
    const editingId = toRecordId(searchParams.get('edit'));
    // Resolved from the list (no show endpoint; a dozen rows)
    const byId = (id: number | null) => (id == null ? null : (workflows.find((w) => w.id === id) ?? null));
    const viewing = byId(viewingId);
    const editing = byId(editingId);
    // Only once the list has arrived; a refetch must not flag the link as dead
    const missing = data != null && (viewingId != null || editingId != null) && !viewing && !editing;

    const filtered = useMemo(() => {
        return workflows.filter((w) => {
            const typeKey = REQUEST_TYPE_META[w.request_type].labelKey;
            return matchesAllWords([w.name, translate('en', typeKey), translate('th', typeKey), ...w.steps.map((s) => s.label)].join(' '), search);
        });
    }, [workflows, search]);

    const totalSteps = workflows.reduce((sum, w) => sum + w.steps.length, 0);
    const longest = workflows.reduce((max, w) => Math.max(max, w.steps.filter((s) => s.kind === 'approval').length), 0);
    const autoCount = workflows.filter((w) => w.auto_ticket).length;

    // Measured decision time, weighted by how many requests each route decided
    const measured = workflows.map((w) => w.measured).filter((m): m is NonNullable<typeof m> => m != null);
    const measuredRequests = measured.reduce((sum, m) => sum + m.requests, 0);
    const avgDecisionDays = measuredRequests
        ? Math.round((measured.reduce((sum, m) => sum + m.avg_days * m.requests, 0) / measuredRequests) * 10) / 10
        : null;

    return (
        <div className="space-y-6">
            {/* Page head — no "new" action: the routes come with the request types */}
            <div>
                <h1 className="text-2xl font-bold">{t('wf_title')}</h1>
                <p className="text-muted-foreground text-sm">{t('wf_sub')}</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                    icon={WorkflowIcon}
                    label={t('wf_kpi_active')}
                    value={String(workflows.filter((w) => w.active).length)}
                    sub={t('wf_kpi_active_sub').replace('{n}', fmtN(workflows.length))}
                    loading={isLoading}
                />
                <StatCard
                    icon={ListChecks}
                    label={t('wf_kpi_steps')}
                    value={String(totalSteps)}
                    sub={`${t('wf_kpi_steps_sub')} ${longest} ${t('wf_kpi_steps_sub_tail')}`}
                    loading={isLoading}
                />
                <StatCard
                    icon={Clock}
                    loading={isLoading}
                    label={t('wf_kpi_decision')}
                    value={avgDecisionDays != null ? `${avgDecisionDays}${t('wf_days_suffix')}` : '—'}
                    // The window and the sample, so it is not read as a target
                    sub={
                        measuredRequests ? (
                            <>
                                <span>{t('wf_kpi_decision_window').replace('{days}', fmtN(measureDays))}</span>
                                <span className="ml-3">
                                    {measuredRequests} {t('wf_kpi_decision_requests')}
                                </span>
                            </>
                        ) : (
                            t('wf_kpi_decision_none').replace('{days}', fmtN(measureDays))
                        )
                    }
                />
                <StatCard
                    icon={Zap}
                    label={t('wf_kpi_auto')}
                    value={`${autoCount}/${workflows.length}`}
                    sub={t('wf_kpi_auto_sub')}
                    loading={isLoading}
                />
            </div>

            {/* Card list */}
            <Card className="overflow-hidden p-0">
                <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
                    <div className="relative w-full max-w-xs">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input
                            className="pl-9 text-ellipsis"
                            placeholder={t('wf_search_ph')}
                            aria-label={searchLabel(t('wf_search_ph'))}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
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

                    {!isLoading && filtered.length === 0 && isError && (
                        <div className="py-10 text-center">
                            <LoadFailed onRetry={() => refetch()} />
                        </div>
                    )}
                    {!isLoading && filtered.length === 0 && !isError && (
                        <EmptyState
                            kind={search.trim() ? 'search' : 'empty'}
                            title={search.trim() ? t('wf_empty_list_search') : t('wf_empty_list')}
                            hint={search.trim() ? t('wf_empty_list_search_hint') : t('wf_empty_list_hint')}
                        />
                    )}

                    {filtered.map((wf) => {
                        const approvals = wf.steps.filter((s) => s.kind === 'approval').length;
                        return (
                            <div
                                key={wf.id}
                                className={cn(
                                    'border-border hover:border-brand/40 cursor-pointer rounded-md border px-4 pt-3.5 pb-4 transition-colors',
                                    !wf.active && 'bg-muted/30 border-dashed',
                                )}
                                onClick={() => open('view', wf.id)}
                            >
                                <div className="mb-3.5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={cn('text-base font-bold tracking-tight', !wf.active && 'text-muted-foreground')}>
                                                {wf.name}
                                            </span>
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
                                            <span className="bg-muted text-foreground/65 dark:text-muted-foreground rounded-full px-2 py-0.5 font-medium">
                                                {t(REQUEST_TYPE_META[wf.request_type].labelKey)}
                                            </span>
                                            <span>
                                                {fmtN(approvals)} {t(approvals === 1 ? 'req_catalog_approval_one' : 'req_catalog_approval_many')}
                                            </span>
                                            {wf.measured && (
                                                <span>
                                                    {t('wf_row_decision')} {fmtN(wf.measured.avg_days, { maxDecimals: 1 })}
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

            {/* A ?view= / ?edit= id that matches nothing */}
            <RecordMissingDialog open={missing} onClose={() => open(null)} />
            <WorkflowViewDialog workflow={viewing} measureDays={measureDays} onClose={() => open(null)} onEdit={(w) => open('edit', w.id)} />
            <WorkflowEditorDialog workflow={editing} onClose={() => open(null)} />
        </div>
    );
}
