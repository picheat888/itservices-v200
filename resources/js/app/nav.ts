import type { NavGroup } from '@/shared/types';
import { Box, FileText, Inbox, KeyRound, LayoutDashboard, LineChart, Mail, PackageCheck, Settings, Shield, Ticket, Users, Warehouse } from 'lucide-react';

// Nav definition. `label` holds an i18n key resolved at render time.
export const navGroups: NavGroup[] = [
    {
        label: 'nav_overview',
        items: [
            { id: 'overall', label: 'overall', to: '/', icon: LayoutDashboard },
            // Employee self-service — gated by the My Assets permission.
            { id: 'my-assets', label: 'my_assets', to: '/my-assets', icon: PackageCheck, permission: 'assets.my' },
        ],
    },
    {
        label: 'nav_workspace',
        items: [
            { id: 'employees', label: 'employees', to: '/employees', icon: Users, permission: 'employees.module' },
            { id: 'access', label: 'access_title', to: '/access', icon: KeyRound, permission: 'access.module' },
            { id: 'tickets', label: 'tickets', to: '/tickets', icon: Ticket, permission: 'tickets.create' },
            { id: 'requests', label: 'requests', to: '/requests', icon: Inbox, permission: 'requests.submit' },
            { id: 'assets', label: 'assets', to: '/assets', icon: Box, permission: 'assets.module' },
            { id: 'contracts', label: 'contracts', to: '/contracts', icon: FileText, permission: 'contracts.module' },
            { id: 'stock', label: 'stock', to: '/stock', icon: Warehouse, permission: 'stock.module' },
        ],
    },
    {
        label: 'nav_admin',
        items: [
            { id: 'reports', label: 'reports', to: '/reports', icon: LineChart, roles: ['super', 'admin', 'hr'] },
            { id: 'permissions', label: 'permissions', to: '/permissions', icon: Shield, permission: 'system.manage_permissions' },
            { id: 'notifications', label: 'notifications', to: '/email-templates', icon: Mail, permission: 'system.configure_notifications' },
            { id: 'settings', label: 'settings', to: '/settings', icon: Settings, permission: 'settings.access' },
        ],
    },
];
