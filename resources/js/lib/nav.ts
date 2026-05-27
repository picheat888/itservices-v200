import type { NavGroup } from '@/types';
import {
    Box,
    FileText,
    Inbox,
    LayoutDashboard,
    LineChart,
    Mail,
    Settings,
    Shield,
    Ticket,
    Users,
    Warehouse,
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
            { id: 'employees', label: 'employees', to: '/employees', icon: Users, permission: 'employees.view' },
            { id: 'tickets', label: 'tickets', to: '/tickets', icon: Ticket, permission: 'tickets.create' },
            { id: 'requests', label: 'requests', to: '/requests', icon: Inbox, permission: 'requests.submit' },
            { id: 'assets', label: 'assets', to: '/assets', icon: Box, permission: 'assets.view' },
            { id: 'contracts', label: 'contracts', to: '/contracts', icon: FileText, permission: 'contracts.view' },
            { id: 'stock', label: 'stock', to: '/stock', icon: Warehouse, roles: ['super', 'admin'] },
        ],
    },
    {
        label: 'nav_admin',
        items: [
            { id: 'reports', label: 'reports', to: '/reports', icon: LineChart, roles: ['super', 'admin', 'hr'] },
            { id: 'permissions', label: 'permissions', to: '/permissions', icon: Shield, permission: 'system.manage_permissions' },
            { id: 'notifications', label: 'notifications', to: '/email-templates', icon: Mail, permission: 'system.configure_notifications' },
            { id: 'settings', label: 'settings', to: '/settings', icon: Settings, permission: 'system.edit_settings' },
        ],
    },
];
