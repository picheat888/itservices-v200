import type { Lang } from '@/shared/types';
import { translate } from '@/lang';

// Module + action display labels now live in lang/<locale>/permissions.ts
// (keys perm_mod_<module> / perm_act_<module>.<action>). These helpers resolve
// them and fall back to the raw key/action when a label is absent.
export const moduleLabel = (key: string, lang: Lang) => {
    const k = `perm_mod_${key}`;
    const v = translate(lang, k);
    return v === k ? key : v;
};
export const actionLabel = (module: string, action: string, lang: Lang) => {
    const k = `perm_act_${module}.${action}`;
    const v = translate(lang, k);
    return v === k ? action : v;
};

/** Optional extra info shown behind an (i) icon; '' when the permission has no description. */
export const actionDescription = (module: string, action: string, lang: Lang) => {
    const k = `perm_desc_${module}.${action}`;
    const v = translate(lang, k);
    return v === k ? '' : v;
};

// Permission keys whose enforcement is actually live today. Everything else is
// shown with a "(Coming soon)" tag in the matrix (toggle still persists).
const LIVE = new Set<string>([
    'tickets.view_all',
    'tickets.create',
    'tickets.assign',
    'tickets.resolve',
    'tickets.delete',
    'assets.view',
    'assets.register',
    'assets.transfer',
    'assets.receive',
    'assets.retire',
    'assets.edit',
    'assets.my',
    'contracts.module',
    'contracts.view_dashboard',
    'contracts.view',
    'contracts.view_lifecycle',
    'contracts.create',
    'contracts.edit',
    'contracts.delete',
    'contracts.import',
    'contracts.alerts',
    'contracts.cancel',
    'contracts.expire',
    'contracts.reactivate',
    'stock.module',
    'stock.view_dashboard',
    'stock.view',
    'stock.view_request',
    'stock.view_count',
    'stock.view_events',
    'stock.manage_items',
    'stock.receive',
    'stock.return',
    'stock.transfer',
    'stock.request',
    'stock.approve',
    'stock.fulfill',
    'employees.view',
    'employees.add',
    'employees.import',
    'employees.edit',
    'employees.edit_own',
    'employees.reset_password',
    'employees.resign',
    'employees.cancel_resign',
    'employees.set_credentials',
    'employees.module',
    'employees.view_dashboard',
    'employees.view_section',
    'employees.section_add',
    'employees.section_edit',
    'employees.section_delete',
    'employees.view_department',
    'employees.department_add',
    'employees.department_edit',
    'employees.department_delete',
    'employees.view_position',
    'employees.position_add',
    'employees.position_edit',
    'employees.position_delete',
    'employees.position_special',
    'employees.view_org',
    'system.manage_permissions',
    'system.manage_roles',
    'system.manage_groups',
    'system.view_audit',
    'settings.access',
    'settings.company',
    'settings.system',
    'settings.masterdata',
    'settings.email',
    'settings.sla',
    'settings.assets',
    'settings.security',
]);

export const isLivePermission = (key: string) => LIVE.has(key);
