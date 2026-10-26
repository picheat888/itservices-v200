<?php

// Audit Logs list sends its time as system wall-clock time.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AuditLogTimeTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_list_sends_wall_clock_time_not_utc(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->travelTo(Carbon::parse('2026-10-23 10:11:52'));
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Signed in']);

        $row = $this->getJson('/api/audit-logs')->assertOk()->json('data.0');

        $this->assertSame('2026-10-23 10:11', $row['created_at']);
        $this->assertArrayNotHasKey('created_at_iso', $row);
    }
}
