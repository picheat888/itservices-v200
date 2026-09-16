import { useT } from '@/lang';
import { initials } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { OrgFlowNode, OrgNodeData } from '../../lib/org-tree';
import { NODE_W } from '../../lib/org-tree';

/**
 * One person card in the org chart: a department-coloured accent bar + large
 * avatar on the left, then four stacked lines — name, position, section,
 * department. The department code pill sits top-right and the collapse toggle
 * (report count) bottom-right, so both corners stay clear of the text. Handles
 * follow the chart direction so connectors enter/leave the right edges.
 */
export function OrgNode({ data }: NodeProps<OrgFlowNode>) {
    const t = useT();
    const d = data as OrgNodeData;
    const vertical = d.dir === 'TB';
    const targetPos = vertical ? Position.Top : Position.Left;
    const sourcePos = vertical ? Position.Bottom : Position.Right;

    return (
        <div
            className={cn(
                'bg-card relative cursor-pointer overflow-hidden rounded-[15px] border py-[13px] pr-3 pl-[18px] shadow-md transition-all duration-150 hover:-translate-y-px hover:shadow-lg',
                d.selected ? 'border-brand ring-brand/20 ring-[3px]' : 'border-border',
                d.isRoot && !d.selected && 'ring-input shadow-lg ring-1',
                d.dimmed && 'opacity-30 saturate-[.55]',
            )}
            style={{ width: NODE_W }}
            onClick={() => d.onFocus(d.id)}
        >
            <Handle type="target" position={targetPos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />

            {/* Department accent bar — parent's overflow-hidden clips it to the card's rounded corners */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-[10px]" style={{ backgroundColor: d.color }} />

            <div className="flex items-center gap-[13px]">
                <Avatar className="h-[56px] w-[56px] shrink-0 ring-2 ring-white/20 ring-inset" style={{ backgroundColor: d.color }}>
                    {d.photo_url && <AvatarImage src={d.photo_url} alt={d.name} />}
                    <AvatarFallback className="bg-transparent text-[17px] font-bold text-white">{initials(d.name)}</AvatarFallback>
                </Avatar>

                {/* Name · position · section · department — the reading order of the approved card */}
                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            'text-foreground truncate pr-9 leading-snug font-bold tracking-tight',
                            d.isRoot ? 'text-[16px]' : 'text-[14.5px]',
                        )}
                    >
                        {d.name}
                        {d.name_th && <span className="text-muted-foreground ml-1 font-normal">· {d.name_th}</span>}
                    </div>
                    <div className="text-muted-foreground truncate text-[12px] leading-[17px]" title={d.title ?? undefined}>
                        {d.title ?? '—'}
                    </div>
                    <div
                        className="text-foreground/85 truncate text-[12px] leading-[17px]"
                        title={d.section ? `${t('org_card_section')}: ${d.section}` : undefined}
                    >
                        {d.section ?? '—'}
                    </div>
                    <div
                        className={cn('text-foreground/85 truncate text-[12px] leading-[17px]', d.hasReports && 'pr-9')}
                        title={d.department ? `${t('org_card_department')}: ${d.department}` : undefined}
                    >
                        {d.department ?? '—'}
                    </div>
                </div>
            </div>

            <span
                title={d.department ?? undefined}
                className="absolute top-[11px] right-[11px] rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide"
                style={{
                    color: d.color,
                    backgroundColor: `color-mix(in oklch, ${d.color} 14%, var(--card))`,
                }}
            >
                {d.department_code ?? d.department ?? '—'}
            </span>

            {d.hasReports && (
                <button
                    type="button"
                    title={d.collapsed ? 'Expand' : 'Collapse'}
                    onClick={(e) => {
                        e.stopPropagation();
                        d.onToggle(d.id);
                    }}
                    className="bg-brand/10 text-brand hover:bg-brand/20 absolute right-[11px] bottom-[11px] inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors"
                >
                    {d.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {d.reports_count}
                </button>
            )}

            <Handle type="source" position={sourcePos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />
        </div>
    );
}
