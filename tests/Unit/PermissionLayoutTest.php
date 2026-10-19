<?php

// Holds the server's Role Templates card layout to the catalogue, the save rules and tests/Fixtures/permission-layout.json.

namespace Tests\Unit;

use App\Support\PermissionLayout;
use App\Support\Permissions;
use PHPUnit\Framework\TestCase;

class PermissionLayoutTest extends TestCase
{
    private const FIXTURE = __DIR__.'/../Fixtures/permission-layout.json';

    /** Card module => its hierarchy method on Permissions. */
    private const TREES = [
        'stock' => 'stockHierarchy',
        'employees' => 'employeeHierarchy',
        'access' => 'accessHierarchy',
        'contracts' => 'contractHierarchy',
        'assets' => 'assetHierarchy',
        'tickets' => 'ticketHierarchy',
        'requests' => 'requestHierarchy',
        'workflows' => 'workflowHierarchy',
        'notifications' => 'notificationHierarchy',
        'reports' => 'reportHierarchy',
    ];

    public function test_every_catalogue_key_sits_in_exactly_one_card(): void
    {
        $flattened = [];
        foreach (PermissionLayout::cards() as $card) {
            if ($card['master'] !== null) {
                $flattened[] = $card['master']['key'];
            }
            foreach ($card['cells'] as $cell) {
                if ($cell['kind'] === 'group') {
                    array_push($flattened, $cell['view'], ...$cell['children'], ...$cell['solo']);
                } else {
                    array_push($flattened, ...$cell['keys']);
                }
            }
        }

        $this->assertSame([], array_keys(array_filter(array_count_values($flattened), fn (int $count) => $count > 1)), 'a key sits in two places');

        $expected = Permissions::all();
        sort($expected);
        sort($flattened);
        $this->assertSame($expected, $flattened);
    }

    public function test_group_children_match_the_save_rules(): void
    {
        $cards = array_column(PermissionLayout::cards(), null, 'module');

        foreach (self::TREES as $module => $method) {
            $hierarchy = Permissions::$method();
            $expected = $hierarchy['groups'];
            if (isset($hierarchy['standalone'])) {
                $expected[$hierarchy['standalone']['view']] = $hierarchy['standalone']['children'];
            }

            foreach ($cards[$module]['cells'] as $cell) {
                if ($cell['kind'] === 'group') {
                    $this->assertSame($expected[$cell['view']], $cell['children'], "{$module}: {$cell['view']} children differ from the hierarchy");
                }
            }
        }
    }

    public function test_the_fixture_matches_the_layout(): void
    {
        $cards = PermissionLayout::cards();

        // UPDATE_PERMISSION_LAYOUT=1 rewrites the fixture after a deliberate layout change
        if (getenv('UPDATE_PERMISSION_LAYOUT') === '1') {
            file_put_contents(self::FIXTURE, json_encode($cards, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
        }

        $this->assertFileExists(self::FIXTURE);
        $this->assertSame(
            json_decode((string) json_encode($cards), true),
            json_decode((string) file_get_contents(self::FIXTURE), true),
            'The card layout changed: rerun with UPDATE_PERMISSION_LAYOUT=1 after checking the Role Templates page.',
        );
    }
}
