<?php

namespace App\Support;

use App\Enums\Ticket\TicketCategory;
use App\Models\User;

/**
 * Central catalog of RBAC permissions (module => action keys) and the default
 * grant set per role. Super Admin bypasses checks (always allowed).
 */
class Permissions
{
    /**
     * @return array<string, list<string>>
     */
    public static function catalog(): array
    {
        return [
            'tickets' => [
                'module',
                'view_dashboard', 'view_all',
                'resolve', 'forward', 'assign', 'set_work_class',
                'level_hardware', 'level_software', 'level_network', 'level_cctv', 'level_telephone', 'level_other',
                'create', 'edit_own',
                'my', 'jobs',
            ],
            // notify_* gate who HEARS about a request, separately from who may act on it:
            // the completion queue is a rota, and the people who want the mail about a
            // stalled approval are not always the ones allowed to close it.
            // `module` opens the screen and its sidebar entry, like every other module.
            // Before it existed the page was gated on "holds any of submit/view_all/complete",
            // which meant there was no single switch to hand somebody the module — and the
            // permission card had no master row to hang the rest off.
            'requests' => ['module', 'submit', 'view_all', 'complete', 'notify_approved', 'notify_stalled'],
            // Reads like every other module: the master opens the screen and its sidebar
            // entry, `manage` is the right to change a chain. Before the master existed,
            // "may look at the approval chains" and "may rewrite them" were one switch.
            'workflows' => ['module', 'manage'],
            'assets' => [
                'module',
                'view_dashboard', 'view', 'register', 'edit', 'delete',
                'manage', 'transfer', 'receive', 'retire',
                'special', 'force_recall', 'cancel_writeoff',
                'my', 'return',
            ],
            'contracts' => [
                'module',
                'view_dashboard', 'view', 'view_lifecycle',
                'create', 'edit', 'delete', 'import',
                'cancel', 'expire', 'reactivate',
                'alerts',
            ],
            'stock' => [
                'module',
                'view_dashboard', 'view', 'view_request', 'view_count', 'view_events',
                'manage_items', 'receive', 'return', 'transfer',
                'request', 'approve', 'fulfill',
            ],
            'employees' => [
                'module',
                'view_dashboard', 'view', 'view_section', 'view_department', 'view_position', 'view_org',
                'add', 'import', 'edit', 'reset_password', 'resign', 'cancel_resign', 'set_credentials', 'delete',
                'section_add', 'section_edit', 'section_delete',
                'department_add', 'department_edit', 'department_delete',
                'position_add', 'position_edit', 'position_delete', 'position_special',
                'edit_own',
            ],
            'access' => [
                'module',
                'overview',
                // Self-service: what THIS person may reach. Master-independent, like assets.my.
                'my',
                'email_view', 'email_add', 'email_edit', 'email_delete',
                'file_view', 'file_add', 'file_edit', 'file_delete',
                'social_view', 'social_add', 'social_edit', 'social_delete',
                'software_view', 'software_add', 'software_edit', 'software_delete',
            ],
            'system' => ['manage_permissions', 'manage_roles', 'manage_groups', 'view_audit'],
            // Email & Notification. Was the single key system.configure_notifications until the
            // page grew a second tab and a delivery log worth handing out apart from the
            // wording — see notificationHierarchy().
            'notifications' => [
                'module',
                'email_edit', 'email_toggle', 'email_test',
                'inapp_edit', 'inapp_toggle', 'inapp_test',
                'logs',
            ],
            'settings' => ['access', 'company', 'system', 'masterdata', 'email', 'sla', 'requestdata', 'assets', 'security'],
        ];
    }

    /**
     * Flat list of all permission keys (e.g. "tickets.create").
     *
     * @return list<string>
     */
    public static function all(): array
    {
        $keys = [];
        foreach (self::catalog() as $module => $actions) {
            foreach ($actions as $action) {
                $keys[] = "{$module}.{$action}";
            }
        }

        return $keys;
    }

    /**
     * Ticket categories the user is allowed to pick up, from their tickets.level_* grants.
     * Shared by the ticket list ("jobs" scope) and the sidebar badge so both offer the
     * same cases.
     *
     * @return list<string>
     */
    public static function ticketLevelsFor(?User $user): array
    {
        return array_values(array_filter(
            array_column(TicketCategory::cases(), 'value'),
            fn (string $category) => (bool) $user?->hasPermission("tickets.level_{$category}"),
        ));
    }

    /**
     * Default permission grants per Role Template (super omitted = all) — the templates
     * as the company set them up on 2026-09-26. DatabaseSeeder writes them with
     * firstOrCreate, so a change here reaches fresh installs, never an existing one.
     *
     * @return array<string, list<string>>
     */
    public static function defaults(): array
    {
        return [
            // IT Support — day-to-day tickets, requests, assets and access
            'admin' => [
                'access.email_add', 'access.email_edit', 'access.email_view', 'access.file_add', 'access.file_edit', 'access.file_view', 'access.module', 'access.my', 'access.overview', 'access.social_add', 'access.social_edit', 'access.social_view', 'access.software_add', 'access.software_edit', 'access.software_view',
                'assets.edit', 'assets.manage', 'assets.module', 'assets.my', 'assets.receive', 'assets.register', 'assets.return', 'assets.transfer', 'assets.view', 'assets.view_dashboard',
                'contracts.alerts', 'contracts.module', 'contracts.view', 'contracts.view_dashboard',
                'employees.add', 'employees.edit', 'employees.module', 'employees.reset_password', 'employees.set_credentials', 'employees.view', 'employees.view_dashboard', 'employees.view_department', 'employees.view_org', 'employees.view_position', 'employees.view_section',
                'requests.complete', 'requests.module', 'requests.notify_approved', 'requests.notify_stalled', 'requests.submit', 'requests.view_all',
                'settings.access', 'settings.requestdata',
                'stock.module', 'stock.request', 'stock.view', 'stock.view_dashboard', 'stock.view_request',
                'tickets.create', 'tickets.edit_own', 'tickets.forward', 'tickets.jobs', 'tickets.level_cctv', 'tickets.level_hardware', 'tickets.level_network', 'tickets.level_other', 'tickets.level_software', 'tickets.level_telephone', 'tickets.module', 'tickets.my', 'tickets.resolve', 'tickets.set_work_class', 'tickets.view_all', 'tickets.view_dashboard',
            ],
            // HR Recruit — the employee register, plus self-service
            'hr' => [
                'access.my',
                'assets.my', 'assets.return',
                'employees.add', 'employees.edit', 'employees.module', 'employees.resign', 'employees.view', 'employees.view_dashboard', 'employees.view_department', 'employees.view_org', 'employees.view_position', 'employees.view_section',
                'requests.module', 'requests.submit',
                'tickets.create', 'tickets.edit_own', 'tickets.my',
            ],
            // Staff — self-service only
            'user' => [
                'access.my',
                'assets.my', 'assets.return',
                'requests.module', 'requests.submit',
                'tickets.create', 'tickets.edit_own', 'tickets.my',
            ],
            // IT Supervisor/Leader — everything IT runs, including permissions and settings
            'it_supervisorleader' => [
                'access.email_add', 'access.email_delete', 'access.email_edit', 'access.email_view', 'access.file_add', 'access.file_delete', 'access.file_edit', 'access.file_view', 'access.module', 'access.my', 'access.overview', 'access.social_add', 'access.social_delete', 'access.social_edit', 'access.social_view', 'access.software_add', 'access.software_delete', 'access.software_edit', 'access.software_view',
                'assets.cancel_writeoff', 'assets.delete', 'assets.edit', 'assets.force_recall', 'assets.manage', 'assets.module', 'assets.my', 'assets.receive', 'assets.register', 'assets.retire', 'assets.return', 'assets.special', 'assets.transfer', 'assets.view', 'assets.view_dashboard',
                'contracts.alerts', 'contracts.cancel', 'contracts.create', 'contracts.delete', 'contracts.edit', 'contracts.expire', 'contracts.module', 'contracts.reactivate', 'contracts.view', 'contracts.view_dashboard', 'contracts.view_lifecycle',
                'employees.add', 'employees.cancel_resign', 'employees.delete', 'employees.department_add', 'employees.department_delete', 'employees.department_edit', 'employees.edit', 'employees.edit_own', 'employees.module', 'employees.position_add', 'employees.position_delete', 'employees.position_edit', 'employees.position_special', 'employees.reset_password', 'employees.resign', 'employees.section_add', 'employees.section_delete', 'employees.section_edit', 'employees.set_credentials', 'employees.view', 'employees.view_dashboard', 'employees.view_department', 'employees.view_org', 'employees.view_position', 'employees.view_section',
                'notifications.email_edit', 'notifications.email_test', 'notifications.email_toggle', 'notifications.inapp_edit', 'notifications.inapp_test', 'notifications.inapp_toggle', 'notifications.logs', 'notifications.module',
                'requests.complete', 'requests.module', 'requests.notify_approved', 'requests.notify_stalled', 'requests.submit', 'requests.view_all',
                'settings.access', 'settings.assets', 'settings.company', 'settings.masterdata', 'settings.requestdata', 'settings.sla',
                'stock.approve', 'stock.fulfill', 'stock.manage_items', 'stock.module', 'stock.receive', 'stock.request', 'stock.return', 'stock.transfer', 'stock.view', 'stock.view_count', 'stock.view_dashboard', 'stock.view_events', 'stock.view_request',
                'system.manage_permissions', 'system.view_audit',
                'tickets.assign', 'tickets.create', 'tickets.edit_own', 'tickets.forward', 'tickets.jobs', 'tickets.level_cctv', 'tickets.level_hardware', 'tickets.level_network', 'tickets.level_other', 'tickets.level_software', 'tickets.level_telephone', 'tickets.module', 'tickets.my', 'tickets.resolve', 'tickets.set_work_class', 'tickets.view_all', 'tickets.view_dashboard',
                'workflows.manage', 'workflows.module',
            ],
            // IT Admin & Document — assets, contracts and the stock room
            'it_stock' => [
                'access.my',
                'assets.delete', 'assets.edit', 'assets.manage', 'assets.module', 'assets.my', 'assets.receive', 'assets.register', 'assets.retire', 'assets.return', 'assets.special', 'assets.transfer', 'assets.view', 'assets.view_dashboard',
                'contracts.alerts', 'contracts.cancel', 'contracts.create', 'contracts.delete', 'contracts.edit', 'contracts.expire', 'contracts.module', 'contracts.reactivate', 'contracts.view', 'contracts.view_dashboard', 'contracts.view_lifecycle',
                'requests.module', 'requests.submit',
                'settings.access', 'settings.assets', 'settings.masterdata',
                'stock.approve', 'stock.fulfill', 'stock.manage_items', 'stock.module', 'stock.receive', 'stock.request', 'stock.return', 'stock.transfer', 'stock.view', 'stock.view_count', 'stock.view_dashboard', 'stock.view_events', 'stock.view_request',
                'tickets.create', 'tickets.my',
            ],
        ];
    }

    /**
     * Stock permission tree used for client cascade and server normalization.
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function stockHierarchy(): array
    {
        return [
            'master' => 'stock.module',
            'groups' => [
                'stock.view_dashboard' => [],
                'stock.view' => ['stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer'],
                'stock.view_request' => ['stock.request', 'stock.approve', 'stock.fulfill'],
                'stock.view_count' => [],
                'stock.view_events' => [],
            ],
        ];
    }

    /**
     * Enforce the stock hierarchy on a granted set: a management child requires its
     * group's view key; every view key requires the master. Non-stock keys pass
     * through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeStock(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::stockHierarchy();

        if (! isset($set[$hierarchy['master']])) {
            return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'stock.')));
        }

        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Employee permission tree used for client cascade and server normalization.
     * `standalone` keys (edit_own — self-service) are never gated by the master.
     *
     * @return array{master: string, standalone: list<string>, groups: array<string, list<string>>}
     */
    public static function employeeHierarchy(): array
    {
        return [
            'master' => 'employees.module',
            'standalone' => ['employees.edit_own'],
            'groups' => [
                'employees.view_dashboard' => [],
                'employees.view' => [
                    'employees.add', 'employees.import', 'employees.edit', 'employees.reset_password',
                    'employees.resign', 'employees.cancel_resign', 'employees.set_credentials', 'employees.delete',
                ],
                'employees.view_section' => ['employees.section_add', 'employees.section_edit', 'employees.section_delete'],
                'employees.view_department' => ['employees.department_add', 'employees.department_edit', 'employees.department_delete'],
                'employees.view_position' => ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
                'employees.view_org' => [],
            ],
        ];
    }

    /**
     * Enforce the employee hierarchy on a granted set: a management child requires its
     * group's view key; every view key requires the master. `standalone` keys survive
     * even when the master is off (edit_own is self-service). Non-employee keys pass
     * through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeEmployees(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::employeeHierarchy();
        $standalone = array_flip($hierarchy['standalone']);

        if (! isset($set[$hierarchy['master']])) {
            return array_values(array_filter(
                $granted,
                fn ($key) => ! str_starts_with($key, 'employees.') || isset($standalone[$key]),
            ));
        }

        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Access Directory permission tree (mirrors the stock/contract shape): the master
     * gates the module + sidebar; each registry's view key gates its tab and reads,
     * and its add/edit/delete children. The edit keys also cover owner/member
     * management for their registry. Overview is a single view key with no children.
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function accessHierarchy(): array
    {
        return [
            'master' => 'access.module',
            'standalone' => ['access.my'],
            'groups' => [
                'access.overview' => [],
                'access.email_view' => ['access.email_add', 'access.email_edit', 'access.email_delete'],
                'access.file_view' => ['access.file_add', 'access.file_edit', 'access.file_delete'],
                'access.social_view' => ['access.social_add', 'access.social_edit', 'access.social_delete'],
                'access.software_view' => ['access.software_add', 'access.software_edit', 'access.software_delete'],
            ],
        ];
    }

    /**
     * Enforce the access hierarchy on a granted set: a management child requires its
     * registry's view key; every view key requires the master. Non-access keys pass
     * through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeAccess(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::accessHierarchy();

        // Without the master, drop every access key except the self-service one: seeing what
        // you yourself may reach is not a registry right.
        if (! isset($set[$hierarchy['master']])) {
            $keep = array_flip($hierarchy['standalone']);

            return array_values(array_filter(
                $granted,
                fn ($key) => ! str_starts_with($key, 'access.') || isset($keep[$key]),
            ));
        }

        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Contract permission tree used for client cascade and server normalization.
     * Mirrors the stock/employee hierarchy: master gates the module + sidebar; each
     * group's view key gates its management children (cascade).
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function contractHierarchy(): array
    {
        return [
            'master' => 'contracts.module',
            'groups' => [
                'contracts.view_dashboard' => [],
                'contracts.view' => ['contracts.create', 'contracts.edit', 'contracts.delete'],
                'contracts.view_lifecycle' => ['contracts.cancel', 'contracts.expire', 'contracts.reactivate'],
                'contracts.alerts' => [],
            ],
        ];
    }

    /**
     * Enforce the contract hierarchy on a granted set: a management child requires its
     * group's view key; every group key requires the master. Non-contract keys pass
     * through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeContracts(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::contractHierarchy();

        if (! isset($set[$hierarchy['master']])) {
            return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'contracts.')));
        }

        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Asset permission tree used for client cascade and server normalization.
     * Mirrors the contract/employee hierarchy: master gates the module + sidebar;
     * each group's view key gates its management children (cascade). The self-service
     * "My Assets" pair (`my` + its child `return`) is `standalone` — it survives even
     * when the master is off, so an ordinary employee can accept/return their own
     * assets without any Assets-module access (like employees.edit_own).
     *
     * @return array{master: string, standalone: array{view: string, children: list<string>}, groups: array<string, list<string>>}
     */
    public static function assetHierarchy(): array
    {
        return [
            'master' => 'assets.module',
            'standalone' => [
                'view' => 'assets.my',
                'children' => ['assets.return'],
            ],
            'groups' => [
                'assets.view_dashboard' => [],
                'assets.view' => ['assets.register', 'assets.edit', 'assets.delete'],
                'assets.manage' => ['assets.transfer', 'assets.receive', 'assets.retire'],
                'assets.special' => ['assets.force_recall', 'assets.cancel_writeoff'],
            ],
        ];
    }

    /**
     * Enforce the asset hierarchy on a granted set: a management child requires its
     * group's view key; every group key requires the master. The self-service pair
     * (`assets.my` + `assets.return`) survives even when the master is off, but
     * `assets.return` still requires `assets.my`. Non-asset keys pass through
     * untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeAssets(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::assetHierarchy();
        $standalone = $hierarchy['standalone'];

        // Self-service is master-independent, but `return` still requires `my`.
        if (! isset($set[$standalone['view']])) {
            foreach ($standalone['children'] as $child) {
                unset($set[$child]);
            }
        }

        // Without the master, drop every asset key except the self-service pair.
        if (! isset($set[$hierarchy['master']])) {
            $keep = array_flip([$standalone['view'], ...$standalone['children']]);

            return array_values(array_filter(
                array_keys($set),
                fn ($key) => ! str_starts_with($key, 'assets.') || isset($keep[$key]),
            ));
        }

        // Master on: a management child requires its group view.
        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Ticket permission tree used for client cascade and server normalization.
     * Master gates the module tabs for staff; the self-service pair
     * (`create` + its child `edit_own`) and the My Tickets tab (`my`) are
     * standalone — an ordinary employee files and tracks their own cases with
     * no staff-side access at all. The `level_*` keys — one per TicketCategory — scope which ticket
     * categories a staff member may see / take / be alerted about (strict: no
     * level = no cases).
     *
     * @return array{master: string, standalone: array{view: string, children: list<string>}, standalone_solo: list<string>, groups: array<string, list<string>>}
     */
    public static function ticketHierarchy(): array
    {
        return [
            'master' => 'tickets.module',
            'standalone' => [
                'view' => 'tickets.create',
                'children' => ['tickets.edit_own'],
            ],
            // Master-independent single switches (no children).
            'standalone_solo' => ['tickets.my'],
            'groups' => [
                'tickets.view_dashboard' => [],
                'tickets.view_all' => ['tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class'],
                'tickets.level_hardware' => [],
                'tickets.level_software' => [],
                'tickets.level_network' => [],
                'tickets.level_cctv' => [],
                'tickets.level_telephone' => [],
                'tickets.level_other' => [],
                'tickets.jobs' => [],
            ],
        ];
    }

    /**
     * Enforce the ticket hierarchy on a granted set: a management child requires
     * its group's view key; every group key requires the master. The self-service
     * keys (`create` + `edit_own`, and `my`) survive without the master, but
     * `edit_own` still requires `create`. Non-ticket keys pass through untouched.
     * Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeTickets(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::ticketHierarchy();
        $standalone = $hierarchy['standalone'];

        // Self-service is master-independent, but `edit_own` still requires `create`.
        if (! isset($set[$standalone['view']])) {
            foreach ($standalone['children'] as $child) {
                unset($set[$child]);
            }
        }

        // Without the master, drop every ticket key except the self-service ones.
        if (! isset($set[$hierarchy['master']])) {
            $keep = array_flip([$standalone['view'], ...$standalone['children'], ...$hierarchy['standalone_solo']]);

            return array_values(array_filter(
                array_keys($set),
                fn ($key) => ! str_starts_with($key, 'tickets.') || isset($keep[$key]),
            ));
        }

        // Master on: a management child requires its group view.
        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Request permission tree. The master gates the module and its sidebar entry; everything
     * else sits flat beneath it.
     *
     * The two notify_* keys deliberately do NOT hang off `complete`. They answer "who hears
     * that a request reached the queue", which is a different question from "who may work
     * that queue" — a manager can want to follow it without closing anything, and the rota
     * that does the closing changes. RequestNotificationService gates on notify_approved
     * alone for the same reason.
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function requestHierarchy(): array
    {
        return [
            'master' => 'requests.module',
            'groups' => [
                'requests.submit' => [],
                'requests.view_all' => [],
                'requests.complete' => [],
                'requests.notify_approved' => [],
                'requests.notify_stalled' => [],
            ],
        ];
    }

    /**
     * Enforce the request gate: without the master, every request key is dropped. Nothing
     * else cascades — see requestHierarchy() on why the notification keys stand alone.
     * Non-request keys pass through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeRequests(array $granted): array
    {
        if (in_array(self::requestHierarchy()['master'], $granted, true)) {
            return $granted;
        }

        return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'requests.')));
    }

    /**
     * Workflow permission tree — the smallest of the family: the master gates the module
     * and its sidebar entry, and the one group under it is the right to change a chain.
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function workflowHierarchy(): array
    {
        return [
            'master' => 'workflows.module',
            'groups' => [
                'workflows.manage' => [],
            ],
        ];
    }

    /**
     * Enforce the workflow gate: without the master, every workflow key is dropped.
     * Non-workflow keys pass through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeWorkflows(array $granted): array
    {
        if (in_array(self::workflowHierarchy()['master'], $granted, true)) {
            return $granted;
        }

        return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'workflows.')));
    }

    /**
     * Email & Notification tree: the master gates the page and its sidebar entry, and the
     * three groups under it are the page's three tabs.
     *
     * Editing the wording and switching a template on are separate rights on purpose. Turning
     * an alert off stops it reaching anybody, which is a decision about who hears what;
     * rewording one is a decision about how it reads. The same hands do not always do both,
     * and the controllers enforce the split by looking at which fields a save actually
     * changed rather than trusting the form that sent it.
     *
     * @return array{master: string, groups: array<string, list<string>>}
     */
    public static function notificationHierarchy(): array
    {
        return [
            'master' => 'notifications.module',
            'groups' => [
                // The Email tab
                'notifications.email_edit' => [],
                'notifications.email_toggle' => [],
                'notifications.email_test' => [],
                // The Notification tab
                'notifications.inapp_edit' => [],
                'notifications.inapp_toggle' => [],
                'notifications.inapp_test' => [],
                // The Logs tab — reading what was sent, which is not the same as changing it.
                'notifications.logs' => [],
            ],
        ];
    }

    /**
     * Enforce the Email & Notification gate: without the master, every notifications key is
     * dropped. Nothing cascades between the groups — each tab's rights stand alone.
     * Other keys pass through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeNotifications(array $granted): array
    {
        if (in_array(self::notificationHierarchy()['master'], $granted, true)) {
            return $granted;
        }

        return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'notifications.')));
    }

    /**
     * Master key gating the Settings module (and its sidebar entry). The
     * per-section keys (settings.company, …) require it — like stock.module.
     */
    public const SETTINGS_MASTER = 'settings.access';

    /**
     * Enforce the settings gate: with the master off, every per-section key is
     * dropped (a section can't be granted without access to the module). Non-
     * settings keys pass through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeSettings(array $granted): array
    {
        if (in_array(self::SETTINGS_MASTER, $granted, true)) {
            return $granted;
        }

        return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'settings.')));
    }
}
