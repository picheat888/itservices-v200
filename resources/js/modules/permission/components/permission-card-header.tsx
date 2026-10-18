import { formatNumber } from '@/shared/lib/number';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import {
    Box,
    FileText,
    Inbox,
    LayoutDashboard,
    LineChart,
    type LucideIcon,
    Mail,
    MonitorCog,
    Settings,
    Shield,
    UserRound,
    Users,
    Warehouse,
    Workflow,
    Wrench,
} from 'lucide-react';
import { moduleLabel } from '../lib/permission-labels';

/** The same icon the sidebar gives each module, keyed by the ids the matrix renders. */
const MODULE_ICON: Record<string, LucideIcon> = {
    dashboard: LayoutDashboard,
    tickets: Wrench,
    requests: Inbox,
    assets: Box,
    contracts: FileText,
    stock: Warehouse,
    employees: Users,
    access: MonitorCog,
    workflows: Workflow,
    permissions: Shield,
    notifications: Mail,
    reports: LineChart,
    settings: Settings,
    profile: UserRound,
};

/** Header strip of every permission card: module identity left, granted count right (orange while unsaved). */
export function PermissionCardHeader({
    headingId,
    module,
    on,
    total,
    changed,
    lang,
}: {
    headingId?: string;
    module: string;
    on: number;
    total: number;
    changed?: boolean;
    lang: Lang;
}) {
    const Icon = MODULE_ICON[module];

    return (
        <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between gap-2 rounded-t-[inherit] border-b px-3.5 py-2.5')}>
            <h3 id={headingId} className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{moduleLabel(module, lang)}</span>
            </h3>
            <span
                className={cn(
                    'shrink-0 text-xs font-bold tabular-nums',
                    changed ? 'text-orange-700 dark:text-orange-400' : on === 0 ? 'text-muted-foreground' : 'text-brand',
                )}
            >
                {formatNumber(on, lang)}/{formatNumber(total, lang)}
            </span>
        </div>
    );
}
