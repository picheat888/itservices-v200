<?php

// The Role Templates card layout the server sends with GET /api/permissions: which keys sit in which card, cell and group.
// Children and their order come from Permissions::*Hierarchy(); this file adds only the look (chip, cluster, notes, set headings).

namespace App\Support;

class PermissionLayout
{
    /**
     * Every card of the matrix in page order. A card is
     * array{module, master: ?array{key, sub}, note, cells: list<Cell>}; a cell is one of
     * array{kind: 'general', keys}
     * | array{kind: 'group', view, children, chip, outside_master, cluster: ?array{title, hint}, fill_on_grant, note, solo}
     * | array{kind: 'set', label, hint, keys}
     * | array{kind: 'plain', keys, coming_soon_aware}.
     *
     * @return list<array{module: string, master: ?array{key: string, sub: ?string}, note: ?string, cells: list<array<string, mixed>>}>
     */
    public static function cards(): array
    {
        $tickets = Permissions::ticketHierarchy();
        $ticketGroups = $tickets['groups'];
        $levels = array_values(array_filter(array_keys($ticketGroups), fn (string $key) => str_starts_with($key, 'tickets.level_')));
        $ticketGeneral = array_values(array_filter(
            array_keys($ticketGroups),
            fn (string $key) => $ticketGroups[$key] === [] && ! in_array($key, $levels, true),
        ));

        $requests = Permissions::requestHierarchy()['groups'];
        $reportTools = ['reports.export', 'reports.schedule', 'reports.schedule_manage'];
        $reportDomains = array_values(array_diff(array_keys(Permissions::reportHierarchy()['groups']), $reportTools));

        return [
            self::card('dashboard', null, [self::plain(self::moduleKeys('dashboard'), true)]),
            self::card('tickets', ['tickets.module', null], [
                self::general($ticketGeneral),
                self::group('tickets.view_all', $ticketGroups['tickets.view_all']),
                self::set('perm_ui_tickets_level', 'perm_ui_tickets_level_hint', $levels),
                self::group($tickets['standalone']['view'], $tickets['standalone']['children'], [
                    'chip' => false,
                    'outside_master' => true,
                    'note' => 'perm_ui_self_service',
                    'solo' => $tickets['standalone_solo'],
                ]),
            ]),
            self::card('requests', ['requests.module', null], [
                self::general(['requests.complete']),
                self::group('requests.submit', $requests['requests.submit'], [
                    'chip' => false,
                    'cluster' => ['title' => 'perm_ui_request_types', 'hint' => 'perm_ui_request_types_hint'],
                    'fill_on_grant' => true,
                ]),
                self::group('requests.view_all', $requests['requests.view_all'], ['chip' => false]),
                self::set('perm_ui_notifications', 'perm_ui_request_notify_hint', ['requests.notify_approved', 'requests.notify_stalled']),
            ]),
            self::treeCard('assets', Permissions::assetHierarchy(), ['assets.manage', 'assets.special']),
            self::treeCard('contracts', Permissions::contractHierarchy(), ['contracts.view_lifecycle']),
            self::treeCard('stock', Permissions::stockHierarchy()),
            self::treeCard('employees', Permissions::employeeHierarchy()),
            self::treeCard('access', Permissions::accessHierarchy()),
            self::card('profile', null, [self::plain(self::moduleKeys('profile'), false)], 'perm_ui_self_service_all'),
            self::card('reports', ['reports.module', null], [
                self::set('perm_ui_group_report_domains', null, $reportDomains),
                self::set('perm_ui_group_report_tools', null, $reportTools),
            ]),
            self::card('workflows', ['workflows.module', null], [
                self::set('perm_ui_group_workflows', null, array_keys(Permissions::workflowHierarchy()['groups'])),
            ]),
            self::card('permissions', [Permissions::SYSTEM_MASTER, 'perm_ui_permissions_card_sub'], [
                self::plain(array_values(array_diff(self::moduleKeys('system'), [Permissions::SYSTEM_MASTER])), true),
            ]),
            self::card('notifications', ['notifications.module', null], [
                self::general(['notifications.logs']),
                self::set('perm_ui_group_email', null, ['notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test']),
                self::set('perm_ui_group_inapp', null, ['notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test']),
            ]),
            self::card('settings', [Permissions::SETTINGS_MASTER, 'perm_ui_settings_card_sub'], [
                self::plain(array_values(array_diff(self::moduleKeys('settings'), [Permissions::SETTINGS_MASTER])), true),
            ]),
        ];
    }

    /**
     * A module's catalogue keys in catalogue order.
     *
     * @return list<string>
     */
    private static function moduleKeys(string $module): array
    {
        return array_values(array_filter(Permissions::all(), fn (string $key) => str_starts_with($key, "{$module}.")));
    }

    /**
     * A tree module's card: childless view keys in the general cell, then one group cell per view key with children.
     *
     * @param  array{master: string, groups: array<string, list<string>>}  $hierarchy
     * @param  list<string>  $noChip  groups drawn without the view chip
     * @return array{module: string, master: ?array{key: string, sub: ?string}, note: ?string, cells: list<array<string, mixed>>}
     */
    private static function treeCard(string $module, array $hierarchy, array $noChip = []): array
    {
        $general = array_keys(array_filter($hierarchy['groups'], fn (array $children) => $children === []));
        $cells = [self::general($general)];
        foreach ($hierarchy['groups'] as $view => $children) {
            if ($children !== []) {
                $cells[] = self::group($view, $children, ['chip' => ! in_array($view, $noChip, true)]);
            }
        }

        return self::card($module, [$hierarchy['master'], null], $cells);
    }

    /**
     * @param  ?array{0: string, 1: ?string}  $master
     * @param  list<array<string, mixed>>  $cells
     * @return array{module: string, master: ?array{key: string, sub: ?string}, note: ?string, cells: list<array<string, mixed>>}
     */
    private static function card(string $module, ?array $master, array $cells, ?string $note = null): array
    {
        return [
            'module' => $module,
            'master' => $master === null ? null : ['key' => $master[0], 'sub' => $master[1]],
            'note' => $note,
            'cells' => $cells,
        ];
    }

    /**
     * @param  list<string>  $keys
     * @return array{kind: 'general', keys: list<string>}
     */
    private static function general(array $keys): array
    {
        return ['kind' => 'general', 'keys' => $keys];
    }

    /**
     * @param  list<string>  $children
     * @param  array<string, mixed>  $look  overrides of the default look
     * @return array<string, mixed>
     */
    private static function group(string $view, array $children, array $look = []): array
    {
        return [
            'kind' => 'group',
            'view' => $view,
            'children' => $children,
            'chip' => true,
            'outside_master' => false,
            'cluster' => null,
            'fill_on_grant' => false,
            'note' => null,
            'solo' => [],
            ...$look,
        ];
    }

    /**
     * @param  list<string>  $keys
     * @return array{kind: 'set', label: string, hint: ?string, keys: list<string>}
     */
    private static function set(string $label, ?string $hint, array $keys): array
    {
        return ['kind' => 'set', 'label' => $label, 'hint' => $hint, 'keys' => $keys];
    }

    /**
     * @param  list<string>  $keys
     * @return array{kind: 'plain', keys: list<string>, coming_soon_aware: bool}
     */
    private static function plain(array $keys, bool $comingSoonAware): array
    {
        return ['kind' => 'plain', 'keys' => $keys, 'coming_soon_aware' => $comingSoonAware];
    }
}
