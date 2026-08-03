import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { Workflow } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Clock, Eye, ListChecks, Pencil, Plus, Search, Workflow as WorkflowIcon, Zap, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WorkflowEditorDialog } from '../components/workflow-editor-dialog';
import { fmtSla, WorkflowStrip } from '../components/workflow-strip';
import { WorkflowViewDialog } from '../components/workflow-view-dialog';
import { useWorkflows } from '../hooks/use-workflows';

/**
 * Workflows admin page: the approval routes, one card per request type,
 * with a read-only view dialog and the step editor. Steps resolve against each
 * requester's reporting line at submit time — this page only edits definitions.
 */
export default function WorkflowsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const pushToast = useToastStore((s) => s.push);
    const { data: workflows = [], isLoading } = useWorkflows();

    const [search, setSearch] = useState('');
    const [viewing, setViewing] = useState<Workflow | null>(null);
    const [editing, setEditing] = useState<Workflow | null>(null);

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
    const avgSla = workflows.length
        ? workflows.reduce((sum, w) => sum + w.steps.reduce((a, s) => a + Number(s.sla_days || 0), 0), 0) / workflows.length
        : 0;

    return (
        <div className="space-y-5">
            {/* Page head */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('wf_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('wf_sub')}</p>
                </div>
                <Button onClick={() => pushToast(t('wf_coming_soon'), 'info', t('wf_new'))}>
                    <Plus className="h-4 w-4" />
                    {t('wf_new')}
                </Button>
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
                <Stat icon={Clock} label={t('wf_kpi_sla')} value={fmtSla(Math.round(avgSla * 10) / 10, lang)} sub={t('wf_kpi_sla_sub')} />
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
                        const totalSla = wf.steps.reduce((sum, s) => sum + Number(s.sla_days || 0), 0);
                        return (
                            <div
                                key={wf.id}
                                // rounded-md, never larger than the enclosing card's rounded-lg.
                                className={cn(
                                    'border-border hover:border-brand/40 cursor-pointer rounded-md border px-4 pt-3.5 pb-4 transition-colors',
                                    !wf.active && 'opacity-70',
                                )}
                                onClick={() => setViewing(wf)}
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
                                                {approvals} {t(approvals === 1 ? 'req_catalog_approval_one' : 'req_catalog_approval_many')} ·{' '}
                                                {fmtSla(totalSla, lang)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="outline" size="sm" onClick={() => setViewing(wf)}>
                                            <Eye className="h-3.5 w-3.5" />
                                            {t('wf_view')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setEditing(wf)}>
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

            <WorkflowViewDialog
                workflow={viewing}
                onClose={() => setViewing(null)}
                onEdit={(w) => {
                    setViewing(null);
                    setEditing(w);
                }}
            />
            <WorkflowEditorDialog workflow={editing} onClose={() => setEditing(null)} />
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
