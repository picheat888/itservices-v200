import { useT } from '@/lang';
import { initials } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { useUiStore } from '@/stores/ui';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { OrgFlowNode, OrgNodeData } from '../../lib/org-tree';
import { deptFill, deptInk, NODE_W } from '../../lib/org-tree';

/** One person card in the org chart: department bar + avatar, four text lines, code chip and collapse toggle. */
export function OrgNode({ data }: NodeProps<OrgFlowNode>) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const d = data as OrgNodeData;
    const vertical = d.dir === 'TB';
    const targetPos = vertical ? Position.Top : Position.Left;
    const sourcePos = vertical ? Position.Bottom : Position.Right;
    const primaryName = lang === 'th' ? (d.name_th ?? d.name) : d.name;
    const secondaryName = lang === 'th' ? (d.name_th ? d.name : null) : d.name_th;
    const ink = deptInk(d.department_code);
    const branchLabel = t(d.collapsed ? 'org_expand_branch' : 'org_collapse_branch').replace('{n}', String(d.reports_count));

    return (
        <div
            className={cn(
                'bg-card relative cursor-pointer overflow-hidden rounded-[15px] border py-[13px] pr-3 pl-[18px] shadow-md transition-[translate,box-shadow,opacity,filter] duration-150 hover:-translate-y-px hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                d.selected ? 'border-brand ring-brand/20 ring-[3px]' : 'border-border',
                d.isRoot && !d.selected && 'ring-input shadow-lg ring-1',
                d.dimmed && 'opacity-30 saturate-[.55]',
            )}
            style={{ width: NODE_W }}
        >
            <Handle type="target" position={targetPos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />

            {/* Department accent bar */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-[10px]" style={{ backgroundColor: d.color }} />

            <div className="flex items-center gap-[13px]">
                <Avatar
                    className="h-[56px] w-[56px] shrink-0 ring-2 ring-white/20 ring-inset"
                    style={{ backgroundColor: deptFill(d.department_code) }}
                >
                    {d.photo_url && <AvatarImage src={d.photo_url} alt={d.name} />}
                    <AvatarFallback className="bg-transparent text-[17px] font-bold text-white">{initials(d.name)}</AvatarFallback>
                </Avatar>

                {/* Name, position, section, department */}
                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            'text-foreground truncate pr-9 leading-snug font-bold tracking-tight',
                            d.isRoot ? 'text-[16px]' : 'text-[14.5px]',
                        )}
                    >
                        {primaryName}
                        {secondaryName && <span className="text-muted-foreground ml-2 font-normal">{secondaryName}</span>}
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
                className="absolute top-[11px] right-[11px] rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--dept-ink)] dark:text-[var(--dept-ink-dark)]"
                style={
                    {
                        '--dept-ink': ink.light,
                        '--dept-ink-dark': ink.dark,
                        backgroundColor: `color-mix(in oklch, ${d.color} 14%, var(--card))`,
                    } as CSSProperties
                }
            >
                {d.department_code ?? d.department ?? '—'}
            </span>

            {d.hasReports && (
                <button
                    type="button"
                    title={branchLabel}
                    aria-label={branchLabel}
                    aria-expanded={!d.collapsed}
                    onClick={(e) => {
                        e.stopPropagation();
                        d.onToggle(d.id);
                    }}
                    className="nokey bg-brand/10 text-brand-ink hover:bg-brand/20 focus-visible:ring-brand absolute right-[11px] bottom-[11px] inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                    {d.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {d.reports_count}
                </button>
            )}

            <Handle type="source" position={sourcePos} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />
        </div>
    );
}
