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
                'resolve', 'forward', 'assign',
                'level_hardware', 'level_software', 'level_network', 'level_other',
                'create', 'edit_own',
                'my', 'jobs',
            ],
            'requests' => ['submit', 'view_all', 'fulfill'],
            'workflows' => ['manage'],
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
                'add', 'import', 'edit', 'reset_password', 'resign', 'cancel_resign', 'set_credentials',
                'section_add', 'section_edit', 'section_delete',
                'department_add', 'department_edit', 'department_delete',
                'position_add', 'position_edit', 'position_delete', 'position_special',
                'edit_own',
            ],
            'access' => [
                'module',
                'overview',
                'email_view', 'email_add', 'email_edit', 'email_delete',
                'file_view', 'file_add', 'file_edit', 'file_delete',
                'social_view', 'social_add', 'social_edit', 'social_delete',
                'software_view', 'software_add', 'software_edit', 'software_delete',
            ],
            'system' => ['manage_permissions', 'manage_roles', 'manage_groups', 'configure_notifications', 'view_audit'],
            'settings' => ['access', 'company', 'system', 'masterdata', 'email', 'sla', 'assets', 'security'],
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
     * Default permission grants per role (super omitted = all).
     *
     * @return array<string, list<string>>
     */
    public static function defaults(): array
    {
        return [
            // IT Technician — broad operational access, configurable
            'admin' => [
                'tickets.module', 'tickets.view_dashboard', 'tickets.view_all',
                'tickets.resolve', 'tickets.forward', 'tickets.assign',
                'tickets.level_hardware', 'tickets.level_software', 'tickets.level_network', 'tickets.level_other',
                'tickets.create', 'tickets.edit_own', 'tickets.my', 'tickets.jobs',
                'requests.submit', 'requests.view_all', 'requests.fulfill',
                'workflows.manage',
                'assets.module', 'assets.view_dashboard', 'assets.view', 'assets.register', 'assets.edit',
                'assets.manage', 'assets.transfer', 'assets.receive', 'assets.retire',
                'assets.my', 'assets.return',
                // Asset hard delete + Special access (force recall / cancel write-off) stay super-only by default.
                // Contract Lifecycle (cancel/expire/reactivate) and hard delete stay super-only by default.
                'contracts.module', 'contracts.view_dashboard', 'contracts.view',
                'contracts.create', 'contracts.edit', 'contracts.import', 'contracts.alerts',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request', 'stock.approve', 'stock.fulfill', 'stock.receive', 'stock.transfer', 'stock.return',
                'employees.module', 'employees.view_dashboard', 'employees.view', 'employees.view_org',
                'employees.view_section', 'employees.view_department', 'employees.view_position',
                'employees.add', 'employees.import', 'employees.edit',
                'employees.reset_password', 'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
                'access.module', 'access.overview',
                'access.email_view', 'access.email_add', 'access.email_edit', 'access.email_delete',
                'access.file_view', 'access.file_add', 'access.file_edit', 'access.file_delete',
                'access.social_view', 'access.social_add', 'access.social_edit', 'access.social_delete',
                'access.software_view', 'access.software_add', 'access.software_edit', 'access.software_delete',
                'system.manage_permissions', 'system.manage_roles', 'system.manage_groups',
                'system.view_audit',
            ],
            // HR — full Employee function + own tickets/requests
            'hr' => [
                'employees.module', 'employees.view_dashboard', 'employees.view', 'employees.view_org',
                'employees.view_section', 'employees.view_department', 'employees.view_position',
                'employees.add', 'employees.import', 'employees.edit', 'employees.edit_own',
                'access.module', 'access.overview',
                'access.email_view', 'access.file_view', 'access.social_view', 'access.software_view',
                'assets.my', 'assets.return',
                'tickets.create', 'tickets.edit_own', 'tickets.my', 'requests.submit',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request',
            ],
            // Employee — own tickets/requests + own profile only
            'user' => [
                'tickets.create', 'tickets.edit_own', 'tickets.my', 'requests.submit', 'employees.edit_own', 'assets.my', 'assets.return',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request',
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
                    'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
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

        if (! isset($set[$hierarchy['master']])) {
            return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'access.')));
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
                'contracts.view' => ['contracts.create', 'contracts.edit', 'contracts.delete', 'contracts.import'],
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
     * no staff-side access at all. The four `level_*` keys scope which ticket
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
                'tickets.view_all' => ['tickets.resolve', 'tickets.forward', 'tickets.assign'],
                'tickets.level_hardware' => [],
                'tickets.level_software' => [],
                'tickets.level_network' => [],
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
