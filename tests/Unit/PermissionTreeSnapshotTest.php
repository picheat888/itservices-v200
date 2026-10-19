<?php

// The server's permission trees, pinned in tests/Fixtures/permission-trees.json; tests/js/permission-tree-parity.test.ts holds the Role Templates cards to the same file.

namespace Tests\Unit;

use App\Support\Permissions;
use PHPUnit\Framework\TestCase;

class PermissionTreeSnapshotTest extends TestCase
{
    private const FIXTURE = __DIR__.'/../Fixtures/permission-trees.json';

    /** Module prefix => its hierarchy method on Permissions. */
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

    public function test_the_fixture_matches_the_server_trees(): void
    {
        $trees = $this->serverTrees();

        // UPDATE_PERMISSION_TREES=1 rewrites the fixture after a deliberate tree change
        if (getenv('UPDATE_PERMISSION_TREES') === '1') {
            file_put_contents(self::FIXTURE, json_encode($trees, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
        }

        $this->assertFileExists(self::FIXTURE);
        $this->assertSame(
            $trees,
            json_decode((string) file_get_contents(self::FIXTURE), true),
            'A permission tree changed: update permission-specs.ts to match, then rerun with UPDATE_PERMISSION_TREES=1.',
        );
    }

    public function test_every_catalogue_key_of_a_tree_module_sits_in_its_tree(): void
    {
        foreach ($this->serverTrees() as $module => $tree) {
            $catalogue = array_values(array_filter(Permissions::all(), fn (string $key) => str_starts_with($key, "{$module}.")));
            sort($catalogue);

            $this->assertSame($catalogue, $tree['keys'], "{$module}: the catalogue and the tree list different keys");
        }
    }

    /**
     * Each tree as its master, every key it holds, and the key each child depends on.
     *
     * @return array<string, array{master: string, keys: list<string>, parents: array<string, string>}>
     */
    private function serverTrees(): array
    {
        $trees = [];
        foreach (self::TREES as $module => $method) {
            $hierarchy = Permissions::$method();
            $keys = [$hierarchy['master']];
            $parents = [];

            $branches = $hierarchy['groups'];
            if (isset($hierarchy['standalone'])) {
                $branches[$hierarchy['standalone']['view']] = $hierarchy['standalone']['children'];
            }
            foreach ($hierarchy['standalone_solo'] ?? [] as $solo) {
                $branches[$solo] = [];
            }

            foreach ($branches as $view => $children) {
                $keys[] = $view;
                foreach ($children as $child) {
                    $keys[] = $child;
                    $parents[$child] = $view;
                }
            }

            sort($keys);
            ksort($parents);
            $trees[$module] = ['master' => $hierarchy['master'], 'keys' => $keys, 'parents' => $parents];
        }

        return $trees;
    }
}
