import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { WorkflowStep } from '@/shared/types';
import { Check, Flag } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

/**
 * Horizontal approval chain: Submitted → each step (approvals numbered, the IT step a flag) → Closed.
 * Shared by the Workflow cards and dialogs and the New Request route panel; it carries no timing.
 */
export function WorkflowStrip({ steps }: { steps: Pick<WorkflowStep, 'label' | 'kind'>[] }) {
    const t = useT();
    const scroller = useRef<HTMLDivElement>(null);
    // Focusable only when it overflows, so the keyboard can scroll it
    const [overflows, setOverflows] = useState(false);

    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [steps.length]);

    const nodes: { label: string; kind: 'start' | 'end' | WorkflowStep['kind'] }[] = [
        { label: t('wf_submitted'), kind: 'start' },
        ...steps.map((s) => ({ label: s.label, kind: s.kind })),
        { label: t('wf_closed'), kind: 'end' },
    ];

    let stepNo = 0;
    return (
        <div
            ref={scroller}
            className="flex items-stretch overflow-x-auto pb-1"
            {...(overflows ? { tabIndex: 0, role: 'region', 'aria-label': t('req_route_title') } : {})}
        >
            {nodes.map((node, i) => {
                const isStep = node.kind === 'approval' || node.kind === 'completion';
                if (node.kind === 'approval') stepNo++;
                return (
                    <Fragment key={i}>
                        <div className="flex min-w-[96px] flex-none flex-col items-center gap-1.5 text-center">
                            <span
                                className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] text-xs font-bold',
                                    node.kind === 'approval' && 'border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                    node.kind === 'completion' && 'border-brand/70 bg-brand/10 text-brand',
                                    !isStep && 'border-border bg-muted/40 text-muted-foreground',
                                )}
                            >
                                {node.kind === 'start' ? (
                                    <span className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
                                ) : node.kind === 'end' ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : node.kind === 'completion' ? (
                                    <Flag className="h-3.5 w-3.5" />
                                ) : (
                                    stepNo
                                )}
                            </span>
                            <span className="max-w-[120px] text-xs leading-tight font-semibold">{node.label}</span>
                            {isStep && (
                                <span className="text-muted-foreground text-[11px] leading-none">
                                    {node.kind === 'completion' ? t('wf_completion') : t('wf_approval')}
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
