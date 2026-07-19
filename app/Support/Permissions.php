<?php

namespace App\Support;

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
            'tickets' => ['view_all', 'create', 'assign', 'resolve', 'delete'],
            'requests' => ['submit', 'approve_manager', 'approve_it', 'view_all', 'reject'],
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
            'access' => ['view', 'manage'],
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
     * Default permission grants per role (super omitted = all).
     *
     * @return array<string, list<string>>
     */
    public static function defaults(): array
    {
        return [
            // IT Technician — broad operational access, configurable
            'admin' => [
                'tickets.view_all', 'tickets.create', 'tickets.assign', 'tickets.resolve',
                'requests.submit', 'requests.approve_it', 'requests.view_all', 'requests.reject',
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
                'access.view', 'access.manage',
                'system.manage_permissions', 'system.manage_roles', 'system.manage_groups',
                'system.view_audit',
            ],
            // HR — full Employee function + own tickets/requests
            'hr' => [
                'employees.module', 'employees.view_dashboard', 'employees.view', 'employees.view_org',
                'employees.view_section', 'employees.view_department', 'employees.view_position',
                'employees.add', 'employees.import', 'employees.edit', 'employees.edit_own',
                'access.view',
                'assets.my', 'assets.return',
                'tickets.create', 'requests.submit',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request',
            ],
            // Employee — own tickets/requests + own profile only
            'user' => [
                'tickets.create', 'requests.submit', 'employees.edit_own', 'assets.my', 'assets.return',
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
