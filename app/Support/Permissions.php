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
            'assets' => ['view', 'register', 'transfer', 'retire', 'edit'],
            'contracts' => ['view', 'create', 'edit', 'import', 'renew', 'alerts'],
            'stock' => [
                'module',
                'view_dashboard', 'view', 'view_request', 'view_count', 'view_events',
                'manage_items', 'receive', 'return', 'transfer',
                'request', 'approve', 'fulfill',
            ],
            'employees' => ['view', 'add', 'import', 'edit', 'edit_own', 'reset_password', 'resign', 'cancel_resign', 'set_credentials'],
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
                'assets.view', 'assets.register', 'assets.transfer', 'assets.retire', 'assets.edit',
                'contracts.view', 'contracts.create', 'contracts.edit', 'contracts.import', 'contracts.renew', 'contracts.alerts',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request', 'stock.approve', 'stock.fulfill', 'stock.receive', 'stock.transfer', 'stock.return',
                'employees.view', 'employees.add', 'employees.import', 'employees.edit',
                'employees.reset_password', 'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
                'access.view', 'access.manage',
                'system.manage_permissions', 'system.manage_roles', 'system.manage_groups',
                'system.view_audit',
            ],
            // HR — full Employee function + own tickets/requests
            'hr' => [
                'employees.view', 'employees.add', 'employees.import', 'employees.edit', 'employees.edit_own',
                'access.view',
                'tickets.create', 'requests.submit',
                'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
                'stock.request',
            ],
            // Employee — own tickets/requests + own profile only
            'user' => [
                'tickets.create', 'requests.submit', 'employees.edit_own',
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
