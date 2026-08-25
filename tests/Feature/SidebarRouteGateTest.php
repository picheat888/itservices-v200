<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Tests\TestCase;

/**
 * Keeps the sidebar's promise: every menu entry a role can see must open.
 *
 * Two lists decide that, and they live in different files. `nav.ts` says when the
 * icon appears; `App.tsx` says who may render the page behind it. When the two
 * disagree the role sees a menu item that answers with the inline 403 screen —
 * which is how a `workflows.module` holder got a Workflows icon it could not open
 * after the master key was split out of `workflows.manage`.
 *
 * The rule: a route must accept every key its sidebar entry shows the menu for.
 * Wider is fine (a page reachable by URL without a menu entry is a deliberate
 * choice); narrower is always a dead menu item.
 *
 * Nothing in TypeScript catches this — both sides are plain data — so the check
 * is here, beside PermissionMatrixTest which reads the same files for the same
 * reason.
 */
class SidebarRouteGateTest extends TestCase
{
    /**
     * Sidebar entries that gate on permissions: path => the keys that show the icon.
     * Entries gated by role (`roles:`) or ungated ones are left out — they are not
     * permission-driven and the route mirrors them directly.
     *
     * @return array<string, list<string>>
     */
    private function sidebarGates(): array
    {
        $src = (string) file_get_contents(resource_path('js/app/nav.ts'));
        $gates = [];

        // { id: 'x', label: 'y', to: '/path', icon: Z, permission: 'k' }
        // { id: 'x', label: 'y', to: '/path', icon: Z, anyOf: ['a', 'b'] }
        preg_match_all("/to:\s*'\/([a-z-]*)'.*?(?:permission:\s*'([a-z_.]+)'|anyOf:\s*\[([^\]]+)\])/", $src, $items, PREG_SET_ORDER);

        foreach ($items as $item) {
            $path = $item[1];
            $keys = $item[2] !== '' ? [$item[2]] : [];

            if ($keys === [] && isset($item[3])) {
                preg_match_all("/'([a-z_]+\.[a-z_]+)'/", $item[3], $listed);
                $keys = $listed[1];
            }

            if ($keys !== []) {
                $gates[$path] = $keys;
            }
        }

        return $gates;
    }

    /**
     * Routes that gate on permissions: path => the keys RequirePermission accepts.
     *
     * @return array<string, list<string>>
     */
    private function routeGates(): array
    {
        $src = (string) file_get_contents(resource_path('js/app/App.tsx'));
        $gates = [];

        // <Route path="x" element={<RequirePermission anyOf={['a', 'b']}>
        preg_match_all("/path=\"([a-z-]+)\"\s*element=\{\s*<RequirePermission\s+anyOf=\{\[([^\]]*)\]\}/s", $src, $routes, PREG_SET_ORDER);

        foreach ($routes as $route) {
            preg_match_all("/'([a-z_]+\.[a-z_]+)'/", $route[2], $keys);
            $gates[$route[1]] = $keys[1];
        }

        return $gates;
    }

    public function test_every_sidebar_entry_opens_the_page_it_links_to(): void
    {
        $sidebar = $this->sidebarGates();
        $routes = $this->routeGates();

        $this->assertNotEmpty($sidebar, 'the scan found no permission-gated sidebar entries — it has stopped working');
        $this->assertNotEmpty($routes, 'the scan found no permission-gated routes — it has stopped working');

        $dead = [];
        foreach ($sidebar as $path => $keys) {
            if (! isset($routes[$path])) {
                continue;
            }

            $rejected = array_diff($keys, $routes[$path]);
            if ($rejected !== []) {
                $dead[$path] = $rejected;
            }
        }

        $this->assertSame([], $dead, sprintf(
            "these keys show a sidebar entry the route then refuses, so the menu item opens the 403 screen:\n%s",
            implode("\n", array_map(
                fn (string $path) => "  /{$path}   shown by ".implode(', ', $dead[$path]).'   route accepts '.implode(', ', $routes[$path]),
                array_keys($dead),
            )),
        ));
    }

    /** A gate key that no longer exists in the catalog grants nothing and blocks everyone. */
    public function test_every_gate_key_is_a_real_permission(): void
    {
        $catalog = Permissions::all();

        $stale = [];
        foreach (['nav.ts' => $this->sidebarGates(), 'App.tsx' => $this->routeGates()] as $file => $gates) {
            foreach ($gates as $path => $keys) {
                foreach (array_diff($keys, $catalog) as $key) {
                    $stale[] = "  {$key}   gating /{$path} in {$file}";
                }
            }
        }

        $this->assertSame([], $stale, "these gate keys are not in Permissions::all():\n".implode("\n", $stale));
    }
}
