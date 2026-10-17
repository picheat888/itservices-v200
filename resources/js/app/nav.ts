import type { NavGroup, NavItem } from '@/shared/types';
import {
    Box,
    FileText,
    Inbox,
    LayoutDashboard,
    LineChart,
    Mail,
    MonitorCog,
    Settings,
    Shield,
    Users,
    Warehouse,
    Workflow,
    Wrench,
} from 'lucide-react';

// Nav definition. `label` holds an i18n key resolved at render time.
export const navGroups: NavGroup[] = [
    {
        label: 'nav_overview',
        items: [{ id: 'overall', label: 'overall', to: '/', icon: LayoutDashboard }],
    },
    {
        label: 'nav_workspace',
        items: [
            { id: 'employees', label: 'employees', to: '/employees', icon: Users, permission: 'employees.module' },
            // Staff enter via the module master; ordinary employees via the self-service keys.
            { id: 'tickets', label: 'tickets', to: '/tickets', icon: Wrench, anyOf: ['tickets.module', 'tickets.create', 'tickets.my'] },
            { id: 'requests', label: 'requests', to: '/requests', icon: Inbox, anyOf: ['requests.module'] },
            { id: 'access', label: 'access_title', to: '/access', icon: MonitorCog, permission: 'access.module' },
            { id: 'assets', label: 'assets', to: '/assets', icon: Box, permission: 'assets.module' },
            { id: 'contracts', label: 'contracts', to: '/contracts', icon: FileText, permission: 'contracts.module' },
            { id: 'stock', label: 'stock', to: '/stock', icon: Warehouse, permission: 'stock.module' },
        ],
    },
    {
        label: 'nav_admin',
        items: [
            // Kept on one line: SidebarRouteGateTest reads each entry with a single-line regex.
            { id: 'reports', label: 'reports', to: '/reports', icon: LineChart, permission: 'reports.module' },
            { id: 'workflows', label: 'wf_title', to: '/workflows', icon: Workflow, permission: 'workflows.module' },
            { id: 'permissions', label: 'permissions', to: '/permissions', icon: Shield, permission: 'system.manage_permissions' },
            { id: 'notifications', label: 'notifications', to: '/email-notifications', icon: Mail, permission: 'notifications.module' },
            { id: 'settings', label: 'settings', to: '/settings', icon: Settings, permission: 'settings.access' },
        ],
    },
];

/**
 * The menu entry a path belongs to: its own entry, or — for a page below one, such as
 * /reports/tickets-overview — the entry it sits under. '/' only ever matches itself,
 * otherwise every page would claim to be the Dashboard.
 */
export function findNavItem(pathname: string): NavItem | undefined {
    const items = navGroups.flatMap((g) => g.items);
    return items.find((i) => i.to === pathname) ?? items.find((i) => i.to !== '/' && pathname.startsWith(`${i.to}/`));
}
