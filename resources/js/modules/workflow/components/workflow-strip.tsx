import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { WorkflowStep } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { Check } from 'lucide-react';
import { Fragment } from 'react';

/** "1 วัน" / "1d" — SLA day counts, trimming a trailing .0 (0.5 stays). */
export function fmtSla(days: number | null | undefined, lang: string): string {
    if (days == null) return '';
    const compact = String(Number(days));
    return lang === 'th' ? `${compact} วัน` : `${compact}d`;
}

/**
 * Horizontal approval-chain visual: Submitted → each step (approval = green,
 * fulfillment = brand) → Closed. The signature workflow element, shared by the
 * Workflows admin cards/dialogs and the New Request route panel.
 */
export function WorkflowStrip({
    steps,
    showSla = true,
}: {
    steps: Pick<WorkflowStep, 'label' | 'kind' | 'sla_days'>[];
    /** Off for requester-facing views — SLA is admin configuration, not a signal to requesters. */
    showSla?: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const nodes: { label: string; kind: 'start' | 'end' | WorkflowStep['kind']; sla?: number | null }[] = [
        { label: t('wf_submitted'), kind: 'start' },
        ...steps.map((s) => ({ label: s.label, kind: s.kind, sla: s.sla_days })),
        { label: t('wf_closed'), kind: 'end' },
    ];

    let stepNo = 0;
    return (
        <div className="flex items-stretch overflow-x-auto pb-1">
            {nodes.map((node, i) => {
                const isStep = node.kind === 'approval' || node.kind === 'fulfillment';
                if (isStep) stepNo++;
                return (
                    <Fragment key={i}>
                        <div className="flex min-w-[96px] flex-none flex-col items-center gap-1.5 text-center">
                            <span
                                className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] text-xs font-bold',
                                    node.kind === 'approval' && 'border-emerald-500/70 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                    node.kind === 'fulfillment' && 'border-brand/70 bg-brand/10 text-brand',
                                    !isStep && 'border-border bg-muted/40 text-muted-foreground',
                                )}
                            >
                                {node.kind === 'start' ? (
                                    <span className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
                                ) : node.kind === 'end' ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : (
                                    stepNo
                                )}
                            </span>
                            <span className="max-w-[120px] text-xs leading-tight font-semibold">{node.label}</span>
                            {isStep && (
                                <span className="text-muted-foreground text-[11px] leading-none">
                                    {node.kind === 'fulfillment' ? t('wf_fulfillment') : t('wf_approval')}
                                    {showSla && node.sla != null && ` · ${fmtSla(node.sla, lang)}`}
                                </span>
                            )}
                        </div>
                        {i < nodes.length - 1 && <span className="bg-border mt-3.5 h-0.5 min-w-5 flex-1 rounded-full" />}
                    </Fragment>
                );
            })}
        </div>
    );
}
