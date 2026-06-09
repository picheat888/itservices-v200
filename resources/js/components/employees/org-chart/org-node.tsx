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
 * One person card in the org chart. Top handle receives the edge from the
 * manager; bottom handle feeds edges to reports. The report-count pill is the
 * collapse/expand toggle. Single click focuses; double click is reserved for
 * the future per-person Details view.
 */
export function OrgNode({ data }: NodeProps<OrgFlowNode>) {
    const d = data as OrgNodeData;

    return (
        <div
            className={cn(
                'rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
                d.highlighted ? 'border-brand ring-2 ring-brand/40' : 'border-border',
            )}
            style={{ width: NODE_W }}
            onClick={() => d.onFocus(d.id)}
        >
            <Handle type="target" position={Position.Top} className="!bg-border" />

            <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                    <Avatar className="h-10 w-10">
                        {d.photo_url && <AvatarImage src={d.photo_url} alt={d.name} />}
                        <AvatarFallback className="bg-brand/10 text-brand text-xs font-semibold">{initials(d.name)}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-tight">
                        {d.name}
                        {d.name_th && <span className="ml-1 font-normal text-muted-foreground">· {d.name_th}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{d.title ?? '—'}</div>
                </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                    {d.department ?? '—'}
                    {d.level != null && <span className="ml-1 font-mono">· Lv {d.level}</span>}
                </span>
                {d.hasReports && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            d.onToggle(d.id);
                        }}
                        className="ml-2 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand/10 px-2 py-0.5 font-mono font-semibold text-brand hover:bg-brand/20"
                    >
                        {d.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {d.reports_count}
                    </button>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-border" />
        </div>
    );
}
