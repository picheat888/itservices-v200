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
            'contracts' => ['view', 'create', 'edit', 'renew', 'alerts'],
            'employees' => ['view', 'add', 'edit', 'deactivate', 'edit_own', 'reset_password', 'resign', 'set_credentials'],
            'system' => ['manage_roles', 'manage_groups', 'edit_settings', 'configure_notifications', 'view_audit'],
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
                'contracts.view', 'contracts.create', 'contracts.edit', 'contracts.renew', 'contracts.alerts',
                'employees.view', 'employees.add', 'employees.edit',
                'employees.reset_password', 'employees.resign', 'employees.set_credentials',
                'system.view_audit',
            ],
            // HR — full Employee function + own tickets/requests
            'hr' => [
                'employees.view', 'employees.add', 'employees.edit', 'employees.deactivate', 'employees.edit_own',
                'tickets.create', 'requests.submit',
            ],
            // Employee — own tickets/requests + own profile only
            'user' => [
                'tickets.create', 'requests.submit', 'employees.edit_own',
            ],
        ];
    }
}
