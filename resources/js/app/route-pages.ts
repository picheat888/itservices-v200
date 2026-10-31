// Menu path → its lazy page, so the sidebar can start a page's download on hover, focus or tap.
import { AccessControlPage } from '@/modules/access';
import { AssetsPage } from '@/modules/asset';
import { ContractsPage } from '@/modules/contract';
import { DashboardPage } from '@/modules/dashboard';
import { EmailTemplatesPage } from '@/modules/email-templates';
import { EmployeesPage } from '@/modules/employee';
import { PermissionsPage } from '@/modules/permission';
import { ReportsPage } from '@/modules/report';
import { RequestsPage } from '@/modules/request';
import { SettingsPage } from '@/modules/settings';
import { StockPage } from '@/modules/stock';
import { TicketsPage } from '@/modules/ticket';
import { WorkflowsPage } from '@/modules/workflow';
import type { LazyPage } from '@/shared/lib/lazy-page';

export const NAV_PAGES: Record<string, LazyPage> = {
    '/': DashboardPage,
    '/employees': EmployeesPage,
    '/tickets': TicketsPage,
    '/requests': RequestsPage,
    '/access': AccessControlPage,
    '/assets': AssetsPage,
    '/contracts': ContractsPage,
    '/stock': StockPage,
    '/reports': ReportsPage,
    '/workflows': WorkflowsPage,
    '/permissions': PermissionsPage,
    '/email-notifications': EmailTemplatesPage,
    '/settings': SettingsPage,
};

export function preloadNavPage(to: string): void {
    NAV_PAGES[to]?.preload();
}
