import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import {
    Box,
    FileText,
    Inbox,
    LineChart,
    type LucideIcon,
    Mail,
    MonitorCog,
    Settings,
    Shield,
    Users,
    Warehouse,
    Workflow,
    Wrench,
} from 'lucide-react';
import { moduleLabel } from '../lib/permission-labels';

/**
 * The same icon the sidebar gives each module, so a card and the menu entry it governs are
 * recognisably the same thing. Keys match the module ids the matrix renders — the four
 * Administration cards included, which map to sidebar entries rather than permission modules.
 */
const MODULE_ICON: Record<string, LucideIcon> = {
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
};

/**
 * Header strip shared by every permission card: module identity on the left, how many of its
 * keys are granted on the right.
 *
 * The icon stays muted even when the module is granted. The counter already carries that
 * state (it turns brand-coloured above zero), and a second signal for the same fact would
 * make the card louder without saying anything new — the icon is identity, not status.
 */
export function PermissionCardHeader({ module, on, total, lang }: { module: string; on: number; total: number; lang: Lang }) {
    const Icon = MODULE_ICON[module];

    return (
        <div className="border-border flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{moduleLabel(module, lang)}</span>
            </span>
            <span className={cn('shrink-0 font-mono text-[10.5px] font-bold', on === 0 ? 'text-muted-foreground' : 'text-brand')}>
                {on}/{total}
            </span>
        </div>
    );
}
