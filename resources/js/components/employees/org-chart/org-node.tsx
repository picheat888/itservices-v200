import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OrgFlowNode, OrgNodeData } from '@/lib/org-tree';
import { NODE_W } from '@/lib/org-tree';
import { cn } from '@/lib/utils';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Initials fallback when an employee has no photo. */
function initials(name: string): string {
    return name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/**
 * One person card in the org chart, styled to the approved design: a
 * department-coloured accent bar + avatar, name/title, and a foot row with the
 * department code pill and either a "{n} ↳" report count or an "IC" badge for
 * individual contributors. Managers get a floating +/– collapse toggle. Handles
 * follow the chart direction so connectors enter/leave the right edges.
 */
export function OrgNode({ data }: NodeProps<OrgFlowNode>) {
    const d = data as OrgNodeData;
    const vertical = d.dir === 'TB';
    const targetPos = vertical ? Position.Top : Position.Left;
    const sourcePos = vertical ? Position.Bottom : Position.Right;

    return (
        <div
            className={cn(
                'relative cursor-pointer overflow-hidden rounded-[13px] border bg-card pt-[13px] pr-[15px] pb-3 pl-[18px] shadow-md transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
                d.selected ? 'border-brand ring-[3px] ring-brand/20' : 'border-border',
                d.isRoot && !d.selected && 'shadow-lg ring-1 ring-input',
                d.dimmed && 'opacity-30 saturate-[.55]',
            )}
            style={{ width: NODE_W }}
            onClick={() => d.onFocus(d.id)}
        >
            <Handle type="target" position={targetPos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />

            {/* Department accent bar — parent's overflow-hidden clips it to the card's rounded corners */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ backgroundColor: d.color }} />

            <div className="flex items-center gap-[11px]">
                <Avatar className="h-[38px] w-[38px] shrink-0 ring-2 ring-inset ring-white/20" style={{ backgroundColor: d.color }}>
                    {d.photo_url && <AvatarImage src={d.photo_url} alt={d.name} />}
                    <AvatarFallback className="bg-transparent text-[13px] font-bold text-white">{initials(d.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className={cn('truncate font-bold leading-tight tracking-tight text-foreground', d.isRoot ? 'text-[15px]' : 'text-sm')}>
                        {d.name}
                        {d.name_th && <span className="ml-1 font-normal text-muted-foreground">· {d.name_th}</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{d.title ?? '—'}</div>
                </div>
            </div>

            <div className="mt-[11px] flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span
                        title={d.department ?? undefined}
                        className="shrink-0 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide"
                        style={{
                            color: d.color,
                            backgroundColor: `color-mix(in oklch, ${d.color} 14%, var(--card))`,
                        }}
                    >
                        {d.department_code ?? d.department ?? '—'}
                    </span>
                    {d.level != null && <span className="shrink-0 font-mono text-[10.5px] font-medium text-muted-foreground">Lv {d.level}</span>}
                </div>
                {d.hasReports && (
                    <button
                        type="button"
                        title={d.collapsed ? 'Expand' : 'Collapse'}
                        onClick={(e) => {
                            e.stopPropagation();
                            d.onToggle(d.id);
                        }}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand transition-colors hover:bg-brand/20"
                    >
                        {d.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {d.reports_count}
                    </button>
                )}
            </div>

            <Handle type="source" position={sourcePos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />
        </div>
    );
}
