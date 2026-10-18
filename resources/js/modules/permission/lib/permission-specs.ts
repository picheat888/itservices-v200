// The Role Template cards' permission trees: one copy for the cards, their counts, the draft rebase and the node tests.
// The server holds the same rules in App\Support\Permissions (*Hierarchy() and normalize*()).
import type { CountSpec } from './permission-count';

/** A view switch over its children; `chip: false` hides the "View" tag, `cluster` titles the children, `fillOnGrant` turns them all on with the view. */
export type ViewGroup = {
    view: string;
    children: string[];
    chip?: boolean;
    cluster?: { title: string; hint: string };
    fillOnGrant?: boolean;
};
/** Switches under one heading that hang off the master only. */
export type KeyCluster = { id: string; labelKey: string; keys: string[] };

export const STOCK_TREE: { master: string; groups: ViewGroup[] } = {
    master: 'stock.module',
    groups: [
        { view: 'stock.view_dashboard', children: [] },
        { view: 'stock.view', children: ['stock.manage_items', 'stock.delete', 'stock.receive', 'stock.return', 'stock.transfer'] },
        { view: 'stock.view_request', children: ['stock.request', 'stock.approve', 'stock.fulfill'] },
        { view: 'stock.view_count', children: [], chip: false },
        { view: 'stock.view_events', children: [], chip: false },
    ],
};

export const EMPLOYEE_TREE: { master: string; groups: ViewGroup[] } = {
    master: 'employees.module',
    groups: [
        { view: 'employees.view_dashboard', children: [], chip: false },
        {
            view: 'employees.view',
            children: [
                'employees.add',
                'employees.import',
                'employees.edit',
                'employees.reset_password',
                'employees.resign',
                'employees.cancel_resign',
                'employees.set_credentials',
                'employees.delete',
            ],
        },
        { view: 'employees.view_section', children: ['employees.section_add', 'employees.section_edit', 'employees.section_delete'] },
        { view: 'employees.view_department', children: ['employees.department_add', 'employees.department_edit', 'employees.department_delete'] },
        {
            view: 'employees.view_position',
            children: ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
        },
        { view: 'employees.view_org', children: [], chip: false },
    ],
};

// Each registry's view key gates its tab; its Edit key also covers owners and members.
export const ACCESS_TREE: { master: string; groups: ViewGroup[] } = {
    master: 'access.module',
    groups: [
        { view: 'access.overview', children: [], chip: false },
        { view: 'access.email_view', children: ['access.email_add', 'access.email_edit', 'access.email_delete'] },
        { view: 'access.file_view', children: ['access.file_add', 'access.file_edit', 'access.file_delete'] },
        { view: 'access.social_view', children: ['access.social_add', 'access.social_edit', 'access.social_delete'] },
        { view: 'access.software_view', children: ['access.software_add', 'access.software_edit', 'access.software_delete'] },
    ],
};

export const CONTRACT_TREE: { master: string; groups: ViewGroup[] } = {
    master: 'contracts.module',
    groups: [
        { view: 'contracts.view_dashboard', children: [], chip: false },
        { view: 'contracts.view', children: ['contracts.create', 'contracts.edit', 'contracts.delete'] },
        { view: 'contracts.view_lifecycle', children: ['contracts.cancel', 'contracts.expire', 'contracts.reactivate'], chip: false },
        { view: 'contracts.alerts', children: [], chip: false },
    ],
};

// Returning your own kit is profile.return_assets, on the My Profile card.
export const ASSET_TREE: { master: string; groups: ViewGroup[] } = {
    master: 'assets.module',
    groups: [
        { view: 'assets.view_dashboard', children: [], chip: false },
        { view: 'assets.view', children: ['assets.register', 'assets.edit', 'assets.delete'] },
        { view: 'assets.manage', children: ['assets.transfer', 'assets.receive', 'assets.retire'], chip: false },
        { view: 'assets.special', children: ['assets.force_recall', 'assets.cancel_writeoff'], chip: false },
    ],
};

// Self-service (`create` + its child `edit_own`, and `my`) stands outside the master; levels scope the categories a staff member works.
export const TICKET_TREE: { master: string; groups: ViewGroup[]; levels: string[]; standalone: ViewGroup; solo: string } = {
    master: 'tickets.module',
    groups: [
        { view: 'tickets.view_dashboard', children: [], chip: false },
        { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class'] },
        { view: 'tickets.jobs', children: [], chip: false },
    ],
    levels: [
        'tickets.level_hardware',
        'tickets.level_software',
        'tickets.level_network',
        'tickets.level_cctv',
        'tickets.level_telephone',
        'tickets.level_other',
    ],
    standalone: { view: 'tickets.create', children: ['tickets.edit_own'] },
    solo: 'tickets.my',
};

// Per-type filing keys sit under `submit`; the notify keys hang off the master only.
export const REQUEST_TREE: { master: string; groups: ViewGroup[]; notify: string[] } = {
    master: 'requests.module',
    groups: [
        {
            view: 'requests.submit',
            children: [
                'requests.submit_computer',
                'requests.submit_hardware',
                'requests.submit_mobile',
                'requests.submit_email',
                'requests.submit_social',
                'requests.submit_fileshare',
                'requests.submit_software',
                'requests.submit_recovery',
                'requests.submit_mailgroup',
                'requests.submit_telephone',
                'requests.submit_network',
                'requests.submit_cctv',
                'requests.submit_other',
            ],
            cluster: { title: 'perm_ui_request_types', hint: 'perm_ui_request_types_hint' },
            fillOnGrant: true,
        },
        { view: 'requests.view_all', children: ['requests.cancel_any'] },
        { view: 'requests.complete', children: [] },
    ],
    notify: ['requests.notify_approved', 'requests.notify_stalled'],
};

// The one right, under a heading naming the thing it is done to (no switch on the heading).
export const WORKFLOW_TREE: { master: string; group: Omit<KeyCluster, 'id'> } = {
    master: 'workflows.module',
    group: { labelKey: 'perm_ui_group_workflows', keys: ['workflows.manage'] },
};

// The page's Email and Notification tabs; edit and toggle stay separate keys (the controllers enforce the split). Logs stands alone.
export const NOTIFICATION_TREE: { master: string; groups: KeyCluster[]; logs: string } = {
    master: 'notifications.module',
    groups: [
        {
            id: 'email',
            labelKey: 'perm_ui_group_email',
            keys: ['notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test'],
        },
        {
            id: 'inapp',
            labelKey: 'perm_ui_group_inapp',
            keys: ['notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test'],
        },
    ],
    logs: 'notifications.logs',
};

export const REPORT_TREE: { master: string; groups: KeyCluster[] } = {
    master: 'reports.module',
    groups: [
        {
            id: 'domains',
            labelKey: 'perm_ui_group_report_domains',
            keys: [
                'reports.tickets',
                'reports.assets',
                'reports.contracts',
                'reports.stock',
                'reports.requests',
                'reports.employees',
                'reports.access',
            ],
        },
        { id: 'tools', labelKey: 'perm_ui_group_report_tools', keys: ['reports.export', 'reports.schedule'] },
    ],
};

export const STOCK_COUNT: CountSpec = { master: STOCK_TREE.master, groups: STOCK_TREE.groups };
export const EMPLOYEE_COUNT: CountSpec = { master: EMPLOYEE_TREE.master, groups: EMPLOYEE_TREE.groups };
export const ACCESS_COUNT: CountSpec = { master: ACCESS_TREE.master, groups: ACCESS_TREE.groups };
export const CONTRACT_COUNT: CountSpec = { master: CONTRACT_TREE.master, groups: CONTRACT_TREE.groups };
export const ASSET_COUNT: CountSpec = { master: ASSET_TREE.master, groups: ASSET_TREE.groups };
export const TICKET_COUNT: CountSpec = {
    master: TICKET_TREE.master,
    groups: TICKET_TREE.groups,
    gated: TICKET_TREE.levels,
    standalone: [TICKET_TREE.standalone],
    free: [TICKET_TREE.solo],
};
export const REQUEST_COUNT: CountSpec = { master: REQUEST_TREE.master, groups: REQUEST_TREE.groups, gated: REQUEST_TREE.notify };
export const WORKFLOW_COUNT: CountSpec = { master: WORKFLOW_TREE.master, gated: WORKFLOW_TREE.group.keys };
export const NOTIFICATION_COUNT: CountSpec = {
    master: NOTIFICATION_TREE.master,
    gated: [...NOTIFICATION_TREE.groups.flatMap((g) => g.keys), NOTIFICATION_TREE.logs],
};
export const REPORT_COUNT: CountSpec = { master: REPORT_TREE.master, gated: REPORT_TREE.groups.flatMap((g) => g.keys) };

/** Cards drawn by their own tree component, by catalogue module, with the spec they count with. */
export const TREE_COUNT: Record<string, CountSpec> = {
    stock: STOCK_COUNT,
    employees: EMPLOYEE_COUNT,
    contracts: CONTRACT_COUNT,
    assets: ASSET_COUNT,
    tickets: TICKET_COUNT,
    workflows: WORKFLOW_COUNT,
    requests: REQUEST_COUNT,
    notifications: NOTIFICATION_COUNT,
    reports: REPORT_COUNT,
    access: ACCESS_COUNT,
};

/** `key`: one permission key gates the card (cascade); `select-all`: a bulk toggle over independent children. */
export type ModuleMaster = { mode: 'key'; key: string } | { mode: 'select-all' };

// Administration modules drawn as the Stock-style card with a master switch (server: Permissions::SYSTEM_MASTER, SETTINGS_MASTER)
export const FLAT_CARD_META: Record<string, { subtitleKey: string; master: ModuleMaster }> = {
    permissions: {
        subtitleKey: 'perm_ui_permissions_card_sub',
        master: { mode: 'key', key: 'system.manage_permissions' },
    },
    settings: {
        subtitleKey: 'perm_ui_settings_card_sub',
        master: { mode: 'key', key: 'settings.access' },
    },
};

/** A flat card's count spec; only live keys count. */
export function moduleCardSpec(keys: string[], master: ModuleMaster): CountSpec {
    return master.mode === 'key' ? { master: master.key, gated: keys.filter((k) => k !== master.key) } : { free: keys };
}

/** The count spec a card is drawn with; flat cards count live keys only. */
export function cardSpec(group: { module: string; keys: string[] }): { spec: CountSpec; liveOnly: boolean } {
    const tree = TREE_COUNT[group.module];
    if (tree) return { spec: tree, liveOnly: false };
    if (group.module === 'profile') return { spec: { free: group.keys }, liveOnly: false };
    const meta = FLAT_CARD_META[group.module];
    return { spec: meta ? moduleCardSpec(group.keys, meta.master) : { free: group.keys }, liveOnly: true };
}
