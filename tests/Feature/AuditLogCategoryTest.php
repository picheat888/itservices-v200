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
        return collect($this->getJson("/api/audit-logs?category={$category}")->assertOk()->json('data'))
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
}
