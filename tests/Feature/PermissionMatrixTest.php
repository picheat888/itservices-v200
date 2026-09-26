<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Tests\TestCase;

/**
 * Keeps the permission matrix honest about what it can actually grant.
 *
 * The screen locks any key missing from the LIVE set in permission-labels.ts and tags
 * it "(Coming soon)", and renders a module only if it is listed in PERM_SECTIONS or
 * ADMIN_GROUPS. Neither omission fails anywhere: requests.submit / view_all / complete
 * were enforced by the API and granted by default to three roles, yet showed as off,
 * locked and unbuilt — and workflows.manage had no switch at all, grantable only by
 * editing the database.
 *
 * Nothing in TypeScript can catch that, because the lists are plain data and the keys
 * they are meant to mirror live in PHP. So the check is here.
 */
class PermissionMatrixTest extends TestCase
{
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

            foreach ([...$calls[1], ...$middleware[1]] as $key) {
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
     * Modules with a hand-built tree component. Those trees decide `locked` themselves
     * and never consult the LIVE set, so their keys are toggleable regardless of it —
     * only the generic card and the admin groups gate on LIVE.
     *
     * Read from the page rather than listed here, so removing a tree makes the module
     * generic and brings its keys back under the check automatically.
     *
     * @return list<string>
     */
    private function modulesWithOwnTree(): array
    {
        $src = (string) file_get_contents(
            resource_path('js/modules/permission/pages/index.tsx')
        );

        preg_match_all("/group\.module === '([a-z_]+)'/", $src, $matches);

        return array_values(array_unique($matches[1]));
    }

    /** Modules the matrix renders a card for. */
    private function renderedModules(): array
    {
        $src = (string) file_get_contents(
            resource_path('js/modules/permission/pages/index.tsx')
        );

        $modules = [];

        // PERM_SECTIONS: modules: ['a', 'b', ...]
        preg_match_all("/modules:\s*\[([^\]]+)\]/", $src, $sections);
        foreach ($sections[1] as $list) {
            preg_match_all("/'([a-z_]+)'/", $list, $names);
            $modules = array_merge($modules, $names[1]);
        }

        // ADMIN_GROUPS carries fully-qualified keys; take their module half.
        preg_match_all("/'([a-z_]+)\.[a-z_]+'/", $src, $adminKeys);
        $modules = array_merge($modules, $adminKeys[1]);

        return array_values(array_unique($modules));
    }

    public function test_every_enforced_permission_can_be_toggled_in_the_matrix(): void
    {
        $enforced = $this->enforcedKeys();
        $this->assertNotEmpty($enforced, 'the scan found no permission checks at all — it has stopped working');

        $exempt = $this->modulesWithOwnTree();
        $live = $this->liveKeys();

        $lockedButEnforced = [];
        foreach ($enforced as $key => $file) {
            [$module] = explode('.', $key);
            if (in_array($module, $exempt, true) || in_array($key, $live, true)) {
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
