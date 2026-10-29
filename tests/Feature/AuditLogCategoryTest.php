<?php

// Audit Logs category filter: categories match in order and the first match wins.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogCategoryTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function actionsIn(string $category): array
    {
        $page = $this->getJson("/api/audit-logs?category={$category}&per_page=100")->assertOk();
        // One page holds them all
        $this->assertLessThanOrEqual(100, $page->json('meta.total'));

        return collect($page->json('data'))
            ->pluck('action')
            ->sort()
            ->values()
            ->all();
    }

    public function test_own_account_events_count_as_auth_only(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        foreach (['Changed own password', 'Updated own profile', 'Signed in', 'Updated brand', 'Changed username', 'Created brand'] as $action) {
            AuditLog::create(['user_name' => 'Boss', 'action' => $action]);
        }

        $this->assertSame(['Changed own password', 'Signed in', 'Updated own profile'], $this->actionsIn('auth'));
        $this->assertSame(['Changed username', 'Updated brand'], $this->actionsIn('updated'));
        $this->assertSame(['Created brand'], $this->actionsIn('created'));
    }

    /** @return list<string> every action text the app writes with AuditLog::record, read from the source */
    private function actionsInCode(): array
    {
        $actions = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            preg_match_all('/AuditLog::record\(\s*([^,]*?),/s', (string) file_get_contents($file->getPathname()), $calls);
            foreach ($calls[1] as $firstArgument) {
                preg_match_all("/'([A-Z][^']*)'/", $firstArgument, $texts);
                array_push($actions, ...$texts[1]);
            }
        }

        return array_values(array_unique($actions));
    }

    public function test_every_action_the_app_writes_falls_in_exactly_one_category(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $actions = $this->actionsInCode();
        $this->assertGreaterThan(80, count($actions));
        foreach ($actions as $action) {
            AuditLog::create(['user_name' => 'Boss', 'action' => $action]);
        }

        $found = [];
        foreach (['auth', 'created', 'updated', 'deleted', 'access', 'requests', 'tickets', 'assets', 'other'] as $category) {
            foreach ($this->actionsIn($category) as $action) {
                $found[$action][] = $category;
            }
        }

        foreach ($actions as $action) {
            $this->assertCount(1, $found[$action] ?? [], "{$action}: ".implode(', ', $found[$action] ?? ['no category']));
        }
        // Only the system's own housekeeping is left to "other".
        $this->assertSame(['Downloaded report export', 'Expired contract', 'Pruned logs'], $this->actionsIn('other'));
    }

    public function test_each_group_holds_the_actions_it_is_named_for(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $groups = [
            'access' => ['Added member to software', 'Changed file share owner', 'Removed member from email group'],
            'requests' => ['Approved service request step', 'Cancelled stock request', 'Completed request via ticket', 'Filed onboarding requests', 'Fulfilled stock request', 'Rejected service request', 'Submitted service request'],
            'tickets' => ['Assigned ticket', 'Auto-ticket skipped', 'Classified ticket work', 'Forwarded ticket', 'Resolved ticket', 'Took ticket'],
            'assets' => ['Bulk asset writeoff', 'Cancelled asset write-off', 'Committed stock count', 'Force-recalled asset', 'Recalled asset', 'Requested asset return', 'Returned asset to lessor', 'Stock receive', 'Transferred asset', 'Wrote off asset'],
            'updated' => ['Cancelled contract', 'Changed username', 'Paused scheduled report', 'Reactivated contract', 'Reordered request options', 'Resumed scheduled report'],
            'deleted' => ['Deleted scheduled report', 'Removed logo'],
        ];
        foreach (array_merge(...array_values($groups)) as $action) {
            AuditLog::create(['user_name' => 'Boss', 'action' => $action]);
        }

        foreach ($groups as $category => $actions) {
            $this->assertSame($actions, $this->actionsIn($category), $category);
        }
        $this->getJson('/api/audit-logs?category=workflow')->assertUnprocessable();
    }

    public function test_a_duplicated_role_counts_as_created(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        foreach (['Duplicated role', 'Updated role'] as $action) {
            AuditLog::create(['user_name' => 'Boss', 'action' => $action]);
        }

        $this->assertSame(['Duplicated role'], $this->actionsIn('created'));
        $this->assertSame(['Updated role'], $this->actionsIn('updated'));
    }
}
