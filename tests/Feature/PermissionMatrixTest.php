<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\User;
use App\Support\PermissionLayout;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Keeps the Role Templates matrix honest: every enforced key can be switched on, and every catalogue module has a card.
class PermissionMatrixTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A key is "enforced" once anything refuses a request over it: route middleware,
     * a controller guard, a Form Request, or a service.
     *
     * @return array<string, string> key => the file it is enforced in
     */
    private function enforcedKeys(): array
    {
        $found = [];

        foreach ($this->phpFiles() as $file) {
            $src = (string) file_get_contents($file);
            $short = str_replace(base_path().DIRECTORY_SEPARATOR, '', $file);

            // hasPermission('x.y') and permission:x.y (route middleware, one key per string)
            preg_match_all("/hasPermission\(\s*'([a-z_]+\.[a-z_]+)'/", $src, $calls);
            preg_match_all("/'permission:([a-z_]+\.[a-z_]+)'/", $src, $middleware);
            // Form Request gate(): return 'x.y'
            preg_match_all("/function\s+gate\(\)\s*:\s*string\s*\{\s*return\s+'([a-z_]+\.[a-z_]+)'/", $src, $gates);

            foreach ([...$calls[1], ...$middleware[1], ...$gates[1]] as $key) {
                $found[$key] ??= $short;
            }
        }

        return $found;
    }

    /** Keys the matrix will let an administrator toggle. */
    private function liveKeys(): array
    {
        $src = (string) file_get_contents(
            resource_path('js/modules/permission/lib/permission-labels.ts')
        );

        // The LIVE set literal, up to its closing bracket.
        $set = substr($src, strpos($src, 'const LIVE'));
        $set = substr($set, 0, strpos($set, ']);'));

        preg_match_all("/'([a-z_]+\.[a-z_]+)'/", $set, $matches);

        return $matches[1];
    }

    /**
     * Every key of every card as GET /api/permissions sends them, with whether the card locks it while it is not live.
     *
     * @return array<string, bool> key => true when a coming-soon-aware plain cell holds it
     */
    private function layoutKeys(): array
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        $layout = $this->actingAs($admin)->getJson('/api/permissions')
            ->assertOk()
            ->assertJsonPath('data.layout.0.module', 'dashboard')
            ->json('data.layout');
        $this->assertSame(PermissionLayout::cards(), $layout);

        $keys = [];
        foreach ($layout as $card) {
            if ($card['master'] !== null) {
                $keys[$card['master']['key']] = false;
            }
            foreach ($card['cells'] as $cell) {
                $cellKeys = $cell['kind'] === 'group' ? [$cell['view'], ...$cell['children'], ...$cell['solo']] : $cell['keys'];
                $liveGated = $cell['kind'] === 'plain' && $cell['coming_soon_aware'];
                foreach ($cellKeys as $key) {
                    $keys[$key] = $liveGated;
                }
            }
        }

        return $keys;
    }

    /**
     * Keys the page switches regardless of the LIVE set: every layout key outside a coming-soon-aware plain cell.
     * A catalogue module with no layout card falls to a coming-soon-aware "Other" card, so its keys stay under the check.
     *
     * @return list<string>
     */
    private function keysWithoutLiveGate(): array
    {
        return array_keys(array_filter($this->layoutKeys(), fn (bool $liveGated) => ! $liveGated));
    }

    /**
     * Modules that have a card in the server layout.
     *
     * @return list<string>
     */
    private function renderedModules(): array
    {
        return array_values(array_unique(array_map(
            fn (string $key) => strstr($key, '.', true),
            array_keys($this->layoutKeys()),
        )));
    }

    public function test_every_enforced_permission_can_be_toggled_in_the_matrix(): void
    {
        $enforced = $this->enforcedKeys();
        $this->assertNotEmpty($enforced, 'the scan found no permission checks at all — it has stopped working');
        $this->assertArrayHasKey('system.manage_roles', $enforced, 'the scan no longer reads Form Request gate() keys');
        $this->assertArrayHasKey('system.manage_groups', $enforced, 'the scan no longer reads Form Request gate() keys');

        $exempt = $this->keysWithoutLiveGate();
        $live = $this->liveKeys();

        $lockedButEnforced = [];
        foreach ($enforced as $key => $file) {
            if (in_array($key, $exempt, true) || in_array($key, $live, true)) {
                continue;
            }
            $lockedButEnforced[$key] = $file;
        }

        $this->assertSame([], array_keys($lockedButEnforced), sprintf(
            "these keys are enforced but locked in the permission matrix, so no role can be granted them:\n%s",
            implode("\n", array_map(fn (string $k) => "  {$k}   enforced in {$lockedButEnforced[$k]}", array_keys($lockedButEnforced))),
        ));
    }

    public function test_every_catalog_module_is_rendered_somewhere_in_the_matrix(): void
    {
        $catalogModules = array_keys(Permissions::catalog());
        $missing = array_diff($catalogModules, $this->renderedModules());

        $this->assertSame([], array_values($missing), sprintf(
            "these modules hold permission keys but no card renders them:\n  %s",
            implode("\n  ", $missing),
        ));
    }

    /** Every key the matrix offers must be a real key, or it grants nothing. */
    public function test_the_live_set_holds_no_keys_the_catalog_dropped(): void
    {
        $catalog = Permissions::all();
        $stale = array_diff($this->liveKeys(), $catalog);

        $this->assertSame([], array_values($stale), sprintf(
            "these keys are offered by the matrix but no longer exist in Permissions::all():\n  %s",
            implode("\n  ", $stale),
        ));
    }

    /**
     * Every .php file of the application, where a permission check could live.
     *
     * @return list<string>
     */
    private function phpFiles(): array
    {
        $files = [];

        foreach ([app_path(), base_path('routes')] as $root) {
            $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
            foreach ($it as $entry) {
                /** @var \SplFileInfo $entry */
                if ($entry->isFile() && $entry->getExtension() === 'php') {
                    $files[] = $entry->getPathname();
                }
            }
        }

        return $files;
    }
}
